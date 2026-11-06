// ============================================================================
// JSON ACCOUNT ORDER ANALYZER (WITH INCOGNITO & MULTI-DELIVERY SUPPORT)
// ----------------------------------------------------------------------------
// Analyzes uploaded Swiggy JSON accounts/sessions:
// - Deep-scans embedded JSON trees for order traces (incognito dumps,
//   active orders, checkout session state, order history).
// - Probes live Swiggy APIs across all channels in parallel:
//   * Regular Food (/order/all)
//   * Instamart (/order/all?deliveryType=INSTAMART)
//   * Genie (/order/all?deliveryType=GENIE)
//   * Dineout (/order/all?deliveryType=DINEOUT)
//   * User Profile (/profile/info)
// - Validates order status: keeps placed, in-progress, and delivered orders.
// - IF orders > 0: shows exact order count & order IDs, and sends the file back.
// - IF orders === 0: DOES NOT send the file back (per boss/user requirement).
// ============================================================================

import { normalizeSwiggySessionPayload } from './store.js';
import { dapiFetch } from './swiggy-cart.js';

/**
 * Deep recursive search for any order ID stored in the JSON tree,
 * including incognito localStorage dumps, active orders, or checkout states.
 */
function findOrderIdsDeep(obj, seen = new Set(), orderIds = []) {
  if (!obj || typeof obj !== 'object') return orderIds;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      findOrderIdsDeep(item, seen, orderIds);
    }
    return orderIds;
  }

  // Check parent status if present
  const parentStatus = String(obj.order_status || obj.status || obj.post_status || '').toLowerCase();
  const isFailed = /failed|cancelled|canceled/.test(parentStatus);

  for (const [key, val] of Object.entries(obj)) {
    const k = key.toLowerCase();

    // Key match for order IDs
    const isOrderKey =
      k === 'order_id' ||
      k === 'orderid' ||
      k === 'swiggy_order_id' ||
      k === 'swiggyorderid' ||
      k === 'last_order_id' ||
      k === 'lastorderid' ||
      k === 'active_order_id' ||
      k === 'activeorderid' ||
      k === 'pending_order_id' ||
      k === 'ordernumber' ||
      k === 'order_number';

    if (isOrderKey && !isFailed) {
      if (val && (typeof val === 'string' || typeof val === 'number')) {
        const str = String(val).trim().replace(/^#/, '');
        if (str && str.length >= 6 && !seen.has(str)) {
          seen.add(str);
          orderIds.push(str);
        }
      }
    }

    // Also check string values in localStorage-like maps e.g. "swiggy_last_order": "251838950110925"
    if (typeof val === 'string' && val.length >= 10 && val.length <= 25 && /^\d+$/.test(val)) {
      if (k.includes('order') && !k.includes('count') && !seen.has(val)) {
        if (!isFailed) {
          seen.add(val);
          orderIds.push(val);
        }
      }
    }

    // Recurse into nested objects
    if (val && typeof val === 'object') {
      findOrderIdsDeep(val, seen, orderIds);
    }
  }

  return orderIds;
}

/**
 * Analyzes parsed JSON account data to extract phone, order count, and exact order IDs.
 * Fully supports incognito orders, active orders, and live multi-channel queries.
 * @param {object|array} parsed - The parsed JSON data
 * @param {string} rawText - Original string content
 * @returns {Promise<{ phone: string, orderCount: number, orderIds: string[], hasOrders: boolean, channels: string[] }>}
 */
export async function analyzeJsonAccountOrders(parsed, rawText = '') {
  let target = parsed;
  if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'object') {
    target = parsed[0];
  } else if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    target = parsed.data;
  }

  // 1. Identify phone / account ID
  let phone = target?.phone || target?.mobile || target?.customerId || target?.userId || '';
  if (!phone && typeof rawText === 'string') {
    const m = rawText.match(/(?:phone|mobile)["']?\s*:\s*["']?([6789]\d{9})["']?/i);
    if (m) phone = m[1];
  }
  if (!phone && target?.name) {
    phone = target.name;
  }
  if (!phone) {
    phone = 'Swiggy Account';
  }

  const seenIds = new Set();
  const orderIds = [];
  const channels = new Set();

  function addOrderId(rawId, channel = 'Food') {
    if (!rawId) return;
    const str = String(rawId).trim().replace(/^#/, '');
    if (str && !seenIds.has(str)) {
      seenIds.add(str);
      orderIds.push(str);
      if (channel) channels.add(channel);
    }
  }

  // 2. Deep search for any embedded order traces (incognito dumps, active orders, localStorage)
  findOrderIdsDeep(parsed, seenIds, orderIds);
  if (orderIds.length > 0) channels.add('Embedded');

  // 3. Extract order count claims if present in JSON
  const explicitCounts = [
    target?.totalOrdersCount,
    target?.cachedTotalOrdersCount,
    target?.orderCount,
    target?.ordersCount,
    target?.total_orders,
    target?.orders_count
  ].filter(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v !== 999999);

  let claimCount = explicitCounts.length > 0 ? Math.max(...explicitCounts) : 0;

  // 4. Live Swiggy Multi-Channel Probing (Food, Instamart, Genie, Dineout, Profile)
  const normalized = normalizeSwiggySessionPayload(target);
  if (normalized && (normalized.cookies || normalized.tid || normalized.token || normalized._session_tid)) {
    try {
      const [foodRes, imRes, genieRes, dineRes, profRes] = await Promise.all([
        dapiFetch(normalized, 'order/all', { timeoutMs: 6000 }).catch(() => null),
        dapiFetch(normalized, 'order/all?order_id=&deliveryType=INSTAMART', { timeoutMs: 6000 }).catch(() => null),
        dapiFetch(normalized, 'order/all?order_id=&deliveryType=GENIE', { timeoutMs: 6000 }).catch(() => null),
        dapiFetch(normalized, 'order/all?order_id=&deliveryType=DINEOUT', { timeoutMs: 6000 }).catch(() => null),
        dapiFetch(normalized, 'profile/info', { timeoutMs: 5000 }).catch(() => null)
      ]);

      const processOrders = (res, channelName) => {
        const list = Array.isArray(res?.json?.data?.orders) ? res.json.data.orders : [];
        for (const o of list) {
          const st = String(o?.order_status || o?.post_status || '').toLowerCase();
          if (/failed|cancelled|canceled/.test(st)) continue;
          const oid = o?.order_id || o?.id;
          if (oid) addOrderId(oid, channelName);
        }
      };

      processOrders(foodRes, 'Food');
      processOrders(imRes, 'Instamart');
      processOrders(genieRes, 'Genie');
      processOrders(dineRes, 'Dineout');

      // Check profile info for order count
      const profData = profRes?.json?.data;
      if (profData) {
        if (profData.mobile && !phone) phone = profData.mobile;
        const profCount = Number(profData.total_orders || profData.orders_count || profData.totalOrdersCount);
        if (Number.isFinite(profCount) && profCount > claimCount) {
          claimCount = profCount;
        }
      }
    } catch (_) {}
  }

  const finalOrderCount = Math.max(orderIds.length, claimCount);
  const hasOrders = finalOrderCount > 0;

  return {
    phone,
    orderCount: finalOrderCount,
    orderIds,
    hasOrders,
    channels: Array.from(channels)
  };
}
