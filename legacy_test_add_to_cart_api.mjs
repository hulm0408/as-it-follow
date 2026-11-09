import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  // Test with Fer three (fresh account)
  const acc = db.config.accounts['acc_8249789547'];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 2000));

  const current = await page.cookies();
  await page.deleteCookie(...current.filter(c => c.name !== 'aws-waf-token'));

  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');
  parsed.push({ name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' });
  await page.setCookie(...parsed);

  const res = await page.evaluate(async () => {
    // 1. Clear cart
    const rClear = await fetch('https://www.swiggy.com/dapi/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clearCart: 1
      })
    });
    const jClear = await rClear.json().catch(() => null);

    // 2. Add Tango Chicken and Biryani to cart
    // Item 184073068 (Tango Chicken), Item 184073096 (Biryani Value Meal)
    const cartPayload = {
      restaurantId: "67272",
      cartItems: {
        "184073068": {
          itemId: 184073068,
          quantity: 1
        },
        "184073096": {
          itemId: 184073096,
          quantity: 1
        }
      }
    };

    const rAdd = await fetch('https://www.swiggy.com/dapi/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cartPayload)
    });
    const jAdd = await rAdd.json().catch(() => null);

    // 3. Check /dapi/cart
    const rCart = await fetch('https://www.swiggy.com/dapi/cart');
    const jCart = await rCart.json().catch(() => null);

    // 4. Test coupon codes on fresh account Fer three!
    const testCodes = ['WELCOME70', 'SWIGGY70', 'FIRST70', 'TRYNEW', 'WELCOME50', 'SWIGGY50', 'FREEDEL', 'FLAT100', 'LATENIGHT'];
    const couponResults = [];

    for (const code of testCodes) {
      const rC = await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponCode: code })
      });
      const jC = await rC.json().catch(() => null);
      couponResults.push({
        code,
        status: jC?.statusMessage,
        valid: jC?.data?.cartMeta?.is_coupon_valid,
        discount: jC?.data?.cartMeta?.coupon_discount_total,
        orderTotal: jC?.data?.cartMeta?.order_total,
        error: jC?.data?.cartMeta?.coupon_error_message || jC?.statusMessage
      });
    }

    return {
      jClear,
      jAdd: { status: jAdd?.statusMessage, itemsCount: jAdd?.data?.cartItemsCount },
      jCart: {
        itemsCount: jCart?.data?.cartItemsCount,
        orderTotal: jCart?.data?.cartMeta?.order_total,
        deliveryFee: jCart?.data?.cartMeta?.deliveryFee,
        discountShare: jCart?.data?.cartMeta?.discount_total
      },
      couponResults
    };
  });

  console.log('Result:', JSON.stringify(res, null, 2));
  await browser.close();
})();
