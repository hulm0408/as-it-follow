// ============================================================================
// JSON ACCOUNT ORDER ANALYZER (WITH ORGANIZED MONOSPACE HISTORY)
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
// - Extracts Order ID, Order Value (amount), and When Placed (timestamp).
// - Renders in organized monospace table (<pre><code>) with Telegram copy icon.
// - IF orders > 0: sends organized monospace card AND returns the .json file.
// - IF orders === 0: DOES NOT return the file.
// ============================================================================

import { normalizeSwiggySessionPayload } from './store.js';
import { dapiFetch } from './swiggy-cart.js';

export function formatOrderDate(raw) {
  if (!raw) return 'N/A';
  if (typeof raw === 'string' && (raw.includes('AM') || raw.includes('PM') || /[A-Za-z]{3}\s+\d/.test(raw))) {
    return raw.trim();
  }
  let date;
  if (typeof raw === 'number') {
    date = new Date(raw < 1e11 ? raw * 1000 : raw);
  } else if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const num = Number(raw.trim());
    date = new Date(num < 1e11 ? num * 1000 : num);
  } else {
    date = new Date(raw);
  }
  if (isNaN(date.getTime())) return String(raw).slice(0, 19);

  // e.g. "05 Nov, 08:30 PM"
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const timeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  return `${day} ${month}, ${timeStr}`;
}

export function formatOrderValue(raw) {
  if (raw === undefined || raw === null || raw === '') return 'N/A';
  const num = Number(raw);
  if (!Number.isFinite(num)) return `₹${raw}`;
  return `₹${Math.round(num)}`;
}

/**
 * Formats the organized monospace order history card.
 */
export function formatOrderHistoryMonospace({ fileName, phone, orderCount, orders }) {
  const lines = [
    `ACCOUNT  : ${phone || 'Unknown'}`,
    `FILE     : ${fileName || 'account.json'}`,
    `ORDERS   : ${orderCount}`
  ];

  if (Array.isArray(orders) && orders.length > 0) {
    lines.push('----------------------------------');
    for (const o of orders) {
      lines.push(`ORDER ID : #${o.id}`);
      lines.push(`VALUE    : ${formatOrderValue(o.value)}`);
      lines.push(`PLACED   : ${formatOrderDate(o.placedAt)}`);
      lines.push('----------------------------------');
    }
  }

  return `<pre><code>${lines.join('\n')}</code></pre>`;
}

/**
 * Deep recursive search for any order objects in the JSON tree.
 */
function findOrdersDeep(obj, seen = new Set(), orders = []) {
  if (!obj || typeof obj !== 'object') return orders;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      findOrdersDeep(item, seen, orders);
    }
    return orders;
  }

  const parentStatus = String(obj.order_status || obj.status || obj.post_status || '').toLowerCase();
  const isFailed = /failed|cancelled|canceled/.test(parentStatus);

  for (const [key, val] of Object.entries(obj)) {
    const k = key.toLowerCase();

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
          orders.push({
            id: str,
            value: obj.order_total || obj.orderTotal || obj.total || obj.finalPayable || obj.amount || obj.order_amount || null,
            placedAt: obj.order_time || obj.orderTime || obj.placed_at || obj.placedAt || obj.order_placed_time || obj.created_at || obj.createdAt || obj.order_date || null
          });
        }
      }
    }

    if (typeof val === 'string' && val.length >= 10 && val.length <= 25 && /^\d+$/.test(val)) {
      if (k.includes('order') && !k.includes('count') && !seen.has(val)) {
        if (!isFailed) {
          seen.add(val);
          orders.push({
            id: val,
            value: obj.order_total || obj.orderTotal || obj.total || null,
            placedAt: obj.order_time || obj.orderTime || obj.created_at || null
          });
        }
      }
    }

    if (val && typeof val === 'object') {
      findOrdersDeep(val, seen, orders);
    }
  }

  return orders;
}

/**
 * Analyzes parsed JSON account data to extract phone, order count, and detailed orders list.
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
  const orders = [];

  function addOrder({ id, value = null, placedAt = null }) {
    if (!id) return;
    const str = String(id).trim().replace(/^#/, '');
    if (str && !seenIds.has(str)) {
      seenIds.add(str);
      orders.push({
        id: str,
        value,
        placedAt
      });
    }
  }

  // 2. Deep search for any embedded orders in JSON tree
  const embeddedOrders = findOrdersDeep(parsed, seenIds, orders);

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

  // 4. Live Swiggy Multi-Channel Probing
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

      const processOrders = (res) => {
        const list = Array.isArray(res?.json?.data?.orders) ? res.json.data.orders : [];
        for (const o of list) {
          const st = String(o?.order_status || o?.post_status || '').toLowerCase();
          if (/failed|cancelled|canceled/.test(st)) continue;
          const oid = o?.order_id || o?.id;
          if (oid) {
            addOrder({
              id: oid,
              value: o?.order_total || o?.order_total_amount || o?.net_total || o?.orderTotal || null,
              placedAt: o?.order_time || o?.order_time_in_epoch || o?.order_date || o?.created_at || null
            });
          }
        }
      };

      processOrders(foodRes);
      processOrders(imRes);
      processOrders(genieRes);
      processOrders(dineRes);

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

  const finalOrderCount = Math.max(orders.length, claimCount);
  const hasOrders = finalOrderCount > 0;
  const orderIds = orders.map(o => o.id);

  return {
    phone,
    orderCount: finalOrderCount,
    orderIds,
    orders,
    hasOrders
  };
}
