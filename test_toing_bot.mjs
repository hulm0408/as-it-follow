// ============================================================================
// REAL TEST SUITE FOR TOING BOT ENGINE
// Verifies: State isolation, Dashboard rendering, Keyboards, Tracking API, QR Buffer, M1 Payment Truth
// ============================================================================

import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import {
  getState,
  formatDashboard,
  getMainMenuKeyboard,
  fetchLiveOrderTrackingApi,
  verifyOrderPayment,
  paymentInFlight
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

console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
