import {
  analyzeJsonAccountOrders,
  formatOrderHistoryMonospace,
  formatOrderDate,
  formatOrderValue
} from './json-analyzer.js';

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

console.log('--- Testing Monospace History Formatting ---');

// Test formatOrderDate
assert(formatOrderDate('2026-11-05T20:30:00.000Z').includes('Nov'), 'Formats ISO timestamp to readable date');
assert(formatOrderDate(1730818200000).includes('Nov'), 'Formats epoch ms to readable date');
assert(formatOrderDate('05 Nov, 08:30 PM') === '05 Nov, 08:30 PM', 'Preserves pre-formatted date string');

// Test formatOrderValue
assert(formatOrderValue(250) === '₹250', 'Formats integer value');
assert(formatOrderValue('180.50') === '₹181', 'Formats string decimal value');
assert(formatOrderValue(null) === 'N/A', 'Handles null value gracefully');

// Test formatOrderHistoryMonospace
const sampleOrders = [
  { id: '251838950110925', value: 250, placedAt: '2026-11-05T20:30:00.000Z' },
  { id: '251838950110926', value: 180, placedAt: '04 Nov, 01:15 PM' }
];

const mono = formatOrderHistoryMonospace({
  fileName: 'acc_test.json',
  phone: '9876543210',
  orderCount: 2,
  orders: sampleOrders
});

assert(mono.startsWith('<pre><code>') && mono.endsWith('</code></pre>'), 'Wrapped in <pre><code> for monospace & Telegram copy icon');
assert(mono.includes('ORDER ID : #251838950110925'), 'Includes formatted ORDER ID');
assert(mono.includes('VALUE    : ₹250'), 'Includes formatted VALUE');
assert(mono.includes('PLACED   :'), 'Includes formatted PLACED timestamp');
assert(mono.includes('----------------------------------'), 'Includes divider lines');

console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
