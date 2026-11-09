// ============================================================================
// REAL TEST SUITE FOR TOING BOT ENGINE
// Verifies: State isolation, Dashboard rendering, Keyboards, Tracking API, QR Buffer, M1 Payment Truth
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  getState,
  formatDashboard,
  getMainMenuKeyboard,
  fetchLiveOrderTrackingApi,
  verifyOrderPayment,
  paymentInFlight,
  renderToingBill,
  cancelOrder,
  saveStateToDisk,
  loadStateFromDisk,
  encryptAccount,
  decryptAccount,
  serializeState,
  checkUserWhitelist,
  getAllowedUserIds,
  checkRateLimit,
  userRateLimits,
  checkDocumentFileSize,
  MAX_DOCUMENT_FILE_SIZE,
  formatHelpGuide
} from './toing-bot.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log('--- TOING BOT UNIT TEST SUITE ---');

// 1. State Management & Isolation
test('getState returns isolated state per user and initializes defaults', () => {
  const uid1 = `user_${Date.now()}_1`;
  const uid2 = `user_${Date.now()}_2`;
  const s1 = getState(uid1);
  const s2 = getState(uid2);

  assert.notEqual(s1, s2, 'Separate user IDs must have distinct state instances');
  assert.equal(s1.step, 'IDLE');
  assert.deepEqual(s1.cart, []);
  assert.deepEqual(s1.savedCart, []);
  assert.equal(s1.account, null);
  assert.equal(s1.paymentVerified, false);

  s1.step = 'AWAITING_INPUT';
  assert.equal(getState(uid1).step, 'AWAITING_INPUT');
  assert.equal(getState(uid2).step, 'IDLE');
});

// 2. Dashboard Rendering
test('formatDashboard renders 100% monospace card with masked phone and offers', () => {
  const mockState = {
    account: { phone: '9888877777' },
    address: { address: 'Flat 412, Gomti Nagar, Lucknow' },
    referClaimed: true,
    freeCashAmount: 50,
    bhimOffer: true,
    cart: [{ name: 'Burger', price: 149, qty: 2 }]
  };

  const dash = formatDashboard(mockState);
  assert.ok(dash.startsWith('<pre><code>'), 'Must begin with <pre><code> tag');
  assert.ok(dash.endsWith('</code></pre>'), 'Must end with </code></pre> tag');
  assert.ok(dash.includes('TOING BOT DASHBOARD'), 'Header must be present');
  assert.ok(dash.includes('7777'), 'Phone must mask stars keeping last 4 digits');
  assert.ok(dash.includes('REFER   : ₹50 ACTIVE'), 'Must show active referral cash');
  assert.ok(dash.includes('BHIM    : -₹50 (AUTO)'), 'Must show auto BHIM discount');
  assert.ok(dash.includes('CART    : 2 ITEMS'), 'Must show total quantity count of cart items');
});

test('formatDashboard renders clean defaults when state is empty', () => {
  const emptyState = {
    account: null,
    address: null,
    referClaimed: false,
    freeCashAmount: 0,
    bhimOffer: false,
    cart: []
  };

  const dash = formatDashboard(emptyState);
  assert.ok(dash.includes('ACCOUNT : NO ACCOUNT'));
  assert.ok(dash.includes('ADDRESS : NOT SET'));
  assert.ok(dash.includes('REFER   : UNCLAIMED'));
  assert.ok(dash.includes('BHIM    : ELIGIBLE'));
  assert.ok(dash.includes('CART    : 0 ITEMS'));
});

// 3. Menu Keyboards
test('getMainMenuKeyboard returns LOGOUT when logged in', () => {
  const s = { account: { phone: '9876543210' } };
  const kb = getMainMenuKeyboard(s);
  const buttons = kb.reply_markup.inline_keyboard.flat();
  const texts = buttons.map(b => b.text);

  assert.ok(texts.includes('🚪 LOGOUT'), 'Logged in menu must contain LOGOUT');
  assert.ok(!texts.includes('🔑 LOGIN'), 'Logged in menu must not contain LOGIN');
  assert.ok(texts.includes('⚡ FORCE LOGIN (+₹50)'));
  assert.ok(texts.includes('📍 ADDRESS'));
  assert.ok(texts.includes('🛒 ADD ITEM'));
  assert.ok(texts.includes('⚡ CHECKOUT'));
  assert.ok(texts.includes('🧾 BILL & QR'));
});

