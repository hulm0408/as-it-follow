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

  const couponTestResults = await page.evaluate(async () => {
    // 1. Get initial cart
    const rInit = await fetch('https://www.swiggy.com/dapi/cart');
    const jInit = await rInit.json();

    const codesToTry = [
      'TRYNEW',
      'WELCOME70',
      'SWIGGY70',
      'FIRST70',
      'WELCOME50',
      'SWIGGY50',
      'STEALDEAL',
      'NEWUSER',
      'SWIGGYNEW',
      'FIRSTORDER',
      'MIDNIGHT',
      'LATENIGHT',
      'NIGHTOWL',
      'FEAST50',
      'FEAST70',
      'CRAVINGS',
      'FLAT100',
      'FLAT125',
      'FLAT150',
      'FLAT175',
      'JUMBO',
      'PARTY',
      'DELIGHT',
      'SAVINGS',
      'TASTY',
      'SWIGGYIT',
      'FREEDEL',
      'ARABECUE',
      'CHICKEN'
    ];

    const results = [];
    for (const code of codesToTry) {
      try {
        const res = await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: code })
        });
        const j = await res.json();
        const cm = j?.data?.cartMeta || {};
        results.push({
          code,
          statusCode: j?.statusCode,
          statusMessage: j?.statusMessage,
          isCouponValid: cm.is_coupon_valid,
          discount: cm.coupon_discount_total || cm.discount_total || 0,
          orderTotal: cm.order_total,
          errorMsg: cm.coupon_error_message || cm.coupon_failure_reason || j?.statusMessage
        });
      } catch (e) {
        results.push({ code, error: e.message });
      }
    }

    return {
      initialCart: {
        itemsCount: jInit?.data?.cartItemsCount,
        orderTotal: jInit?.data?.cartMeta?.order_total,
        cartMeta: jInit?.data?.cartMeta
      },
      results
    };
  });

  console.log('Cart Items Count:', couponTestResults.initialCart.itemsCount);
  console.log('Initial Order Total:', couponTestResults.initialCart.orderTotal);
  console.log('\n--- ALL COUPON TEST RESULTS ---');
  for (const r of couponTestResults.results) {
    if (r.isCouponValid === 1 || r.discount > 0) {
      console.log(`✅ [VALID] ${r.code}: Discount ₹${r.discount}, Order Total ₹${r.orderTotal}`);
    } else {
      console.log(`❌ [INVALID] ${r.code}: ${r.errorMsg}`);
    }
  }

  await browser.close();
})();
