/**
 * test_group_cart_transfer.mjs
 * Tests the full Group Cart -> Personal Cart transfer flow.
 * Usage: node test_group_cart_transfer.mjs [groupCartUrl] [accountId]
 */

import { resolveSwiggyLink, verifyAndInspectSwiggyLink } from './swiggy-cart.js';
import { getDb } from './store.js';

const args = process.argv.slice(2);
const testUrl = args[0] || 'https://swig.gy/gc/67272/Umbashiya-642855918';
const accountId = args[1] || null;

const db = getDb();
const accounts = db.config?.accounts || {};

let acc = null;
if (accountId && accounts[accountId]) {
  acc = accounts[accountId];
} else {
  acc = Object.values(accounts).find(a => a.isLoggedIn && a.token);
}

if (!acc) {
  console.error('No logged-in account with token/tid found in db.json');
  console.log('Available accounts:', Object.keys(accounts));
  process.exit(1);
}

console.log('GROUP CART TRANSFER TEST');
console.log(`Account  : ${acc.name || acc.id} (${acc.phone})`);
console.log(`Test URL : ${testUrl}`);
console.log(`Token    : ${acc.token ? acc.token.slice(0, 20) + '...' : 'MISSING'}`);
console.log(`TID      : ${acc.tid ? acc.tid.slice(0, 30) + '...' : 'MISSING'}`);

// Step 1
console.log('\n[1/3] Resolving Swiggy link...');
const meta = await resolveSwiggyLink(testUrl);
console.log('  type         :', meta.type);
console.log('  restaurantId :', meta.restaurantId);
console.log('  groupCartId  :', meta.groupCartId);
console.log('  hostName     :', meta.hostName);

if (!meta.groupCartId) {
  console.error('This URL does not contain a group cart ID. Test aborted.');
  process.exit(1);
}

// Step 2
console.log('\n[2/3] Running verifyAndInspectSwiggyLink (30-60s)...');
const accountSession = {
  token: acc.token || null,
  tid: acc.tid || null,
  sid: acc.sid || null,
  deviceId: acc.deviceId || null
};

const startTime = Date.now();
const result = await verifyAndInspectSwiggyLink(testUrl, acc.cookies || '', accountSession);
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`\n[3/3] Result (took ${elapsed}s):`);

if (result.groupCartError) {
  console.error('GROUP CART ERROR:', result.groupCartError);
  process.exit(1);
}

if (!result.verified) {
  console.warn('Not fully verified. Message:', result.message || '(none)');
} else {
  console.log('VERIFIED OK');
}

if (result.groupCartSyncWarning) {
  console.warn('Sync Warning:', result.groupCartSyncWarning);
}

console.log('Restaurant   :', result.restaurantName);
console.log('Host         :', result.hostName);
console.log('GroupCart ID :', result.groupCartId);

if (result.items && result.items.length > 0) {
  console.log(`\nItems (${result.items.length}):`);
  for (const it of result.items) {
    console.log(`  - ${it.name} x${it.qty} = Rs.${it.lineTotal ?? (it.price * it.qty)}`);
  }
} else {
  console.warn('No items found in cart after transfer');
}

console.log('\nBill Summary:');
console.log('  Item Total   : Rs.' + (result.itemTotal || result.subtotal || 0));
if (result.couponCode)         console.log('  Coupon       : ' + result.couponCode + ' (-Rs.' + result.discountAmount + ')');
if (result.deliveryFee > 0)    console.log('  Delivery Fee : Rs.' + result.deliveryFee);
if (result.taxesAndCharges > 0) console.log('  Taxes        : Rs.' + result.taxesAndCharges);
console.log('  Final Payable: Rs.' + result.finalPayable);
if (result.totalSavings > 0)   console.log('  Total Savings: Rs.' + result.totalSavings);

if (result.verified && result.items?.length > 0 && result.finalPayable > 0) {
  console.log('\nTEST PASSED: Group Cart items successfully transferred and verified!');
} else if (result.items?.length > 0) {
  console.log('\nPARTIAL PASS: Items found but cart not fully synced (no final payable amount).');
} else {
  console.error('\nTEST FAILED: No items found after transfer attempt.');
  process.exit(1);
}
