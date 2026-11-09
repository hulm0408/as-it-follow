import fs from 'fs';
import path from 'path';
import { saveToLocalStorage, getLocalStorageStats } from './local-storage-manager.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

console.log('--- Testing Local Storage Manager ---');

// Test 1: Save account with orders
const sampleJsonWithOrders = JSON.stringify({
  phone: '9988112233',
  orders: [{ order_id: 'ORD_TEST_999', order_total: 350 }]
});

const destWithOrders = saveToLocalStorage('test_with_orders.json', sampleJsonWithOrders, {
  phone: '9988112233',
  orderCount: 1,
  orderIds: ['ORD_TEST_999'],
  hasOrders: true
});

assert(Boolean(destWithOrders) && fs.existsSync(destWithOrders), 'File with orders saved to local storage disk');
assert(destWithOrders.includes('with_orders'), 'File saved in with_orders directory');

// Test 2: Save account with zero orders
const sampleJsonZeroOrders = JSON.stringify({
  phone: '9988000000',
  orders: []
});

const destZeroOrders = saveToLocalStorage('test_zero_orders.json', sampleJsonZeroOrders, {
  phone: '9988000000',
  orderCount: 0,
  orderIds: [],
  hasOrders: false
});

assert(Boolean(destZeroOrders) && fs.existsSync(destZeroOrders), 'Zero order file saved to local storage disk');
assert(destZeroOrders.includes('zero_orders'), 'File saved in zero_orders directory');

// Test 3: Stats check
const stats = getLocalStorageStats();
assert(stats.totalFiles >= 2, `Total files tracked in ledger: ${stats.totalFiles}`);
assert(stats.withOrders >= 1, `Files with orders tracked: ${stats.withOrders}`);
assert(stats.zeroOrders >= 1, `Zero order files tracked: ${stats.zeroOrders}`);

console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);

