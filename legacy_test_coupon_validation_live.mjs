import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_6296591407'];

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
  await new Promise(r => setTimeout(r, 3500));

  const current = await page.cookies();
  await page.deleteCookie(...current.filter(c => c.name !== 'aws-waf-token'));

  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');
  parsed.push({ name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' });
  await page.setCookie(...parsed);

  const testCodes = [
    'TRYNEW',
    'STEALDEAL',
    'SWIGGYIT',
    'WELCOME50',
    'WELCOME70',
    'SWIGGY70',
    'FIRST70',
    'NEWUSER',
    'SWIGGYNEW',
    'FEAST50',
    'FEAST70',
    'MIDNIGHT',
    'LATENIGHT',
    'NIGHTOWL',
    'NIGHT50',
    'CRAVINGS',
    'PARTY',
    'FLAT100',
    'FLAT125',
    'FLAT150',
    'FLAT175',
    'JUMBO'
  ];

  const results = await page.evaluate(async (codes) => {
    const cartRes = await fetch('https://www.swiggy.com/dapi/cart');
    const cartJson = await cartRes.json();
    const origCm = cartJson?.data?.cartMeta || {};

    const list = [];
    for (const code of codes) {
      try {
        const appRes = await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: code })
        });
        const appJson = await appRes.json();
        const cm = appJson?.data?.cartMeta || {};
        list.push({
          code,
          isValid: cm.is_coupon_valid,
          discount: cm.coupon_discount_total || cm.discount_total || 0,
          orderTotal: cm.order_total,
          error: cm.coupon_error_message || appJson.statusMessage
        });
      } catch(e) {
        list.push({ code, error: e.message });
      }
    }
    return {
      subtotal: origCm.cart_subtotal,
      originalTotal: origCm.order_total,
      list
    };
  }, testCodes);

  console.log('Cart subtotal:', results.subtotal, 'Original Order Total:', results.originalTotal);
  console.log('\n--- COUPON TEST RESULTS ---');
  for (const item of results.list) {
    if (item.isValid === 1 || item.discount > 0) {
      console.log(`✅ [VALID] ${item.code} -> Discount: ₹${item.discount} | Payable: ₹${item.orderTotal}`);
    } else {
      console.log(`❌ [INVALID] ${item.code} -> ${item.error}`);
    }
  }

  await browser.close();
})();
