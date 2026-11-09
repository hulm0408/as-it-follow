import assert from 'node:assert';
import {
  parseAddressDetails,
  resolveSwiggyLink,
  extractDeepLinkFromReferrerOrUrl,
  generateRealSwiggyMerchantUpiQr
} from './swiggy-cart.js';

console.log('🧪 Starting test_v47_address_and_delivery_phone_e2e.mjs...');

const SAMPLE_SWIGGY_SHARE_MSG = `Hey! Save my address on Swiggy using the link: https://swiggy.onelink.me/JgkQ/52yat6op

Address: Flat 402, Sunshine Apartments, 12th Main Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038
Phone: 9876543210`;

// 1. Backward compatibility test: parseAddressDetails without options returns null when link is present
const directCall = parseAddressDetails(SAMPLE_SWIGGY_SHARE_MSG);
assert.strictEqual(directCall, null, 'parseAddressDetails() without allowWithUrl should return null for backward compatibility');
console.log('✅ [PASS] Backward compatibility preserved: parseAddressDetails(msg) === null');

// 2. parseAddressDetails with allowWithUrl: true extracts address and phone
const parsedWithOptions = parseAddressDetails(SAMPLE_SWIGGY_SHARE_MSG, { allowWithUrl: true });
assert.ok(parsedWithOptions, 'parseAddressDetails with allowWithUrl should return parsed object');
assert.strictEqual(parsedWithOptions.mobile, '9876543210', 'Should extract mobile 9876543210');
assert.ok(parsedWithOptions.address.includes('Sunshine Apartments'), 'Should extract street address');
assert.strictEqual(parsedWithOptions.city, 'Bengaluru', 'Should identify Bengaluru');
console.log('✅ [PASS] parseAddressDetails with allowWithUrl: true extracts address & mobile 9876543210');

// 3. extractDeepLinkFromReferrerOrUrl extracts deep link from AppsFlyer redirect parameters
const sampleReferrer = 'market://details?id=in.swiggy.android&referrer=af_tranid%3D123%26af_dp%3Dswiggy%253A%252F%252Fofo%252Faddress%252Fuser123%252Ftok456';
const extractedDeep = extractDeepLinkFromReferrerOrUrl(sampleReferrer);
assert.ok(extractedDeep && extractedDeep.includes('/ofo/address/user123/tok456'), 'Should extract decoded deep link');
console.log('✅ [PASS] extractDeepLinkFromReferrerOrUrl decoded nested deep link correctly');

// 4. resolveSwiggyLink rescues unresolvable onelink using message text + phone
const resolved = await resolveSwiggyLink(SAMPLE_SWIGGY_SHARE_MSG);
assert.ok(resolved.addressDetails, 'addressDetails should exist');
assert.strictEqual(resolved.addressDetails.unresolvableShortLink, false, 'unresolvableShortLink must be false after rescue');
assert.strictEqual(resolved.addressDetails.mobile, '9876543210', 'Delivery mobile must be 9876543210');
assert.ok(resolved.addressDetails.address.includes('Sunshine Apartments'), 'Address must contain street details');
assert.strictEqual(resolved.addressSource, 'TEXT_FALLBACK', 'Source must be TEXT_FALLBACK');
console.log('✅ [PASS] resolveSwiggyLink rescued shortlink with text fallback and mobile 9876543210');

// 5. Place order payload carries alternate_mobile, recipient_details, delivery_instructions matching address phone
const mockAccount = {
  phone: '8888877777', // Account owner number (DIFFERENT from delivery address)
  userId: '9988100',
  customerId: '9988100',
  jwtTid: 'header.eyJ1c2VyX2lkIjoiOTk4ODEwMCJ9.signature',
  cookies: '_session_tid=fake_session_123; _csrf=fake_csrf; _is_logged_in=1',
  token: 'mock_token',
  sid: 'mock_sid',
  deviceId: 'mock_device'
};

