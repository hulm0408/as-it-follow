import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  // We can test with Umbashiya or Fer three
  const acc = db.config.accounts['acc_6296591407'];
  const groupCartId = '642855918';

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

  const results = await page.evaluate(async (gcId) => {
    const log = [];

    // 1. Try GET /dapi/cart/group/view?groupCartId=...
    try {
      const vRes = await fetch(`https://www.swiggy.com/dapi/cart/group/view?groupCartId=${gcId}`);
      const vJson = await vRes.json();
      log.push({ ep: 'view', status: vRes.status, json: vJson });
    } catch(e) {
      log.push({ ep: 'view', error: e.message });
    }

    // 2. Try POST /dapi/cart/group/join with { groupCartId: gcId }
    try {
      const jRes = await fetch('https://www.swiggy.com/dapi/cart/group/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupCartId: gcId, guestUserName: 'Guest' })
      });
      const jJson = await jRes.json();
      log.push({ ep: 'join', status: jRes.status, json: jJson });
    } catch(e) {
      log.push({ ep: 'join', error: e.message });
    }

    // 3. Try GET /dapi/cart/group/fetch-active
    try {
      const faRes = await fetch('https://www.swiggy.com/dapi/cart/group/fetch-active');
      const faJson = await faRes.json();
      log.push({ ep: 'fetch-active', status: faRes.status, json: faJson });
    } catch(e) {
      log.push({ ep: 'fetch-active', error: e.message });
    }

    // 4. Try POST /dapi/cart/group/transfer
    try {
      const tRes = await fetch('https://www.swiggy.com/dapi/cart/group/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupCartId: gcId })
      });
      const tJson = await tRes.json();
      log.push({ ep: 'transfer', status: tRes.status, json: tJson });
    } catch(e) {
      log.push({ ep: 'transfer', error: e.message });
    }

    // 5. Check /dapi/cart
    try {
      const cRes = await fetch('https://www.swiggy.com/dapi/cart');
      const cJson = await cRes.json();
      log.push({ ep: 'cart', status: cRes.status, items: cJson?.data?.cartItems, meta: cJson?.data?.cartMeta });
    } catch(e) {
      log.push({ ep: 'cart', error: e.message });
    }

    return log;
  }, groupCartId);

  console.log('--- DAPI GROUP CART PROBE RESULTS ---');
  for (const r of results) {
    console.log(`\n[${r.ep}] Status: ${r.status}`);
    if (r.error) console.log('Error:', r.error);
    if (r.json) console.log(JSON.stringify(r.json, null, 2).slice(0, 500));
    if (r.items) console.log('Cart Items count:', Object.keys(r.items || {}).length, 'order_total:', r.meta?.order_total);
  }

  await browser.close();
})();
