import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_8249789547']; // Fer three

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

  // Set all cookies including _session_tid and _is_logged_in
  const cookiesToSet = [
    { name: '_session_tid', value: acc.tid, domain: '.swiggy.com', path: '/' },
    { name: 'tid', value: acc.tid, domain: '.swiggy.com', path: '/' },
    { name: 'token', value: acc.token || '', domain: '.swiggy.com', path: '/' },
    { name: '_sid', value: acc.sid || '', domain: '.swiggy.com', path: '/' },
    { name: '_device_id', value: acc.deviceId || '', domain: '.swiggy.com', path: '/' },
    { name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' },
    { name: 'userLocation', value: '%7B%22lat%22%3A%2226.8467%22%2C%22lng%22%3A%2280.9462%22%2C%22address%22%3A%22Aliganj%2C%20Lucknow%22%2C%22area%22%3A%22Aliganj%22%7D', domain: '.swiggy.com', path: '/' }
  ];

  await page.setCookie(...cookiesToSet);

  console.log('2. Reloading swiggy.com with _session_tid to verify login status...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  const authInfo = await page.evaluate(async () => {
    // Check header text or user profile
    const text = document.body.innerText.slice(0, 500);
    // Also test /dapi/cart
    let cartRes = null;
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart');
      cartRes = await r.json();
    } catch(e) {
      cartRes = { error: e.message };
    }
    return {
      textSnippet: text,
      cartRes
    };
  });

  console.log('Auth Info:', authInfo.textSnippet);
  console.log('Cart Res Status:', authInfo.cartRes?.statusCode, authInfo.cartRes?.statusMessage);
  if (authInfo.cartRes?.data?.cartMeta) {
    console.log('Cart Meta:', {
      restaurant: authInfo.cartRes.data.cartMeta.restaurant_details?.name,
      orderTotal: authInfo.cartRes.data.cartMeta.order_total
    });
  }

  await browser.close();
})();
