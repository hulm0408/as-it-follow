import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_6296591407']; // Umbashiya (has cart)

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

  // Check current cart
  const cartInfo = await page.evaluate(async () => {
    const r = await fetch('https://www.swiggy.com/dapi/cart');
    const j = await r.json();
    const cm = j?.data?.cartMeta || {};
    return {
      restaurantId: cm.restaurant_details?.id,
      restaurantName: cm.restaurant_details?.name,
      orderTotal: cm.order_total,
      subtotal: cm.cart_subtotal,
      couponCode: cm.coupon_code,
      discount: cm.coupon_discount_total,
      lat: cm.restaurant_details?.lat || '26.8658609',
      lng: cm.restaurant_details?.lng || '80.9307755'
    };
  });
  console.log('Cart Info:', cartInfo);

  // Test coupon APIs
  const couponTests = await page.evaluate(async (info) => {
    const endpoints = [
      `https://www.swiggy.com/dapi/offers/payment?lat=${info.lat}&lng=${info.lng}&restaurantId=${info.restaurantId}&cart_val=${info.subtotal || 300}`,
      `https://www.swiggy.com/dapi/offers/restaurant?lat=${info.lat}&lng=${info.lng}&restaurantId=${info.restaurantId}`,
      `https://www.swiggy.com/dapi/offers/v1?lat=${info.lat}&lng=${info.lng}&restaurantId=${info.restaurantId}`
    ];

    const foundCoupons = [];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep);
        const j = await r.json();
        // search JSON for coupon codes
        const str = JSON.stringify(j);
        const codes = str.match(/"couponCode":"([^"]+)"/g) || [];
        for (const c of codes) {
          const code = c.replace('"couponCode":"', '').replace('"', '');
          if (!foundCoupons.includes(code)) foundCoupons.push(code);
        }
      } catch(e) {}
    }

    // List of popular codes to test
    const targetCodes = [
      ...foundCoupons,
      'WELCOME70',
      'SWIGGY70',
      'FIRST70',
      'STEALDEAL',
      'WELCOME50',
      'SWIGGYIT',
      'TRYNEW',
      'FEAST50',
      'FEAST70',
      'MIDNIGHT',
      'LATENIGHT',
      'NIGHTOWL',
      'FLAT100',
      'FLAT125',
      'FLAT150',
      'FLAT175',
      'JUMBO',
      'CRAVINGS',
      'PARTY'
    ];

    const results = [];
    for (const code of [...new Set(targetCodes)]) {
      try {
        const appRes = await fetch('https://www.swiggy.com/dapi/cart/apply-coupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: code })
        });
        const appJson = await appRes.json();
        if (appJson.statusCode === 0) {
          // fetch updated cart to see discount
          const r2 = await fetch('https://www.swiggy.com/dapi/cart');
          const j2 = await r2.json();
          const cm2 = j2?.data?.cartMeta || {};
          results.push({
            code,
            success: true,
            statusMessage: appJson.statusMessage,
            discount: cm2.coupon_discount_total || cm2.discount_total || 0,
            finalPayable: cm2.order_total,
            description: appJson.data?.description || appJson.data?.couponDescription || ''
          });
        } else {
          results.push({
            code,
            success: false,
            statusMessage: appJson.statusMessage || 'Not applicable'
          });
        }
      } catch(e) {
        results.push({ code, error: e.message });
      }
    }

    return { foundCoupons, results };
  }, cartInfo);

  console.log('Discovered coupons from API:', couponTests.foundCoupons);
  console.log('\nCoupon Application Results:');
  for (const r of couponTests.results) {
    if (r.success) {
      console.log(`✅ [${r.code}] SUCCESS! Discount: ₹${r.discount}, Final Payable: ₹${r.finalPayable} - ${r.description || r.statusMessage}`);
    } else {
      console.log(`❌ [${r.code}] Failed: ${r.statusMessage}`);
    }
  }

  await browser.close();
})();
