import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let _warmBrowser = null;
let _warmPage = null;
let _lastWafTime = 0;

async function getWarmPage() {
  if (!_warmBrowser || !_warmBrowser.isConnected()) {
    console.log('[WarmBrowser] Launching browser...');
    _warmBrowser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: false,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    _warmBrowser.on('disconnected', () => {
      _warmBrowser = null;
      _warmPage = null;
    });
  }

  if (!_warmPage || _warmPage.isClosed()) {
    console.log('[WarmBrowser] Creating new page & solving WAF...');
    _warmPage = await _warmBrowser.newPage();
    await _warmPage.setViewport({ width: 1280, height: 900 });
    await _warmPage.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    for (let i = 0; i < 15; i++) {
      const cookies = await _warmPage.cookies();
      const waf = cookies.find(c => c.name === 'aws-waf-token');
      if (waf && waf.value.length > 50) break;
      await new Promise(r => setTimeout(r, 400));
    }
    _lastWafTime = Date.now();
  } else if (Date.now() - _lastWafTime > 15 * 60 * 1000) {
    console.log('[WarmBrowser] Refreshing WAF token...');
    await _warmPage.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    _lastWafTime = Date.now();
  }

  return _warmPage;
}

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_6296591407'];

  console.log('=== TEST 1: WARM UP BROWSER ===');
  const t0 = Date.now();
  const page = await getWarmPage();
  console.log(`Warm-up took: ${(Date.now() - t0) / 1000}s`);

  console.log('\n=== TEST 2: FETCH CART & OPTIMIZE (SIMULATING 2nd REQUEST) ===');
  const t1 = Date.now();

  // Set account cookies quickly
  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');
  parsed.push({ name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' });
  await page.setCookie(...parsed);

  const cartResult = await page.evaluate(async () => {
    // 1. Fetch live cart
    const r = await fetch('https://www.swiggy.com/dapi/cart');
    const j = await r.json();
    const cm = j?.data?.cartMeta || {};

    // 2. Fast discover offers
    const disc = [];
    try {
      const restId = cm.restaurant_details?.id || '67272';
      const rOffers = await fetch(`https://www.swiggy.com/dapi/offers/restaurant?restaurantId=${restId}&lat=26.8467&lng=80.9462`);
      const jOffers = await rOffers.json();
      const str = JSON.stringify(jOffers);
      const matches = str.match(/"(?:couponCode|promoCode|coupon|offerCode)":"([A-Z0-9_-]+)"/gi) || [];
      for (const m of matches) {
        const c = m.split('":"')[1].replace('"', '').trim().toUpperCase();
        if (c && !disc.includes(c)) disc.push(c);
      }
    } catch(e) {}

    // Test max 3 candidates
    const candidates = [...new Set([...disc, 'TRYNEW'])].slice(0, 3);
    let best = null;
    let maxDisc = 0;

    for (const code of candidates) {
      try {
        const appR = await fetch('https://www.swiggy.com/dapi/cart/applyCoupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: code })
        });
        const appJ = await appR.json();
        const ucm = appJ?.data?.cartMeta || {};
        if (ucm.is_coupon_valid === 1) {
          const d = ucm.coupon_discount_total || ucm.discount_total || 0;
          if (d > maxDisc) {
            maxDisc = d;
            best = code;
          }
        }
      } catch(e) {}
    }

    return {
      orderTotal: cm.order_total,
      itemsCount: j?.data?.cartItemsCount,
      bestCoupon: best,
      discount: maxDisc
    };
  });

  const durationSec = (Date.now() - t1) / 1000;
  console.log(`\n⚡ Cart Fetch & Optimize took: ${durationSec}s!`);
  console.log('Result:', cartResult);

  if (_warmBrowser) await _warmBrowser.close();
})();
