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

  const optimizationResult = await page.evaluate(async () => {
    // 1. Initial cart fetch
    const rCart = await fetch('https://www.swiggy.com/dapi/cart');
    const jCart = await rCart.json();
    const cm = jCart?.data?.cartMeta || {};

    const restId = cm.restaurant_details?.id || '67272';
    const rLat = cm.restaurant_details?.lat || '26.892114';
    const rLng = cm.restaurant_details?.lng || '80.945550';
    const cartVal = cm.order_total || cm.cart_subtotal || 300;

    let bestCoupon = (cm.is_coupon_valid === 1 && cm.coupon_code) ? cm.coupon_code : null;
    let maxDiscount = (cm.is_coupon_valid === 1) ? (cm.coupon_discount_total || cm.discount_total || 0) : 0;
    let minPayable = cm.order_total || 999999;

    // 2. Dynamic Discovery
    const discovered = [];
    const discoveryUrls = [
      `https://www.swiggy.com/dapi/offers/payment?lat=${rLat}&lng=${rLng}&restaurantId=${restId}&cart_val=${cartVal}`,
      `https://www.swiggy.com/dapi/offers/restaurant?lat=${rLat}&lng=${rLng}&restaurantId=${restId}`,
      `https://www.swiggy.com/dapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=${rLat}&lng=${rLng}&restaurantId=${restId}`
    ];

    for (const url of discoveryUrls) {
      try {
        const res = await fetch(url);
        const json = await res.json();
        const str = JSON.stringify(json);
        const matches = str.match(/"(?:couponCode|promoCode)":"([^"]+)"/g) || [];
        for (const m of matches) {
          const code = m.replace(/"(?:couponCode|promoCode)":"/, '').replace('"', '');
          if (code && !discovered.includes(code)) discovered.push(code);
        }
      } catch(e) {}
    }

    // 3. Priority coupon pools: 70% welcome/first-order, Late Night, Flat offers
    const firstOrder70Codes = [
      'WELCOME70',
      'SWIGGY70',
      'FIRST70',
      'TRYNEW',
      'WELCOME50',
      'SWIGGY50',
      'STEALDEAL',
      'NEWUSER',
      'SWIGGYNEW',
      'FIRSTORDER',
      'APP70',
      'WELCOME'
    ];

    const lateNightCodes = [
      'MIDNIGHT',
      'LATENIGHT',
      'NIGHTOWL',
      'FEAST50',
      'FEAST70',
      'CRAVINGS',
      'NIGHT50',
      'NIGHTDELIGHT',
      'MIDNIGHTFEAST',
      'SWIGGYNIGHT',
      'LATEFEAST',
      'MOONLIGHT'
    ];

    const flatAndPromoCodes = [
      'FLAT175',
      'FLAT150',
      'FLAT125',
      'FLAT100',
      'JUMBO',
      'PARTY',
      'DELIGHT',
      'SAVINGS',
      'TASTY',
      'SWIGGYIT',
      'FLASHSALE',
      'BINGE'
    ];

    const candidates = [...new Set([...discovered, ...firstOrder70Codes, ...lateNightCodes, ...flatAndPromoCodes])].slice(0, 25);
    const evaluationLog = [];
    let lastTestedCode = null;

    for (const code of candidates) {
      try {
        const appRes = await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: code })
        });
        const appJson = await appRes.json();
        lastTestedCode = code;

        if (appJson.statusCode === 0) {
          const ucm = appJson?.data?.cartMeta || {};
          const isValid = ucm.is_coupon_valid === 1;
          const discount = isValid ? (ucm.coupon_discount_total || ucm.discount_total || 0) : 0;
          const orderTotal = ucm.order_total;

          evaluationLog.push({
            code,
            isValid,
            discount,
            orderTotal,
            msg: ucm.coupon_error_message || (isValid ? 'Applied' : 'Invalid')
          });

          if (isValid && (discount > maxDiscount || (discount === maxDiscount && orderTotal < minPayable))) {
            maxDiscount = discount;
            minPayable = orderTotal;
            bestCoupon = code;
          }
        }
      } catch(e) {
        evaluationLog.push({ code, error: e.message });
      }
    }

    // 4. Ensure best coupon is applied, or clean remove invalid coupon
    if (bestCoupon) {
      if (lastTestedCode !== bestCoupon) {
        await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: bestCoupon })
        });
      }
    } else {
      await fetch('https://www.swiggy.com/dapi/cart/removeCoupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {});
    }

    // 5. Apply Swiggy Money if available
    let userFc = cm.user_swiggy_money || 0;
    let appliedFc = cm.swiggy_money || 0;
    if (userFc > 0 && appliedFc === 0) {
      try {
        await fetch('https://www.swiggy.com/dapi/cart/apply-swiggy-money', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply: true })
        });
      } catch (e) {}
    }

    // 6. Refreshed Cart
    const rFinal = await fetch('https://www.swiggy.com/dapi/cart');
    const jFinal = await rFinal.json();
    const finalCm = jFinal?.data?.cartMeta || {};

    const itemTotal = finalCm.cart_subtotal || finalCm.total_without_coupon_discount || 0;
    const finalCoupon = (finalCm.is_coupon_valid === 1 && finalCm.coupon_code) ? finalCm.coupon_code : (bestCoupon || null);
    const finalDiscount = (finalCm.is_coupon_valid === 1 ? (finalCm.coupon_discount_total || finalCm.discount_total || 0) : 0);
    const finalFc = finalCm.swiggy_money || 0;
    const deliveryFee = finalCm.positiveDeliveryChargesExclusive || 0;
    const taxesAndCharges = finalCm.taxesAndCharges || 0;
    const finalPayable = finalCm.order_total || (itemTotal - finalDiscount - finalFc + deliveryFee + taxesAndCharges);

    return {
      discoveredCount: discovered.length,
      testedCount: candidates.length,
      bestCoupon,
      maxDiscount,
      finalPayable,
      itemTotal,
      finalCoupon,
      finalDiscount,
      finalFc,
      deliveryFee,
      taxesAndCharges,
      validCouponsFound: evaluationLog.filter(e => e.isValid)
    };
  });

  console.log('Result:', JSON.stringify(optimizationResult, null, 2));

  await browser.close();
})();