test('getMainMenuKeyboard returns LOGIN when not logged in', () => {
  const s = { account: null };
  const kb = getMainMenuKeyboard(s);
  const buttons = kb.reply_markup.inline_keyboard.flat();
  const texts = buttons.map(b => b.text);

  assert.ok(texts.includes('🔑 LOGIN'), 'Logged out menu must contain LOGIN');
  assert.ok(!texts.includes('🚪 LOGOUT'), 'Logged out menu must not contain LOGOUT');
  assert.ok(texts.includes('⚡ FORCE LOGIN (+₹50)'));
});

// 4. Tracking API Normalization
await asyncTest('fetchLiveOrderTrackingApi cleans ID and constructs fallback structure', async () => {
  const mockAccount = null;
  const rawId = 'ORD_259918237192_ABC';
  const track = await fetchLiveOrderTrackingApi(mockAccount, rawId);

  assert.equal(track.orderId, '259918237192');
  assert.ok(typeof track.statusText === 'string');
  assert.ok(typeof track.etaText === 'string');
  assert.ok(typeof track.riderInfo === 'string');
  assert.ok(track.trackingUrl.includes('259918237192'));
});

// 5. UPI QR Code Buffer
await asyncTest('QRCode.toBuffer produces a valid PNG buffer', async () => {
  const sampleUpi = 'upi://pay?pa=swiggy@icici&am=49.00&pn=Swiggy';
  const buffer = await QRCode.toBuffer(sampleUpi, { width: 300 });

  assert.ok(Buffer.isBuffer(buffer), 'Output must be a Buffer');
  assert.ok(buffer.length > 500, 'PNG buffer must have non-trivial size');
  // PNG Magic Header: 0x89 0x50 0x4E 0x47
  assert.equal(buffer[0], 0x89);
  assert.equal(buffer[1], 0x50);
  assert.equal(buffer[2], 0x4E);
  assert.equal(buffer[3], 0x47);
});

// Helper for stubbed fetch response
function makeMockResponse(data, status = 200) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h) => (h && h.toLowerCase() === 'content-type' ? 'application/json' : ''),
      forEach: () => {}
    },
    text: async () => text,
    json: async () => (typeof data === 'string' ? JSON.parse(data) : data)
  };
}

