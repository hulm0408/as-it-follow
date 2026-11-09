import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  // Use Umbashiya or any other account
  const acc = db.config.accounts['acc_6296591407'];
  const groupCartId = '642855918';
  const restaurantId = '67272';

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('Navigating to swiggy.com...');
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

  const testResults = await page.evaluate(async (gcId, rId) => {
    const res = {};

    // 1. GET /dapi/cart/group/view?groupCartId=...
    try {
      const r = await fetch(`https://www.swiggy.com/dapi/cart/group/view?groupCartId=${gcId}`);
      res.view = { status: r.status, data: await r.json() };
    } catch(e) {
      res.view = { error: e.message };
    }

    // 2. POST /dapi/cart/group/join
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart/group/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupCartId: gcId })
      });
      res.join = { status: r.status, data: await r.json() };
    } catch(e) {
      res.join = { error: e.message };
    }

    // 3. POST /dapi/cart with group_cart_id
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_cart_id: String(gcId), restaurantId: String(rId) })
      });
      res.postCartWithGcId = { status: r.status, data: await r.json() };
    } catch(e) {
      res.postCartWithGcId = { error: e.message };
    }

    // 4. GET /dapi/cart
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart');
      res.getCart = { status: r.status, data: await r.json() };
    } catch(e) {
      res.getCart = { error: e.message };
    }

    return res;
  }, groupCartId, restaurantId);

  console.log('--- TEST RESULTS ---');
  console.log('VIEW:', JSON.stringify(testResults.view, null, 2));
  console.log('JOIN:', JSON.stringify(testResults.join, null, 2));
  console.log('POST_CART_WITH_GC_ID:', JSON.stringify(testResults.postCartWithGcId, null, 2));
  console.log('GET_CART:', JSON.stringify({
    status: testResults.getCart.status,
    statusCode: testResults.getCart.data?.statusCode,
    statusMessage: testResults.getCart.data?.statusMessage,
    cartMeta: testResults.getCart.data?.data?.cartMeta,
    cartItemsKeys: testResults.getCart.data?.data?.cartItemsKeys,
    cartItems: testResults.getCart.data?.data?.cartItems?.map(i => ({ id: i.itemId, name: i.name, qty: i.quantity, price: i.price }))
  }, null, 2));

  await browser.close();
})();
