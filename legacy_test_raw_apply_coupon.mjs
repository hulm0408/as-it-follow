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

  const rawTest = await page.evaluate(async () => {
    const res = await fetch('https://www.swiggy.com/dapi/cart/apply-coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couponCode: 'WELCOME50' })
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch(e) {
      body = text;
    }
    return {
      status: res.status,
      body
    };
  });

  console.log('apply-coupon test result:', rawTest);

  // Also test removing coupon
  const removeTest = await page.evaluate(async () => {
    const res = await fetch('https://www.swiggy.com/dapi/cart/remove-coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  });
  console.log('remove-coupon test result:', removeTest);

  await browser.close();
})();
