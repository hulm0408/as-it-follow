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
    'WELCOME',
    'SWIGGY',
    'TRYNEW',
    'PARTY',
    'SWIGGYNIGHT',
    'MIDNIGHTFEAST',
    'FEAST',
    'BINGE',
    'SAVINGS',
    'SWIGGYONE',
    'SUPER',
    'ONE',
    'MEAL',
    'FOODIE',
    'DELIGHT',
    'TASTY',
    'CRAVE',
    'DEAL',
    'HUNGRY',
    'FLAT50',
    'FLAT70',
    'FLAT200',
    'PAYTM',
    'CRED',
    'APPOFFER',
    'SWIGGYAPP',
    'WELCOME2026',
    'SWIGGY2026',
    'FIRSTSWIGGY',
    'NIGHT',
    'NIGHTMUNCH',
    'AFTERHOURS'
  ];

  const results = await page.evaluate(async (codes) => {
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
    return list;
  }, testCodes);

  console.log('\n--- COUPON TEST 2 RESULTS ---');
  for (const item of results) {
    if (item.isValid === 1 || item.discount > 0) {
      console.log(`✅ [VALID] ${item.code} -> Discount: ₹${item.discount} | Payable: ₹${item.orderTotal}`);
    } else if (item.error && !item.error.includes('does not exist')) {
      console.log(`🟡 [RECOGNIZED BUT CONDITION NOT MET] ${item.code} -> ${item.error}`);
    } else {
      console.log(`❌ [NOT FOUND] ${item.code}`);
    }
  }

  await browser.close();
})();
