import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_8249789547'];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 2000));

  const parsed = [
    { name: '_session_tid', value: acc.tid, domain: '.swiggy.com', path: '/' },
    { name: 'tid', value: acc.tid, domain: '.swiggy.com', path: '/' },
    { name: 'token', value: acc.token || '', domain: '.swiggy.com', path: '/' },
    { name: '_sid', value: acc.sid || '', domain: '.swiggy.com', path: '/' },
    { name: '_device_id', value: acc.deviceId || '', domain: '.swiggy.com', path: '/' },
    { name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' },
    { name: 'userLocation', value: '%7B%22lat%22%3A%2226.8467%22%2C%22lng%22%3A%2280.9462%22%2C%22address%22%3A%22Aliganj%2C%20Lucknow%22%2C%22area%22%3A%22Aliganj%22%7D', domain: '.swiggy.com', path: '/' }
  ];
  await page.setCookie(...parsed);

  // Wait 1.5s after setting cookies
  await new Promise(r => setTimeout(r, 1500));

  const res = await page.evaluate(async () => {
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart');
      const j = await r.json();
      return {
        status: j.statusCode,
        message: j.statusMessage,
        cartItemsCount: j?.data?.cartItemsCount,
        hasData: !!j?.data
      };
    } catch(e) {
      return { error: e.message };
    }
  });

  console.log('Result for Fer three with location:', res);
  await browser.close();
})();
