import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let _warmBrowser = null;

async function getBrowser() {
  if (!_warmBrowser || !_warmBrowser.isConnected()) {
    _warmBrowser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: false,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu']
    });
    _warmBrowser.on('disconnected', () => { _warmBrowser = null; });
  }
  return _warmBrowser;
}

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_6296591407'];

  const browser = await getBrowser();

  // Test 1
  const t0 = Date.now();
  const page1 = await browser.newPage();
  await page1.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 15; i++) {
    const cookies = await page1.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 300));
  }
  // Wait just 1 second for WAF reload
  await new Promise(r => setTimeout(r, 1200));

  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');
  parsed.push({ name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' });
  await page1.setCookie(...parsed);

  const cart = await page1.evaluate(async () => {
    const r = await fetch('https://www.swiggy.com/dapi/cart');
    const j = await r.json();
    return {
      status: j?.statusCode,
      orderTotal: j?.data?.cartMeta?.order_total,
      itemsCount: j?.data?.cartItemsCount
    };
  });
  console.log(`First run took: ${(Date.now() - t0) / 1000}s`, cart);
  await page1.close();

  // Test 2 (Warm browser already running!)
  const t1 = Date.now();
  const page2 = await browser.newPage();
  await page2.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  // WAF token is already cached in browser context!
  await page2.setCookie(...parsed);
  const cart2 = await page2.evaluate(async () => {
    const r = await fetch('https://www.swiggy.com/dapi/cart');
    const j = await r.json();
    return {
      status: j?.statusCode,
      orderTotal: j?.data?.cartMeta?.order_total,
      itemsCount: j?.data?.cartItemsCount
    };
  });
  console.log(`Second run took: ${(Date.now() - t1) / 1000}s`, cart2);
  await page2.close();

  await browser.close();
})();
