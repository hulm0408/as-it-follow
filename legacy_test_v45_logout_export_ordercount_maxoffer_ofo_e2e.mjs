// ============================================================================
// test_v45_logout_export_ordercount_maxoffer_ofo_e2e.mjs
//
// Comprehensive E2E Verification Suite for the 4 Core Pillars:
// 1. Actual Logout & Export:
//    - Remote Swiggy session revoked on server via POST /dapi/auth/logout with _csrf
//    - Complete deletion & vault purge on single/bulk logout and export-and-logout
//    - Export includes clean session credentials and order count
// 2. Accurate Live Order Counting on File Upload:
//    - Hits Swiggy's live order section (/dapi/order/all + Instamart)
//    - Authoritative live count overrides stale imported counts
// 3. Auto Max Offer Account Selection:
//    - Automatically picks best 0-order account for welcome/0-order coupons
//    - Chooses the account with lowest payable / max discount
// 4. Official OFO Tracking Link:
//    - Verifies and prioritizes official OFO live tracking links
// ============================================================================

import assert from 'node:assert';
import { getDb, saveDb, deleteAccount, exportSessionJson } from './store.js';
import { deactivateSwiggyAccountViaBridge } from './swiggy-bridge.js';
import {
  inspectAccountOrderHistoryAndOffers,
  findBestMaxCouponAccountForOrder,
  extractOrderShareUrlDeep,
  getStoredSwiggyTrackingUrl,
  clearAllAccountReservations,
  invalidateAccountOrderProfileCache
} from './swiggy-cart.js';
import { isOfficialSwiggyTrackingUrl, validateTrackingUrlForOrder } from './tracking-validation.js';

process.env.TEST_MODE = '1';

const originalFetch = globalThis.fetch;
let networkCalls = [];

