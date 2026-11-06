// ============================================================================
// JSON ACCOUNT ORDER ANALYZER
// ----------------------------------------------------------------------------
// Analyzes uploaded Swiggy JSON accounts/sessions:
// - Extracts internal orders & order numbers (both from JSON and live Swiggy API)
// - Determines exact order count and specific order IDs
// - IF orders > 0: sends order summary AND sends the file back
// - IF orders === 0: DOES NOT send the file back (per boss/user requirement)
// ============================================================================

import { normalizeSwiggySessionPayload } from './store.js';
import { dapiFetch } from './swiggy-cart.js';

/**
 * Analyzes parsed JSON account data to extract phone, order count, and exact order IDs.
 * @param {object|array} parsed - The parsed JSON data
 * @param {string} rawText - Original string content
 * @returns {Promise<{ phone: string, orderCount: number, orderIds: string[], hasOrders: boolean }>}
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

  const orderIds = [];
  const seenIds = new Set();

  function addOrderId(rawId) {
    if (!rawId) return;
    const str = String(rawId).trim().replace(/^#/, '');
    if (str && !seenIds.has(str)) {
      seenIds.add(str);
      orderIds.push(str);
    }
  }

  // 2. Extract internal orders embedded in JSON
  const candidates = [
    target?.orders,
    target?.data?.orders,
    target?.past_orders,
    target?.pastOrders,
    target?.order_history,
    target?.orderHistory,
    target?.order_ids,
    target?.orderIds,
    target?.recentOrders
  ];

  for (const list of candidates) {
    if (Array.isArray(list)) {
      for (const item of list) {
        if (!item) continue;
        if (typeof item === 'string' || typeof item === 'number') {
          addOrderId(item);
        } else if (typeof item === 'object') {
          const status = String(item.order_status || item.status || item.post_status || '').toLowerCase();
          if (/failed|cancelled|canceled/.test(status)) continue;
          const id = item.order_id || item.id || item.orderId || item.number || item.order_number;
          if (id) addOrderId(id);
        }
      }
    }
  }

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

  // 4. If 0 orders found from embedded data, probe live Swiggy API if session tokens exist
  const normalized = normalizeSwiggySessionPayload(target);
  if (normalized && (normalized.cookies || normalized.tid || normalized.token || normalized._session_tid)) {
    try {
      const res = await dapiFetch(normalized, 'order/all', { timeoutMs: 6500 }).catch(() => null);
      const apiOrders = Array.isArray(res?.json?.data?.orders) ? res.json.data.orders : [];
      if (apiOrders.length > 0) {
        for (const o of apiOrders) {
          const st = String(o?.order_status || o?.post_status || '').toLowerCase();
          if (/failed|cancelled|canceled/.test(st)) continue;
          const oid = o?.order_id || o?.id;
          if (oid) addOrderId(oid);
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
    hasOrders
  };
}
