import { formatMonospaceBill } from './chat-flow.js';
import QRCode from 'qrcode';

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

console.log('--- Testing Chat Mockup Flow Formatting & Logic ---');

// Test 1: Monospace Bill Card
const mockOrder = {
  id: 'ORD_TEST_101',
  placedFrom: '8582***254',
  addressDetails: {
    mobile: '9823305540',
    address: 'Flat no. 412, 4th floor.....'
  },
  items: [
    { name: 'Paneer Kolhapuri', price: 230, qty: 1 }
  ],
  itemTotal: 230,
  finalPayable: 29,
  toPay: 29
};

const bill = formatMonospaceBill(mockOrder);

assert(bill.text.startsWith('<pre><code>') && bill.text.endsWith('</code></pre>'), 'Bill card is wrapped in <pre><code> for monospace and Telegram copy icon');
assert(bill.text.includes('PLACED FROM 8582***254'), 'Bill contains masked placed from phone');
assert(bill.text.includes('9823305540'), 'Bill contains receiver mobile number');
assert(bill.text.includes('Flat no. 412, 4th floor.....'), 'Bill contains delivery address');
assert(bill.text.includes('Paneer Kolhapuri\n₹230 × 1 = ₹230'), 'Bill contains formatted item line with price and quantity');
assert(bill.text.includes('Items Total: ₹230'), 'Bill contains items total');
assert(bill.text.includes('To Pay: ₹29'), 'Bill contains To Pay amount');

// Test 2: QR Code buffer generation
const qrBuffer = await QRCode.toBuffer('upi://pay?pa=swiggyorder@icici&pn=Swiggy&am=29&cu=INR&tn=Swiggy%20Order', {
  type: 'png',
  width: 450
});

assert(Buffer.isBuffer(qrBuffer) && qrBuffer.length > 500, 'QR Code is successfully rendered as PNG buffer for Telegram sendPhoto');

console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);

