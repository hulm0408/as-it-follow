import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testDelete() {
  const db = getDb();
  // We just logged in kaavii (9644993392) or another account
  const accEntry = Object.entries(db.config.accounts || {}).find(([k, a]) => a.phone === '9644993392' || a.phone === '9373343402') || Object.entries(db.config.accounts || {})[0];
  if (!accEntry) {
    console.log('No account found');
    return;
  }
  const [accKey, acc] = accEntry;
  console.log('Testing with account:', accKey, acc.phone, acc.name);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--window-position=-32000,-32000', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  });
  await page.setCookie(...parsed);

  const testEndpoints = [
    '/dapi/user/delete-account',
    '/dapi/user/delete',
    '/dapi/user/delete-account/otp',
    '/dapi/user/account/delete',
    '/dapi/auth/delete-account',
    '/dapi/user/deactivate',
    '/dapi/user/profile'
  ];

  for (const ep of testEndpoints) {
    const res = await page.evaluate(async (url) => {
      try {
        const isGet = url.includes('profile');
        const r = await fetch(url, {
          method: isGet ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          ...(!isGet ? { body: JSON.stringify({}) } : {}),
          credentials: 'include'
        });
        return { status: r.status, data: await r.json().catch(() => ({})) };
      } catch (e) {
        return { error: e.message };
      }
    }, ep);
    console.log(`Endpoint ${ep} ->`, JSON.stringify(res));
  }

  await browser.close();
}

testDelete().catch(console.error);
