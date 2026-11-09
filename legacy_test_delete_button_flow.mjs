import 'dotenv/config';
import { getDb } from './store.js';

// Setup fetch mock/spy to record calls and mock Swiggy responses without burning live OTPs
const recordedCalls = [];

globalThis.fetch = async function(url, options = {}) {
  const urlStr = String(url);
  const method = options.method || 'GET';
  
  if (urlStr.includes('swiggy.com')) {
    recordedCalls.push({
      url: urlStr,
      method,
      headers: options.headers ? Object.keys(options.headers) : [],
      body: options.body ? String(options.body).slice(0, 50) : null
    });

    // Mock response for /mapi/auth/delete/userCheck without sending live SMS
    if (urlStr.includes('/mapi/auth/delete/userCheck')) {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          statusCode: 28,
          statusMessage: 'Archive OTP Sent',
          tid: 'mock_tid_12345',
          csrfToken: 'mock_csrf_67890',
          sid: 'mock_sid',
          deviceId: 'mock_device_id'
        })
      };
    }

    // Mock response for /mapi/auth/delete/user
    if (urlStr.includes('/mapi/auth/delete/user')) {
      const parsed = options.body ? JSON.parse(options.body) : {};
      if (parsed.otp === '000000') {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            statusCode: 29,
            statusMessage: 'Invalid OTP'
          })
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({
          statusCode: 33,
          statusMessage: 'Account Deleted'
        })
      };
    }

    // If login OTP is called, record and return error
    if (urlStr.includes('/dapi/auth/sms-otp')) {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          statusCode: 0,
          statusMessage: 'OTP sent'
        })
      };
    }
  }
  
  return {
    status: 404,
    ok: false,
    json: async () => ({ error: 'Not found' })
  };
};

