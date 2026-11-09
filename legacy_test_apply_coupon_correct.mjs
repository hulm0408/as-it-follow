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

  const testCodes = [
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
    'JUMBO'
  ];

  const results = await page.evaluate(async (codes) => {
    // 1. Remove currently applied coupon first
    const rem = await fetch('https://www.swiggy.com/dapi/cart/removeCoupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const remJson = await rem.json().catch(() => null);

    // 2. Fetch available offers from offers/payment
    let availableOffers = [];
    try {
      const off = await fetch('https://www.swiggy.com/dapi/offers/payment?lat=26.892114&lng=80.945550&restaurantId=67272');
      const offJson = await off.json();
      const str = JSON.stringify(offJson);
      const matches = str.match(/"couponCode":"([^"]+)"/g) || [];
      for (const m of matches) {
        availableOffers.push(m.replace('"couponCode":"', '').replace('"', ''));
      }
    } catch(e) {}

    const allToTry = [...new Set([...availableOffers, ...codes])];
    const outcomes = [];

    for (const code of allToTry) {
      try {
        const appRes = await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: code })
        });
        const appJson = await appRes.json();
        if (appJson.statusCode === 0) {
          const rCart = await fetch('https://www.swiggy.com/dapi/cart');
          const jCart = await rCart.json();
          const cm = jCart?.data?.cartMeta || {};
          outcomes.push({
            code,
            success: true,
            statusMessage: appJson.statusMessage,
            discount: cm.coupon_discount_total || cm.discount_total || 0,
            finalPayable: cm.order_total,
            freeCashApplied: cm.swiggy_money || 0,
            totalSavings: cm.total_discount || 0
          });
        } else {
          outcomes.push({
            code,
            success: false,
            statusMessage: appJson.statusMessage || ''
          });
        }
      } catch(e) {
        outcomes.push({ code, error: e.message });
      }
    }

    return {
      removeResult: remJson?.statusMessage,
      availableOffers,
      outcomes
    };
  }, testCodes);

  console.log('Remove current coupon result:', results.removeResult);
  console.log('Discovered offers from offers/payment:', results.availableOffers);
  console.log('\nCoupon Test Outcomes:');
  for (const o of results.outcomes) {
    if (o.success) {
      console.log(`✅ [${o.code}] DISCOUNT: ₹${o.discount} | PAYABLE: ₹${o.finalPayable} (${o.statusMessage})`);
    } else {
      console.log(`❌ [${o.code}] ${o.statusMessage}`);
    }
  }

  await browser.close();
})();
