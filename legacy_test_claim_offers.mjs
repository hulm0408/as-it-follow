import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testOffers() {
  const db = getDb();
  // Find an account with cookies
  const acc = Object.values(db.config.accounts || {}).find(a => a.cookies);
  if (!acc) {
    console.log('No account with cookies found in DB');
    return;
  }
  console.log('Testing with account:', acc.name || acc.phone);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-position=-32000,-32000',
      '--no-sandbox'
    ]
  });

  const page = await browser.newPage();
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await new Promise(r => setTimeout(r, 2000));

  // Set cookies
  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  });
  await page.setCookie(...parsed);

  const endpoints = [
    '/dapi/rewards/claim',
    '/dapi/user/vouchers',
    '/dapi/user/swiggy-money/opt-in',
    '/dapi/offers/payment?lat=26.8467&lng=80.9462&restaurantId=67272&cart_val=199',
    '/dapi/cart/get-coupons?restaurantId=67272'
  ];

  for (const ep of endpoints) {
    const r = await page.evaluate(async (url) => {
      try {
        const isPost = url.includes('claim') || url.includes('opt-in');
        const res = await fetch(url, {
          method: isPost ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          ...(isPost ? { body: JSON.stringify({ campaign: 'swiggy_late_night' }) } : {}),
          credentials: 'include'
        });
        return { status: res.status, data: await res.json().catch(() => ({})) };
      } catch (e) {
        return { error: e.message };
      }
    }, ep);
    console.log(`Endpoint ${ep} ->`, JSON.stringify(r).slice(0, 200));
  }

  await browser.close();
}

testOffers().catch(console.error);