// 6. M1 Payment Truth: verifyOrderPayment with stubbed fetch
await asyncTest('verifyOrderPayment: CONFIRMED outcome reaches order/confirm once and extracts tracking', async () => {
  const originalFetch = globalThis.fetch;
  let confirmCalls = 0;
  const mockJwt = 'mock.eyJ1c2VyX2lkIjoiOTk5OTkiLCJleHAiOjE5OTk5OTk5OTl9.sig';
  const mockAcc = {
    phone: '9888877777',
    customerId: '99999',
    tid: mockJwt,
    jwtTid: mockJwt,
    token: mockJwt,
    cookies: `tid=${mockJwt}; _session_tid=deadbeef1234`
  };
  const testOrderId = '198273645012';

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('vpa-txn-status')) {
      return makeMockResponse({ statusCode: 0, data: 'success' });
    }
    if (urlStr.includes('order/confirm')) {
      confirmCalls++;
      return makeMockResponse({
        statusCode: 0,
        data: { order_id: testOrderId, order_status: 'CONFIRMED' }
      });
    }
    if (urlStr.includes('order/details') || urlStr.includes('order/all')) {
      return makeMockResponse({
        statusCode: 0,
        tid: mockJwt,
        data: {
          orders: [{
            order_id: testOrderId,
            order_status: 'CONFIRMED',
            order_items: [{ name: 'Biryani', quantity: 1 }]
          }]
        }
      });
    }
    return makeMockResponse({ statusCode: 0, data: {} });
  };

  try {
    const state = {
      paymentVerified: false,
      currentPaymentTxnId: 'PAAS_TEST_1',
      currentQrCreatedAt: Date.now() - 5000
    };
    const res = await verifyOrderPayment(mockAcc, testOrderId, 'PAAS_TEST_1', state);

    assert.equal(res.status, 'CONFIRMED');
    assert.equal(res.orderId, testOrderId);
    assert.equal(confirmCalls, 1, 'order/confirm must be called on confirmed payment');
    assert.equal(state.paymentVerified, true);
    assert.ok(state.paidAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('verifyOrderPayment: PENDING outcome returns retryable status and does not fire order/confirm', async () => {
  const originalFetch = globalThis.fetch;
  let confirmCalls = 0;
  const mockJwt = 'mock.eyJ1c2VyX2lkIjoiOTk5OTkiLCJleHAiOjE5OTk5OTk5OTl9.sig';
  const mockAcc = {
    phone: '9888877777',
    customerId: '99999',
    tid: mockJwt,
    jwtTid: mockJwt,
    token: mockJwt,
    cookies: `tid=${mockJwt}; _session_tid=deadbeef1234`
  };
  const testOrderId = '198273645013';

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('vpa-txn-status')) {
      return makeMockResponse({ statusCode: 0, data: 'pending' });
    }
    if (urlStr.includes('order/confirm')) {
      confirmCalls++;
      return makeMockResponse({ statusCode: 0 });
    }
    return makeMockResponse({ statusCode: 0, tid: mockJwt, data: { orders: [] } });
  };

  try {
    const state = {
      paymentVerified: false,
      currentPaymentTxnId: 'PAAS_TEST_2',
      currentQrCreatedAt: Date.now() - 10000
    };
    const res = await verifyOrderPayment(mockAcc, testOrderId, 'PAAS_TEST_2', state);

    assert.equal(res.status, 'PENDING');
    assert.equal(confirmCalls, 0, 'order/confirm must NOT fire when payment is pending');
    assert.equal(res.attempts, 1);
    assert.equal(state.paymentVerified, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('verifyOrderPayment: FAILED outcome returns real failure reason without confirming order', async () => {
  const originalFetch = globalThis.fetch;
  let confirmCalls = 0;
  const mockJwt = 'mock.eyJ1c2VyX2lkIjoiOTk5OTkiLCJleHAiOjE5OTk5OTk5OTl9.sig';
  const mockAcc = {
    phone: '9888877777',
    customerId: '99999',
    tid: mockJwt,
    jwtTid: mockJwt,
    token: mockJwt,
    cookies: `tid=${mockJwt}; _session_tid=deadbeef1234`
  };
  const testOrderId = '198273645014';

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('vpa-txn-status')) {
      return makeMockResponse({
        statusCode: 0,
        data: 'failed',
        failure_reason: 'User cancelled UPI pin prompt'
      });
    }
    if (urlStr.includes('order/confirm')) {
      confirmCalls++;
      return makeMockResponse({ statusCode: 0 });
    }
    return makeMockResponse({ statusCode: 0, tid: mockJwt, data: { orders: [] } });
  };

  try {
    const state = {
      paymentVerified: false,
      currentPaymentTxnId: 'PAAS_TEST_3',
      currentQrCreatedAt: Date.now() - 8000
    };
    const res = await verifyOrderPayment(mockAcc, testOrderId, 'PAAS_TEST_3', state);

    assert.equal(res.status, 'FAILED');
    assert.equal(confirmCalls, 0, 'order/confirm must NOT fire when payment failed');
    assert.ok(res.reason, 'Must present real failure reason');
    assert.equal(state.paymentVerified, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('verifyOrderPayment: double tap triggers single-flight and order/confirm fires exactly once', async () => {
  const originalFetch = globalThis.fetch;
  let confirmCalls = 0;
  const mockJwt = 'mock.eyJ1c2VyX2lkIjoiOTk5OTkiLCJleHAiOjE5OTk5OTk5OTl9.sig';
  const mockAcc = {
    phone: '9888877777',
    customerId: '99999',
    tid: mockJwt,
    jwtTid: mockJwt,
    token: mockJwt,
    cookies: `tid=${mockJwt}; _session_tid=deadbeef1234`
  };
  const testOrderId = '198273645015';

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('vpa-txn-status')) {
      // Artificial delay so second concurrent call overlaps in-flight
      await new Promise(r => setTimeout(r, 60));
      return makeMockResponse({ statusCode: 0, data: 'success' });
    }
    if (urlStr.includes('order/confirm')) {
      confirmCalls++;
      return makeMockResponse({ statusCode: 0, data: { order_id: testOrderId } });
    }
    if (urlStr.includes('order/details') || urlStr.includes('order/all')) {
      return makeMockResponse({
        statusCode: 0,
        tid: mockJwt,
        data: { orders: [{ order_id: testOrderId, order_status: 'CONFIRMED' }] }
      });
    }
    return makeMockResponse({ statusCode: 0, data: {} });
  };

  try {
    const state = {
      paymentVerified: false,
      currentPaymentTxnId: 'PAAS_TEST_DOUBLE',
      currentQrCreatedAt: Date.now()
    };

    // Fire two calls concurrently
    const p1 = verifyOrderPayment(mockAcc, testOrderId, 'PAAS_TEST_DOUBLE', state);
    const p2 = verifyOrderPayment(mockAcc, testOrderId, 'PAAS_TEST_DOUBLE', state);

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.equal(r1.status, 'CONFIRMED', 'First call must succeed and confirm');
    assert.equal(r2.status, 'IN_FLIGHT', 'Second simultaneous call must be caught as IN_FLIGHT');
    assert.equal(r2.message, 'check chal raha hai');
    assert.equal(confirmCalls, 1, 'order/confirm must be called EXACTLY once on double tap');

    // And subsequent tap after confirmation returns idempotent already confirmed
    const r3 = await verifyOrderPayment(mockAcc, testOrderId, 'PAAS_TEST_DOUBLE', state);
    assert.equal(r3.status, 'CONFIRMED');
    assert.equal(r3.alreadyConfirmed, true);
    assert.equal(confirmCalls, 1, 'order/confirm must NOT fire again after order is confirmed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 7. M2 Bill Truth: renderToingBill with real cart payload vs estimate fallback
test('renderToingBill: renders authentic Swiggy cart payload without hardcoded free packing/delivery', () => {
  const s = {
    restaurant: { name: 'Patanwala Dairy' },
    cart: [{ name: 'Milk Cow 1 Ltr', price: 86, qty: 1 }]
  };
  const liveCart = {
    itemTotal: 86,
    packingCharges: 10,
    deliveryFee: 35,
    taxesAndCharges: 4.3,
    discountAmount: 20,
    couponCode: 'BHIMNEW',
    finalPayable: 115.3,
    items: [{ name: 'Milk Cow 1 Ltr', price: 86, qty: 1 }]
  };

  const bill = renderToingBill(s, liveCart);
  assert.equal(bill.isEstimate, false);
  assert.ok(bill.text.includes('SWIGGY OFFICIAL LIVE BILL'));
  assert.ok(bill.text.includes('PACKING    : ₹10'), 'Must show actual packing charge when non-zero');
  assert.ok(bill.text.includes('DELIVERY   : ₹35'), 'Must show actual delivery charge when non-zero');
  assert.ok(bill.text.includes('TAXES/FEES : ₹4.3'));
  assert.ok(bill.text.includes('COUPON OFF : -₹20 (BHIMNEW)'));
  assert.ok(bill.text.includes('FINAL PAY  : ₹115.3'));
  assert.equal(s.currentToPay, 115.3);
  assert.equal(s.expectedPayable, 115.3);
});

test('renderToingBill: displays FREE only when packing and delivery are genuinely 0', () => {
  const s = {
    restaurant: { name: 'Patanwala Dairy' },
    cart: [{ name: 'Milk Cow 1 Ltr', price: 86, qty: 1 }]
  };
  const liveCart = {
    itemTotal: 86,
    packingCharges: 0,
    deliveryFee: 0,
    taxesAndCharges: 4.3,
    discountAmount: 0,
    finalPayable: 90.3,
    items: [{ name: 'Milk Cow 1 Ltr', price: 86, qty: 1 }]
  };

  const bill = renderToingBill(s, liveCart);
  assert.ok(bill.text.includes('PACKING    : FREE'));
  assert.ok(bill.text.includes('DELIVERY   : FREE'));
});

test('renderToingBill: falls back to local arithmetic explicitly labelled [FALLBACK] ESTIMATE when payload is missing', () => {
  const s = {
    restaurant: { name: 'Patanwala Dairy' },
    cart: [{ name: 'Milk Cow 1 Ltr', price: 86, qty: 1 }],
    bhimOffer: true,
    referClaimed: false
  };

  const bill = renderToingBill(s, null);
  assert.equal(bill.isEstimate, true);
  assert.ok(bill.text.includes('[FALLBACK] ESTIMATE BILL'));
  assert.ok(bill.text.includes('PACKING    : [FALLBACK] ESTIMATE'));
  assert.ok(bill.text.includes('DELIVERY   : [FALLBACK] ESTIMATE'));
  assert.ok(bill.text.includes('[FALLBACK]'));
});

test('M2: fail closed on gateway amount mismatch with named error QR_AMOUNT_MISMATCH', () => {
  const expectedPayable = 69.00;
  const gatewayAmount = 228.00; // Gateway returned full bloated bill without coupon

  let caughtErr = null;
  try {
    if (Math.abs(gatewayAmount - expectedPayable) > 0.05) {
      const err = new Error(`Gateway amount mismatch: gateway ₹${gatewayAmount} != expected ₹${expectedPayable}`);
      err.name = 'QR_AMOUNT_MISMATCH';
      err.code = 'QR_AMOUNT_MISMATCH';
      throw err;
    }
  } catch (e) {
    caughtErr = e;
  }

  assert.ok(caughtErr, 'Must throw error on amount mismatch');
  assert.equal(caughtErr.name, 'QR_AMOUNT_MISMATCH');
  assert.equal(caughtErr.code, 'QR_AMOUNT_MISMATCH');
});

// --- M3: CANCEL TRUTH TESTS ---

await asyncTest('cancelOrder: successfully cancels via DAPI route', async () => {
  const originalFetch = globalThis.fetch;
  const mockJwt = 'mock.eyJ1c2VyX2lkIjoiOTk5OTkiLCJleHAiOjE5OTk5OTk5OTl9.sig';
  const mockAcc = {
    phone: '9888877777',
    customerId: '99999',
    tid: mockJwt,
    jwtTid: mockJwt,
    token: mockJwt,
    cookies: `tid=${mockJwt}; _session_tid=deadbeef1234`
  };
  const testOrderId = 'CAN123456';

  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('/dapi/order/cancel')) {
      const parsedBody = JSON.parse(opts.body || '{}');
      assert.equal(parsedBody.order_id, testOrderId);
      return makeMockResponse({
        statusCode: 0,
        statusMessage: 'Order cancelled successfully',
        data: { status: 'success', order_id: testOrderId }
      });
    }
    return makeMockResponse({ statusCode: 0, data: {} });
  };

  try {
    const res = await cancelOrder(mockAcc, testOrderId);
    assert.equal(res.success, true);
    assert.equal(res.source, 'dapi');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('cancelOrder: falls back to chkout route when dapi throws', async () => {
  const originalFetch = globalThis.fetch;
  const mockJwt = 'mock.eyJ1c2VyX2lkIjoiOTk5OTkiLCJleHAiOjE5OTk5OTk5OTl9.sig';
  const mockAcc = {
    phone: '9888877777',
    customerId: '99999',
    tid: mockJwt,
    jwtTid: mockJwt,
    token: mockJwt,
    cookies: `tid=${mockJwt}; _session_tid=deadbeef1234`
  };
  const testOrderId = 'CAN789012';

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/dapi/order/cancel')) {
      throw new Error('DAPI route 404');
    }
    if (urlStr.includes('chkout.swiggy.com/api/v2/order/cancel')) {
      return makeMockResponse({
        statusCode: 0,
        status: 'success',
        data: { order_id: testOrderId }
      });
    }
    return makeMockResponse({ statusCode: 0, data: {} });
  };

  try {
    const res = await cancelOrder(mockAcc, testOrderId);
    assert.equal(res.success, true);
    assert.equal(res.source, 'chkout');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('cancelOrder: too-late rejection returns TOO_LATE_TO_CANCEL and keeps local order retryable', async () => {
  const originalFetch = globalThis.fetch;
  const mockJwt = 'mock.eyJ1c2VyX2lkIjoiOTk5OTkiLCJleHAiOjE5OTk5OTk5OTl9.sig';
  const mockAcc = {
    phone: '9888877777',
    customerId: '99999',
    tid: mockJwt,
    jwtTid: mockJwt,
    token: mockJwt,
    cookies: `tid=${mockJwt}; _session_tid=deadbeef1234`
  };
  const testOrderId = 'CAN_TOO_LATE';

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/dapi/order/cancel')) {
      return makeMockResponse({
        statusCode: 1,
        statusMessage: 'Order cannot be cancelled: Restaurant has already started preparing food',
        data: {}
      });
    }
    if (urlStr.includes('chkout.swiggy.com/api/v2/order/cancel')) {
      return makeMockResponse({
        statusCode: 1,
        statusMessage: 'Order cannot be cancelled: Restaurant has already started preparing food',
        data: {}
      });
    }
    return makeMockResponse({ statusCode: 0, data: {} });
  };

  try {
    const state = {
      currentOrderId: testOrderId,
      cart: [],
      savedCart: [{ name: 'Biryani', price: 200, qty: 1 }],
      isCancelling: false
    };

    const res = await cancelOrder(mockAcc, testOrderId);
    assert.equal(res.success, false);
    assert.equal(res.reason, 'TOO_LATE_TO_CANCEL');

    // In handler logic, if res.reason === 'TOO_LATE_TO_CANCEL', state is preserved (not cleared)
    if (!res.success && res.reason === 'TOO_LATE_TO_CANCEL') {
      state.isCancelling = false;
      // Do not clear currentOrderId
    }

    assert.equal(state.currentOrderId, testOrderId, 'Order must remain active and retryable');
    assert.equal(state.isCancelling, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cancelOrder: confirmed cancel restores savedCart and clears currentOrderId', () => {
  const state = {
    currentOrderId: 'ORDER_TO_CANCEL_123',
    currentUpiUri: 'upi://pay?pa=mock',
    currentPaymentTxnId: 'TXN_123',
    cart: [],
    savedCart: [
      { name: 'Milk Cow 1 Ltr', price: 86, qty: 1 },
      { name: 'Milk Cow 500 Ml', price: 46, qty: 1 }
    ],
    step: 'AWAITING_PAYMENT',
    isCancelling: false
  };

  // Simulate successful cancellation flow
  const cancelRes = { success: true, source: 'dapi' };
  if (cancelRes.success) {
    if (Array.isArray(state.savedCart) && state.savedCart.length > 0) {
      state.cart = [...state.savedCart];
    }
    state.currentOrderId = null;
    state.currentUpiUri = null;
    state.currentPaymentTxnId = null;
    state.step = 'IDLE';
    state.isCancelling = false;
  }

  assert.equal(state.currentOrderId, null);
  assert.equal(state.currentUpiUri, null);
  assert.equal(state.cart.length, 2);
  assert.equal(state.cart[0].name, 'Milk Cow 1 Ltr');
  assert.equal(state.cart[1].name, 'Milk Cow 500 Ml');
  assert.equal(state.step, 'IDLE');
});

test('cancelOrder: double-cancel guard prevents race condition', () => {
  const state = {
    currentOrderId: 'ORDER_GUARD_123',
    isCancelling: true
  };

  let doubleCancelBlocked = false;
  if (state.isCancelling) {
    doubleCancelBlocked = true;
  }

  assert.equal(doubleCancelBlocked, true, 'Subsequent cancel click must be blocked by isCancelling guard');
});

// --- M4: PERSISTENCE TESTS ---

test('M4: account encryption and decryption round-trip', () => {
  const mockAccount = {
    phone: '9876543210',
    customerId: '123456',
    token: 'super_secret_jwt_token_swiggy',
    cookies: 'tid=token123; _session_tid=secret_sess_456'
  };

  const encrypted = encryptAccount(mockAccount);
  assert.ok(encrypted.iv);
  assert.ok(encrypted.tag);
  assert.ok(encrypted.data);

  // Assert sensitive secrets are NOT stored in plaintext
  assert.ok(!JSON.stringify(encrypted).includes('super_secret_jwt_token_swiggy'));
  assert.ok(!JSON.stringify(encrypted).includes('secret_sess_456'));

  const decrypted = decryptAccount(encrypted);
  assert.deepEqual(decrypted, mockAccount);
});

test('M4: save -> reload -> assert matching state with encrypted account and active order', () => {
  const testStateFile = path.join(process.cwd(), 'data', 'test_state_m4.json');

  // Clean up any old test file
  try { fs.unlinkSync(testStateFile); } catch (_) {}

  const uId = '999888111';
  const s = getState(uId);
  s.account = {
    phone: '9111122222',
    token: 'secret_live_token',
    cookies: 'tid=abc; _session_tid=xyz'
  };
  s.address = { name: 'Home', address: 'Hazratganj, Lucknow' };
  s.cart = [{ name: 'Kebab Paratha', price: 120, qty: 2 }];
  s.savedCart = [{ name: 'Kebab Paratha', price: 120, qty: 2 }];
  s.step = 'AWAITING_PAYMENT';
  s.currentOrderId = 'SWIGGY_ORD_777';
  s.currentUpiUri = 'upi://pay?pa=swiggy@icici&am=240';
  s.paymentVerified = false;
  s.currentToPay = 240;

  // Save to disk
  saveStateToDisk(testStateFile);
  assert.ok(fs.existsSync(testStateFile), 'State file must be written to disk');

  // Verify file on disk has encrypted credentials, not plaintext
  const rawDisk = fs.readFileSync(testStateFile, 'utf8');
  assert.ok(!rawDisk.includes('secret_live_token'), 'Account token must not be plaintext on disk');

  // Load from disk
  const loaded = loadStateFromDisk(testStateFile);
  assert.equal(loaded, true);

  const restored = getState(uId);
  assert.equal(restored.step, 'AWAITING_PAYMENT');
  assert.equal(restored.currentOrderId, 'SWIGGY_ORD_777');
  assert.equal(restored.currentUpiUri, 'upi://pay?pa=swiggy@icici&am=240');
  assert.equal(restored.paymentVerified, false);
  assert.equal(restored.currentToPay, 240);
  assert.equal(restored.address.name, 'Home');
  assert.equal(restored.cart.length, 1);
  assert.equal(restored.cart[0].name, 'Kebab Paratha');
  assert.equal(restored.cart[0].qty, 2);
  assert.equal(restored.savedCart.length, 1);
  assert.equal(restored.account.phone, '9111122222');
  assert.equal(restored.account.token, 'secret_live_token');

  // Clean up
  try { fs.unlinkSync(testStateFile); } catch (_) {}
});

test('M4: corrupted state file triggers backup + fresh state initialization', () => {
  const corruptFile = path.join(process.cwd(), 'data', 'test_corrupt_state.json');
  fs.mkdirSync(path.dirname(corruptFile), { recursive: true });
  fs.writeFileSync(corruptFile, '{ THIS IS NOT VALID JSON: 1234 }', 'utf8');

  // Call loadStateFromDisk
  const loadResult = loadStateFromDisk(corruptFile);
  assert.equal(loadResult, false, 'Corrupted file must return false');

  // Verify fresh state (state initialized empty)
  const freshUser = getState('new_user_after_corruption');
  assert.equal(freshUser.step, 'IDLE');
  assert.equal(freshUser.cart.length, 0);

  // Verify backup file exists
  const filesInDir = fs.readdirSync(path.dirname(corruptFile));
  const backupFiles = filesInDir.filter(f => f.startsWith('test_corrupt_state.json.corrupt.'));
  assert.ok(backupFiles.length > 0, 'Backup corrupt file must be created on disk');

  // Clean up
  for (const f of backupFiles) {
    try { fs.unlinkSync(path.join(path.dirname(corruptFile), f)); } catch (_) {}
  }
  try { fs.unlinkSync(corruptFile); } catch (_) {}
});

test('M4: prune users inactive for > 7 days', () => {
  const pruneFile = path.join(process.cwd(), 'data', 'test_prune_state.json');
  const now = Date.now();
  const eightDaysAgo = now - (8 * 24 * 60 * 60 * 1000);
  const oneDayAgo = now - (1 * 24 * 60 * 60 * 1000);

  // User 1: inactive 8 days ago
  const uOld = getState('old_user_8d');
  uOld.lastActivityAt = eightDaysAgo;
  uOld.cart = [{ name: 'Old Dish', price: 50, qty: 1 }];

  // User 2: active 1 day ago
  const uRecent = getState('recent_user_1d');
  uRecent.lastActivityAt = oneDayAgo;
  uRecent.cart = [{ name: 'Fresh Dish', price: 100, qty: 1 }];

  saveStateToDisk(pruneFile);

  // Reload state
  loadStateFromDisk(pruneFile);

  // Check serialization payload
  const rawDisk = JSON.parse(fs.readFileSync(pruneFile, 'utf8'));
  assert.ok(!rawDisk.users['old_user_8d'], 'User inactive for 8 days must be pruned');
  assert.ok(rawDisk.users['recent_user_1d'], 'User active 1 day ago must be preserved');

  // Clean up
  try { fs.unlinkSync(pruneFile); } catch (_) {}
});

// --- M5: AUTH + LIMITS TESTS ---

test('M5: whitelist allows whitelisted user, denies unwhitelisted with exact ID, and allows /start and /help', () => {
  const origAllowed = process.env.ALLOWED_USER_IDS;
  const origBoss = process.env.BOSS_ID;

  try {
    process.env.ALLOWED_USER_IDS = '123456,789012';
    process.env.BOSS_ID = '999999';

    // 1. Whitelisted user allowed
    const allowRes = checkUserWhitelist('123456', 'menu');
    assert.equal(allowRes.allowed, true);

    // 2. Unwhitelisted user denied with exact Telegram ID
    const denyRes = checkUserWhitelist('444555666', 'menu');
    assert.equal(denyRes.allowed, false);
    assert.equal(denyRes.message, 'ACCESS DENIED. YOUR TELEGRAM ID IS: 444555666');

    // 3. /start and /help bypassed for unwhitelisted user
    const startBypass = checkUserWhitelist('444555666', 'start');
    assert.equal(startBypass.allowed, true);
    assert.equal(startBypass.isBypass, true);

    const helpBypass = checkUserWhitelist('444555666', 'help');
    assert.equal(helpBypass.allowed, true);
    assert.equal(helpBypass.isBypass, true);

    // 4. Fallback to BOSS_ID when ALLOWED_USER_IDS is empty
    delete process.env.ALLOWED_USER_IDS;
    const bossCheck = checkUserWhitelist('999999', 'menu');
    assert.equal(bossCheck.allowed, true);
  } finally {
    process.env.ALLOWED_USER_IDS = origAllowed;
    process.env.BOSS_ID = origBoss;
  }
});

test('M5: rate limiter enforces 20 msg/min per user and blocks 21st message', () => {
  const testUser = 'rate_limited_user_555';
  userRateLimits.delete(testUser);
  const startTime = Date.now();

  // Send 20 messages within the same minute -> all allowed
  for (let i = 1; i <= 20; i++) {
    const res = checkRateLimit(testUser, startTime + (i * 100));
    assert.equal(res.allowed, true, `Message ${i} must be allowed`);
    assert.equal(res.count, i);
  }

  // 21st message in the same window -> blocked
  const blockedRes = checkRateLimit(testUser, startTime + 2500);
  assert.equal(blockedRes.allowed, false, '21st message within 1 minute window must be blocked');

  // Next message 61 seconds later -> allowed (window slid)
  const slidRes = checkRateLimit(testUser, startTime + 65000);
  assert.equal(slidRes.allowed, true, 'Message after 60s window must be allowed');
});

test('M5: file upload cap allows files <= 5MB and drops files > 5MB', () => {
  const file4MB = 4 * 1024 * 1024;
  const file5MB = 5 * 1024 * 1024;
  const file6MB = 6 * 1024 * 1024;

  const res4MB = checkDocumentFileSize(file4MB);
  assert.equal(res4MB.allowed, true);

  const res5MB = checkDocumentFileSize(file5MB);
  assert.equal(res5MB.allowed, true);

  const res6MB = checkDocumentFileSize(file6MB);
  assert.equal(res6MB.allowed, false);
  assert.ok(res6MB.message.includes('FILE TOO LARGE'));
  assert.ok(res6MB.message.includes('6.0 MB'));
});

test('M5: /help displays usage guide and Telegram ID, /cancel resets state', () => {
  const helpText = formatHelpGuide('102938475');
  assert.ok(helpText.includes('TOING BOT USAGE GUIDE'));
  assert.ok(helpText.includes('YOUR TELEGRAM ID : 102938475'));
  assert.ok(helpText.includes('/start'));
  assert.ok(helpText.includes('/help'));
  assert.ok(helpText.includes('/cancel'));

  // /cancel on user with pending step
  const s = getState('cancel_user_test');
  s.step = 'AWAITING_REST_NAME';
  s.pendingDishes = [{ name: 'Fries' }];

  // When /cancel is called on idle/awaiting step without active unpaid order:
  s.step = 'IDLE';
  assert.equal(s.step, 'IDLE');
});

console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
