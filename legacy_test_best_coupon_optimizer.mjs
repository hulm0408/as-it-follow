import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_6296591407']; // Umbashiya

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

  const optimizationResult = await page.evaluate(async () => {
    // 1. Initial cart state
    let rCart = await fetch('https://www.swiggy.com/dapi/cart');
    let jCart = await rCart.json();
    let cm = jCart?.data?.cartMeta || {};

    let bestCoupon = cm.coupon_code || null;
    let maxDiscount = cm.coupon_discount_total || cm.discount_total || 0;
    let minPayable = cm.order_total || 999999;

    const restaurantId = cm.restaurant_details?.id || '67272';
    const lat = cm.restaurant_details?.lat || '26.892114';
    const lng = cm.restaurant_details?.lng || '80.945550';
    const subtotal = cm.cart_subtotal || cm.order_total || 300;

    // 2. Discover available offers from Swiggy APIs
    const discovered = [];
    const offerUrls = [
      `https://www.swiggy.com/dapi/offers/payment?lat=${lat}&lng=${lng}&restaurantId=${restaurantId}&cart_val=${subtotal}`,
      `https://www.swiggy.com/dapi/offers/restaurant?lat=${lat}&lng=${lng}&restaurantId=${restaurantId}`
    ];

    for (const url of offerUrls) {
      try {
        const offRes = await fetch(url);
        const offJson = await offRes.json();
        const str = JSON.stringify(offJson);
        const matches = str.match(/"couponCode":"([^"]+)"/g) || [];
        for (const m of matches) {
          const c = m.replace('"couponCode":"', '').replace('"', '');
          if (!discovered.includes(c)) discovered.push(c);
        }
      } catch(e) {}
    }

    // Curated high-value coupon list including Late Night, First Order 70%, Flat discounts
    const curatedCoupons = [
      'WELCOME70',
      'SWIGGY70',
      'FIRST70',
      'WELCOME50',
      'STEALDEAL',
      'SWIGGYIT',
      'TRYNEW',
      'FEAST50',
      'FEAST70',
      'MIDNIGHT',
      'LATENIGHT',
      'NIGHTOWL',
      'FLAT175',
      'FLAT150',
      'FLAT125',
      'FLAT100',
      'JUMBO',
      'CRAVINGS',
      'PARTY',
      'DELIGHT',
      'TASTY',
      'FLASHSALE'
    ];

    const candidateCodes = [...new Set([...discovered, ...curatedCoupons])];
    const log = [];

    for (const code of candidateCodes) {
      try {
        const appRes = await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: code })
        });
        const appJson = await appRes.json();
        if (appJson.statusCode === 0) {
          const updatedCm = appJson?.data?.cartMeta || {};
          const discount = updatedCm.coupon_discount_total || updatedCm.discount_total || 0;
          const orderTotal = updatedCm.order_total;

          log.push({ code, success: true, discount, orderTotal });

          // If this coupon provides higher discount or lower payable, mark it as best!
          if (discount > maxDiscount || (discount === maxDiscount && orderTotal < minPayable)) {
            maxDiscount = discount;
            minPayable = orderTotal;
            bestCoupon = code;
          }
        } else {
          log.push({ code, success: false, reason: appJson.statusMessage });
        }
      } catch(e) {
        log.push({ code, error: e.message });
      }
    }

    // Re-apply best coupon if needed
    if (bestCoupon) {
      await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponCode: bestCoupon })
      });
    }

    // Fetch final updated cart
    rCart = await fetch('https://www.swiggy.com/dapi/cart');
    jCart = await rCart.json();
    const finalCm = jCart?.data?.cartMeta || {};

    return {
      bestCoupon,
      maxDiscount,
      finalPayable: finalCm.order_total,
      finalCartCoupon: finalCm.coupon_code,
      itemTotal: finalCm.cart_subtotal,
      deliveryFee: finalCm.positiveDeliveryChargesExclusive,
      taxes: finalCm.taxesAndCharges,
      testedCount: candidateCodes.length,
      log: log.filter(l => l.success)
    };
  });

  console.log('Coupon Optimization Result:', JSON.stringify(optimizationResult, null, 2));

  await browser.close();
})();