const mockOrder = {
  id: 'TEST_OFO_ORDER_1',
  restaurantId: '12345',
  restaurantName: 'Mughal Zaika',
  status: 'PENDING',
  items: [{ id: 'item_1', name: 'Biryani', price: 150, quantity: 1 }],
  finalPayable: 150,
  subtotal: 150,
  address: 'Flat 402, Sunshine Apartments, Indiranagar, Bengaluru 560038',
  addressDetails: {
    id: 'addr_999',
    name: 'Ammi',
    mobile: '9876543210', // THIS IS THE RECIPIENT PHONE
    address: 'Flat 402, Sunshine Apartments, Indiranagar, Bengaluru 560038',
    lat: '12.9716',
    lng: '77.5946',
    city: 'Bengaluru'
  }
};

let capturedCartUpdatePayload = null;
let capturedPlaceOrderPayload = null;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const urlStr = String(url);
  if (urlStr.includes('chkout.swiggy.com/api/v2/cart/client') || urlStr.includes('/dapi/cart')) {
    if (opts.method === 'POST') {
      try { capturedCartUpdatePayload = JSON.parse(opts.body || '{}'); } catch {}
    }
    return new Response(JSON.stringify({
      statusCode: 0,
      data: {
        cartId: 'cart_1',
        restaurant_details: { restaurant_id: '12345', name: 'Mughal Zaika' },
        order_total: 150,
        final_payable: 150,
        trade_discount_total: 0,
        address_id: 'addr_999',
        cart_total_count: 1,
        cart_menu_items: [{ menu_item_id: 'item_1', name: 'Biryani', price: 150, quantity: 1 }]
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('chkout.swiggy.com/api/v2/order/place') || urlStr.includes('payments.swiggy.com/api/v3/order/place')) {
    capturedPlaceOrderPayload = JSON.parse(opts.body || '{}');
    return new Response(JSON.stringify({
      statusCode: 0,
      data: {
        order_data: {
          order_id: 'SWIGGY_ORD_4701',
          order_total: 250,
          targeted_marketplace_payment_reference_id: 'TXN4701',
          app_redirection_info: {
            upiRedirect: {
              upiIntentRedirect: {
                upiIntentUrl: 'upi://pay?pa=swiggy@axis&pn=Swiggy&am=250.00'
              }
            }
          }
        }
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('dapi/address') || urlStr.endsWith('/address')) {
    return new Response(JSON.stringify({
      statusCode: 0,
      statusMessage: 'Address created',
      data: { id: 'addr_999', address_id: 'addr_999' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('/dapi/profile/info')) {
    return new Response(JSON.stringify({
      statusCode: 0,
      data: { customer_id: '9988100', name: 'Bot Owner Account', mobile: '8888877777' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('/dapi/order/all')) {
    return new Response(JSON.stringify({
      statusCode: 0,
      tid: 'header.eyJ1c2VyX2lkIjoiOTk4ODEwMCJ9.signature',
      sid: 'test_sid_123',
      data: { orders: [] }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ statusCode: 0, data: {} }), { status: 200 });
};

try {
  const qrRes = await generateRealSwiggyMerchantUpiQr({ account: mockAccount, order: mockOrder, forceNewQr: true });
  assert.ok(qrRes?.upiIntentUrl || qrRes?.upiUri, 'Must return UPI Intent URL');

  assert.ok(capturedPlaceOrderPayload, 'order/place must have been called');
  assert.strictEqual(capturedPlaceOrderPayload.alternate_mobile, '9876543210', 'Place order alternate_mobile must be recipient phone');
  assert.strictEqual(capturedPlaceOrderPayload.recipient_phone, '9876543210', 'Place order recipient_phone must be recipient phone');
  assert.strictEqual(capturedPlaceOrderPayload.recipient_details?.phone, '9876543210', 'Place order recipient_details must be recipient phone');
  assert.ok(capturedPlaceOrderPayload.delivery_instructions?.some(inst => inst.phone === '9876543210'), 'Delivery instructions must call 9876543210');
  assert.ok(capturedPlaceOrderPayload.order_comments.includes('9876543210'), 'Place order order_comments must mention 9876543210');

  console.log('✅ [PASS] Delivery partner instructions strictly bound to address phone 9876543210 (NOT account phone 8888877777)');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('🎉 ALL V47 ADDRESS FETCHING AND DELIVERY PHONE TESTS PASSED (5/5)!');
