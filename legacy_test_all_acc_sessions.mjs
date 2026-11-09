import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('1. Solving WAF on swiggy.com...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 1500));

  for (const [id, acc] of Object.entries(db.config.accounts)) {
    if (!acc.cookies && !acc.tid) continue;
    console.log(`\nChecking Account: ${acc.name} (${id})...`);

    // Clear existing cookies
    const current = await page.cookies();
    await page.deleteCookie(...current.filter(c => c.name !== 'aws-waf-token'));

    const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
    const parsed = cookiePairs.map(p => {
      const [name, ...val] = p.split('=');
      return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
    }).filter(c => c.name !== 'aws-waf-token');

    if (acc.tid && !parsed.some(c => c.name === '_session_tid')) {
      parsed.push({ name: '_session_tid', value: acc.tid, domain: '.swiggy.com', path: '/' });
    }
    if (acc.token && !parsed.some(c => c.name === 'token')) {
      parsed.push({ name: 'token', value: acc.token, domain: '.swiggy.com', path: '/' });
    }
    if (acc.sid && !parsed.some(c => c.name === '_sid')) {
      parsed.push({ name: '_sid', value: acc.sid, domain: '.swiggy.com', path: '/' });
    }
    if (acc.deviceId && !parsed.some(c => c.name === '_device_id')) {
      parsed.push({ name: '_device_id', value: acc.deviceId, domain: '.swiggy.com', path: '/' });
    }
    parsed.push({ name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' });

    await page.setCookie(...parsed);

    if (id === 'acc_6296591407') {
      const activeCookies = await page.cookies();
      console.log('Active cookies for Umbashiya:', activeCookies.map(c => `${c.name}=${c.value.slice(0, 20)}...`));
    }

    const res = await page.evaluate(async () => {
      try {
        const r = await fetch('https://www.swiggy.com/dapi/cart');
        const j = await r.json();
        return j;
      } catch (e) {
        return { error: e.message };
      }
    });

    if (id === 'acc_6296591407') {
      import('fs').then(fs => fs.writeFileSync('umbashiya_cart_raw.json', JSON.stringify(res, null, 2)));
    }

    console.log(`Result for ${acc.name}:`, {
      status: res.statusCode,
      message: res.statusMessage,
      itemsCount: res?.data?.cartItemsCount,
      cartTotal: res?.data?.cartMeta?.order_total,
      restaurant: res?.data?.cartMeta?.restaurant_details?.name
    });
  }

  await browser.close();
})();