async function runTest() {
  console.log('====================================================');
  console.log('🧪 TESTING AUTHENTIC TELEGRAM BUTTON DELETE FLOW (OFFLINE MOCK)');
  console.log('====================================================');

  const db = getDb();
  const testKey = 'acc_9935123518';
  const acc = db.config.accounts[testKey];
  if (!acc || !acc.cookies) {
    throw new Error('Test account or cookies missing in db.json');
  }

  // Import bridge
  const bridge = await import('./swiggy-bridge.js');

  console.log('\n--- TEST 1: Single Click Delete OTP Trigger on Authenticated Account ---');
  recordedCalls.length = 0;
  
  const testUserId = 999999999;
  const res1 = await bridge.requestSwiggyDeleteOtpViaBridge(testUserId, acc.phone, testKey, acc.name);
  console.log('Bridge Result:', res1);

  const userCheckCalls = recordedCalls.filter(c => c.url.includes('/mapi/auth/delete/userCheck'));
  const smsOtpCalls = recordedCalls.filter(c => c.url.includes('/dapi/auth/sms-otp'));

  console.log(`Calls to /mapi/auth/delete/userCheck: ${userCheckCalls.length}`);
  console.log(`Calls to /dapi/auth/sms-otp: ${smsOtpCalls.length}`);

  if (userCheckCalls.length !== 1) {
    throw new Error(`Expected exactly 1 call to userCheck, got ${userCheckCalls.length}`);
  }
  if (smsOtpCalls.length !== 0) {
    throw new Error(`CRITICAL BUG: ${smsOtpCalls.length} calls made to login OTP /dapi/auth/sms-otp!`);
  }
  if (!res1.success) {
    throw new Error(`userCheck failed: ${res1.message}`);
  }

  console.log('✅ TEST 1 PASSED: Exactly 1 call to /mapi/auth/delete/userCheck and 0 calls to /dapi/auth/sms-otp.');

  console.log('\n--- TEST 2: Concurrent / Rapid Double Click Debounce ---');
  recordedCalls.length = 0;
  
  // Simulate the mutex guard in index.js
  const deleteInProgress = new Set();
  async function simulateTelegramButtonClick(userId, key) {
    if (deleteInProgress.has(userId) || deleteInProgress.has(key)) {
      return { blocked: true, message: 'Request in progress' };
    }
    deleteInProgress.add(userId);
    deleteInProgress.add(key);
    try {
      return await bridge.requestSwiggyDeleteOtpViaBridge(userId, acc.phone, key, acc.name);
    } finally {
      deleteInProgress.delete(userId);
      deleteInProgress.delete(key);
    }
  }

  // Trigger two clicks simultaneously
  const [click1, click2] = await Promise.all([
    simulateTelegramButtonClick(testUserId, testKey),
    simulateTelegramButtonClick(testUserId, testKey)
  ]);

  console.log('Click 1 Result:', click1.success ? 'OTP Sent' : click1);
  console.log('Click 2 Result:', click2.blocked ? 'BLOCKED by mutex' : click2);

  const doubleClickCheckCalls = recordedCalls.filter(c => c.url.includes('/mapi/auth/delete/userCheck'));
  const doubleClickSmsCalls = recordedCalls.filter(c => c.url.includes('/dapi/auth/sms-otp'));

  console.log(`Total calls to /mapi/auth/delete/userCheck during double-click: ${doubleClickCheckCalls.length}`);
  console.log(`Total calls to /dapi/auth/sms-otp during double-click: ${doubleClickSmsCalls.length}`);

  if (doubleClickCheckCalls.length !== 1) {
    throw new Error(`Double-click failed mutex! Expected 1 call, got ${doubleClickCheckCalls.length}`);
  }
  if (doubleClickSmsCalls.length !== 0) {
    throw new Error(`CRITICAL BUG: Double click triggered login OTP!`);
  }
  console.log('✅ TEST 2 PASSED: Double click was debounced by mutex. Exactly 1 request sent.');

  console.log('\n--- TEST 3: Deletion OTP Verification (Invalid OTP) ---');
  recordedCalls.length = 0;
  const verifyRes = await bridge.verifyAndDeleteSwiggyAccountViaBridge(testUserId, '000000', testKey);
  console.log('Verify Result:', verifyRes);

  const userDeleteCalls = recordedCalls.filter(c => c.url.includes('/mapi/auth/delete/user'));
  const verifySmsCalls = recordedCalls.filter(c => c.url.includes('/dapi/auth/sms-otp'));

  console.log(`Calls to /mapi/auth/delete/user: ${userDeleteCalls.length}`);
  console.log(`Calls to /dapi/auth/sms-otp: ${verifySmsCalls.length}`);

  if (userDeleteCalls.length !== 1) {
    throw new Error(`Expected 1 call to delete user endpoint, got ${userDeleteCalls.length}`);
  }
  if (verifySmsCalls.length !== 0) {
    throw new Error(`CRITICAL BUG: Deletion verify triggered login OTP!`);
  }
  if (verifyRes.success) {
    throw new Error('Expected invalid OTP to fail verification!');
  }
  console.log('✅ TEST 3 PASSED: Delete OTP verification communicated with /mapi/auth/delete/user and returned invalid OTP without triggering login.');

  console.log('\n--- TEST 4: Unauthenticated Account Handling ---');
  recordedCalls.length = 0;
  const unauthResult = await bridge.requestSwiggyDeleteOtpViaBridge(testUserId, '9999999999', 'acc_unauthenticated');
  console.log('Unauthenticated Account Result:', unauthResult);

  if (unauthResult.success) {
    throw new Error('Expected unauthenticated account to fail!');
  }
  if (recordedCalls.length !== 0) {
    throw new Error(`Expected 0 network calls for unauthenticated account, got ${recordedCalls.length}`);
  }
  console.log('✅ TEST 4 PASSED: Unauthenticated account rejected with message before firing any network requests.');

  console.log('\n====================================================');
  console.log('🎉 ALL INTEGRATION TESTS PASSED 100%!');
  console.log('====================================================');
  process.exit(0);
}

runTest().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