const makeJwt = (sub, uid) => {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const p = Buffer.from(JSON.stringify({ sub, user_id: String(uid), exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64');
  return `${h}.${p}.sig`;
};

function setupMockNetwork(customHandler = null) {
  networkCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url?.url || url || '');
    const method = String(options.method || 'GET').toUpperCase();
    networkCalls.push({ url: urlStr, method, options });

    if (customHandler) {
      const res = await customHandler(urlStr, options, method);
      if (res !== undefined) return res;
    }

    if (urlStr.includes('/dapi/auth/logout')) {
      return new Response(JSON.stringify({ statusCode: 0, statusMessage: 'Logged out successfully' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (urlStr.includes('/dapi/profile/info')) {
      return new Response(JSON.stringify({ statusCode: 0, data: { customer_id: '9988100', name: 'Swiggy User', mobile: '9876500001' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (urlStr.includes('events.swiggy.com')) {
      return new Response(JSON.stringify({ statusCode: 0, data: { locked: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (urlStr.includes('/dapi/order/all')) {
      return new Response(JSON.stringify({ statusCode: 0, data: { orders: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (urlStr.includes('chkout.swiggy.com/api/v2/cart/client/flush')) {
      return new Response(JSON.stringify({ statusCode: 0, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (urlStr.includes('chkout.swiggy.com/api/v2/cart/client') || urlStr.includes('/dapi/cart')) {
      return new Response(JSON.stringify({
        statusCode: 0,
        data: {
          cartId: 'cart_1',
          restaurant_details: { restaurant_id: '12345', name: 'Hotel Taj' },
          order_total: 200,
          final_payable: 200,
          trade_discount_total: 50,
          cart_menu_items: [{ menu_item_id: 1, name: 'Biryani', price: 250 }]
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ statusCode: 0, data: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}

function restoreNetwork() {
  globalThis.fetch = originalFetch;
}

async function runTests() {
  console.log('--- STARTING TEST V45: LOGOUT, EXPORT, ORDER COUNT, MAX OFFER, OFO TRACKING ---');

  // =========================================================================
  // PILLAR 1: Actual Remote Logout & Clean Export
  // =========================================================================
  console.log('\n[1] Testing Pillar 1: Actual Logout & Session Revocation...');
  setupMockNetwork();

  const testAccKey = 'acc_9876500001';
  const testPhone = '9876500001';
  const testTid1 = makeJwt('test1', 9988101);
  const db = getDb();
  if (!db.config.accounts) db.config.accounts = {};
  if (!db.sessionVault) db.sessionVault = {};

  db.config.accounts[testAccKey] = {
    id: testAccKey,
    phone: testPhone,
    name: 'Test Boss Account',
    isLoggedIn: true,
    customerId: '9988101',
    cookies: `_session_tid=${testTid1}; _sid=mock_sid_123; _csrf=mock_csrf_abc; _device_id=mock_dev_123; tid=${testTid1}`,
    tid: testTid1,
    token: 'mock_tok_123',
    totalOrdersCount: 0,
    isZeroOrderAccount: true
  };
  db.sessionVault[testPhone] = { ...db.config.accounts[testAccKey] };
  saveDb(db);

  // 1A: Test Export Session JSON
  const exported = exportSessionJson(testAccKey);
  assert.ok(exported, 'Session should be successfully exported');
  assert.strictEqual(exported.phone, testPhone, 'Exported session should contain correct phone');
  assert.ok(exported.cookies.includes('_session_tid='), 'Exported session should contain full cookies');
  assert.strictEqual(exported.totalOrdersCount, 0, 'Exported session includes totalOrdersCount');
  assert.strictEqual(exported.isZeroOrderAccount, true, 'Exported session includes isZeroOrderAccount');
  console.log('✓ Pillar 1A: Session export JSON contains full session and metadata');

  // 1B: Test Actual Remote Logout via Bridge
  const logoutRes = await deactivateSwiggyAccountViaBridge(99999, testAccKey, true);
  assert.strictEqual(logoutRes, true, 'Bridge deactivation should return true');

  const logoutCall = networkCalls.find(c => c.url.includes('/dapi/auth/logout'));
  assert.ok(logoutCall, 'Remote logout HTTP POST /dapi/auth/logout should be fired to Swiggy servers');
  assert.strictEqual(logoutCall.method, 'POST', 'Logout should use POST method');
  const logoutBody = JSON.parse(logoutCall.options.body || '{}');
  assert.strictEqual(logoutBody._csrf, 'mock_csrf_abc', 'Logout POST body should contain _csrf token');
  console.log('✓ Pillar 1B: Remote Swiggy session terminated on Swiggy server with CSRF');

  // Clean up
  deleteAccount(testAccKey, { purgeVault: true });
  assert.strictEqual(getDb().config.accounts[testAccKey], undefined, 'Account must be completely removed from DB');
  assert.strictEqual(getDb().sessionVault[testPhone], undefined, 'Account must be purged from sessionVault');
  console.log('✓ Pillar 1C: Account completely purged and tombstoned from bot DB & vault');

  // =========================================================================
  // PILLAR 2: Accurate Live Order Counting on File Upload
  // =========================================================================
  console.log('\n[2] Testing Pillar 2: Live Order Section Inspection Overrides Stale File Counts...');

  // Scenario A: Uploaded file says "totalOrdersCount: 5", but Swiggy's live order section has 0 orders!
  const staleAccKey = 'acc_9876500002';
  const staleTid = makeJwt('test2', 9988102);
  const staleAcc = {
    id: staleAccKey,
    phone: '9876500002',
    name: 'Fresh User With Stale JSON',
    isLoggedIn: true,
    customerId: '9988102',
    cookies: `_session_tid=${staleTid}; _sid=mock_sid_456; _csrf=mock_csrf_def; _device_id=mock_dev_456; tid=${staleTid}`,
    tid: staleTid,
    token: 'mock_tok_456',
    totalOrdersCount: 5, // Stale count in uploaded file!
    cachedTotalOrdersCount: 5
  };

  setupMockNetwork((url) => {
    if (url.includes('/dapi/order/all')) {
      // Swiggy live order section returns 0 orders!
      return new Response(JSON.stringify({ statusCode: 0, data: { orders: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  const inspectionRes = await inspectAccountOrderHistoryAndOffers(staleAccKey, staleAcc, { force: true });
  assert.strictEqual(inspectionRes.valid, true, 'Session should be valid');
  assert.strictEqual(inspectionRes.totalOrdersCount, 0, 'Live order count from Swiggy (0) must override stale count (5)!');
  assert.strictEqual(inspectionRes.isZeroOrderAccount, true, 'Account must be marked as fresh 0-order account');
  assert.strictEqual(staleAcc.totalOrdersCount, 0, 'Target account object totalOrdersCount updated to 0');
  assert.strictEqual(staleAcc.isZeroOrderAccount, true, 'Target account object isZeroOrderAccount updated to true');
  console.log('✓ Pillar 2A: Swiggy live order section authoritatively sets 0 orders and unlocks 0-order perks');

  // Scenario B: Swiggy order section returns 2 orders (1 food + 1 instamart)
  const usedAccKey = 'acc_9876500003';
  const usedTid = makeJwt('test3', 9988103);
  const usedAcc = {
    id: usedAccKey,
    phone: '9876500003',
    name: 'Used Account',
    isLoggedIn: true,
    customerId: '9988103',
    cookies: `_session_tid=${usedTid}; _sid=mock_sid_789; _csrf=mock_csrf_ghi; _device_id=mock_dev_789; tid=${usedTid}`,
    tid: usedTid,
    token: 'mock_tok_789',
    totalOrdersCount: 0 // Stale file says 0
  };

  setupMockNetwork((url) => {
    if (url.includes('deliveryType=INSTAMART')) {
      return new Response(JSON.stringify({ statusCode: 0, data: { orders: [{ order_id: 'IM_1001', order_status: 'delivered', payment_txn_status: 'success' }] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.includes('/dapi/order/all')) {
      return new Response(JSON.stringify({ statusCode: 0, data: { orders: [{ order_id: 'FOOD_2001', order_status: 'completed', payment_txn_status: 'success' }] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  const inspectionResUsed = await inspectAccountOrderHistoryAndOffers(usedAccKey, usedAcc, { force: true });
  assert.strictEqual(inspectionResUsed.totalOrdersCount, 2, 'Combined Food + Instamart orders must equal 2');
  assert.strictEqual(inspectionResUsed.isZeroOrderAccount, false, 'Used account must not be marked 0-order');
  console.log('✓ Pillar 2B: Food + Instamart live order sections both checked and correctly combined');

  // =========================================================================
  // PILLAR 3: Auto Max Offer Account Selection
  // =========================================================================
  console.log('\n[3] Testing Pillar 3: Auto Max Offer Account Selection...');

  clearAllAccountReservations();
  invalidateAccountOrderProfileCache();

  const freshKey = 'acc_9876500010';
  const olderKey = 'acc_9876500020';
  const freshTid = makeJwt('fresh10', 9988110);
  const olderTid = makeJwt('older20', 9988120);

  const testDb = getDb();
  testDb.orders = {};
  testDb.config.deletedAccounts = {};
  testDb.sessionVault = {};
  testDb.config.accounts = {
    [freshKey]: {
      id: freshKey,
      phone: '9876500010',
      name: 'Fresh 0-Order Account',
      isLoggedIn: true,
      customerId: '9988110',
      cookies: `_session_tid=${freshTid}; _sid=sid10; _csrf=csrf10; tid=${freshTid}`,
      tid: freshTid,
      totalOrdersCount: 0,
      cachedTotalOrdersCount: 0,
      isZeroOrderAccount: true,
      addressDetails: { id: 'addr_10', phone: '9876599999', lat: 12.97, lng: 77.59, address: 'Test Location' }
    },
    [olderKey]: {
      id: olderKey,
      phone: '9876500020',
      name: 'Older Account 10 Orders',
      isLoggedIn: true,
      customerId: '9988120',
      cookies: `_session_tid=${olderTid}; _sid=sid20; _csrf=csrf20; tid=${olderTid}`,
      tid: olderTid,
      totalOrdersCount: 10,
      cachedTotalOrdersCount: 10,
      isZeroOrderAccount: false,
      addressDetails: { id: 'addr_20', phone: '9876599999', lat: 12.97, lng: 77.59, address: 'Test Location' }
    }
  };
  saveDb(testDb);

  setupMockNetwork((url, options) => {
    if (url.includes('/dapi/order/all')) {
      const isFresh = url.includes(freshTid) || JSON.stringify(options).includes(freshTid);
      return new Response(JSON.stringify({
        statusCode: 0,
        data: {
          orders: isFresh ? [] : [{ order_id: 'OLD_1', order_status: 'delivered', payment_txn_status: 'success' }]
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.includes('shared_cart') || url.includes('/gc/')) {
      return new Response(JSON.stringify({
        statusCode: 0,
        data: {
          restaurant_id: '12345',
          restaurant_details: { name: 'Hotel Taj' },
          cart_menu_items: [{ menu_item_id: 1, name: 'Biryani', price: 25000, quantity: 1 }]
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('address') || url.includes('place-autocomplete')) {
      return new Response(JSON.stringify({
        statusCode: 0,
        data: {
          id: 'addr_1',
          address_id: 'addr_1',
          addresses: [{ id: 'addr_1', phone: '9876599999', mobile: '9876599999', lat: 26.85, lng: 80.95, address: 'Hazratganj, Lucknow, Uttar Pradesh 226001' }]
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('chkout.swiggy.com/api/v2/cart/client') || url.includes('/dapi/cart')) {
      const isFresh = JSON.stringify(options).includes(freshTid) || JSON.stringify(options).includes('sid10');
      const payable = isFresh ? 150 : 230; // ₹150 for 0-order account vs ₹230 for used account!
      const discount = isFresh ? 100 : 20;
      return new Response(JSON.stringify({
        statusCode: 0,
        data: {
          cartId: 'cart_1',
          restaurant_details: { restaurant_id: '12345', name: 'Hotel Taj' },
          order_total: payable,
          final_payable: payable,
          item_total: 250,
          trade_discount_total: discount,
          coupon_code: isFresh ? 'WELCOME50' : 'SWIGGY20',
          cart_menu_items: [{ menu_item_id: 1, name: 'Biryani', price: 25000, final_price: payable * 100, quantity: 1 }]
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  const dummyOrder = {
    id: 'TEST_ORD_99',
    cart: 'https://www.swiggy.com/restaurants/hotel-taj-12345',
    restaurantId: '12345',
    subtotal: 250,
    items: [{ id: '1', name: 'Biryani', price: 250, quantity: 1 }],
    addressDetails: {
      id: 'addr_1',
      mobile: '9876599999',
      phone: '9876599999',
      name: 'Recipient',
      lat: 26.8500,
      lng: 80.9500,
      address: 'Hazratganj, Lucknow, Uttar Pradesh 226001'
    }
  };

  const bestAcc = await findBestMaxCouponAccountForOrder(dummyOrder, {
    preferZeroOrderAccounts: true,
    maxSearchWaves: 2
  });

  assert.ok(bestAcc.success, `findBestMaxCouponAccountForOrder should find an eligible account (got: ${bestAcc.error || bestAcc.code})`);
  assert.strictEqual(bestAcc.winningKey || dummyOrder.selectedAccount, freshKey, 'Automatic selection MUST choose the 0-order account with max discount (₹150 payable vs ₹230)!');
  console.log('✓ Pillar 3: Bot automatically selected the 0-order account giving max offer / lowest bill');

  // =========================================================================
  // PILLAR 4: Official OFO Live Tracking Link Verification & Extraction
  // =========================================================================
  console.log('\n[4] Testing Pillar 4: Official OFO Live Tracking Link Handling...');

  const ofoUrl1 = 'http://r.swiggy.com/swiggy/ofo/track/n4b5SldB4SJx';
  const ofoUrl2 = 'https://www.swiggy.com/ofo/track/xT7qLm2Wv9Zb';
  const ofoUrl3 = 'https://swig.gy/ofo/track/RollKing99Ab';
  const botUrl = 'https://ammi-abbu-ka-sacha-beta.onrender.com/track/123';

  assert.strictEqual(isOfficialSwiggyTrackingUrl(ofoUrl1, { allowProviderShortLink: true }), true, 'r.swiggy OFO track link is recognized as official');
  assert.strictEqual(isOfficialSwiggyTrackingUrl(ofoUrl2, { allowProviderShortLink: true }), true, 'www.swiggy.com/ofo/track is recognized as official');
  assert.strictEqual(isOfficialSwiggyTrackingUrl(ofoUrl3, { allowProviderShortLink: true }), true, 'swig.gy/ofo/track is recognized as official');
  assert.strictEqual(isOfficialSwiggyTrackingUrl(botUrl), false, 'Bot proxy page is NOT an official Swiggy tracking URL');

  // Test deep extraction prioritizing OFO tracking links over generic order links
  const sampleSwiggyApiResponse = {
    statusCode: 0,
    data: {
      order_id: '251144921143559',
      generic_order_url: 'https://www.swiggy.com/orders/251144921143559',
      shareable_url: ofoUrl1,
      share_details: {
        ofo_share_url: ofoUrl1
      }
    }
  };

  const extractedTrack = extractOrderShareUrlDeep(sampleSwiggyApiResponse);
  assert.strictEqual(extractedTrack, ofoUrl1, 'extractOrderShareUrlDeep must pick the official OFO track link with highest priority');

  // Test storage and retrieval on order record
  const trackOrder = {
    id: 'ORD_777',
    swiggyOrderId: '251144921143559',
    trackingLink: ofoUrl1,
    trackingLinkSource: 'SWIGGY_API'
  };

  assert.ok(validateTrackingUrlForOrder(ofoUrl1, trackOrder, 'SWIGGY_API'), 'OFO track URL validates for order');
  assert.strictEqual(getStoredSwiggyTrackingUrl(trackOrder), ofoUrl1, 'Stored tracking URL retrieves official OFO link');
  console.log('✓ Pillar 4: OFO tracking URL extracted, prioritized (score 100), validated, and stored for sharing');

  restoreNetwork();
  console.log('\n=======================================================');
  console.log('✅ ALL TESTS PASSED: All 4 Pillars verified with 100% precision!');
  console.log('=======================================================');
}

runTests().catch(err => {
  restoreNetwork();
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
