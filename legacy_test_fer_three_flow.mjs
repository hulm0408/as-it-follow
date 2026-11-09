import puppeteer from 'puppeteer-core';
import { getDb, saveDb, importSessionJson } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sessionJson = {
  "name": "Fer three",
  "customer_id": 285611035,
  "mobile": "8249789547",
  "token": "0f1e190c-a9b3-4ed8-954d-8f165d53a3081acdded4-d46d-4a47-913a-0dc7079f6342",
  "tid": "eyJ0eXAiOiJKV1QiLCJLSUQiOiIyIiwiYWxnIjoiSFMyNTYifQ.eyJpc3MiOiJoYXAiLCJzZXNzaW9uX2RhdGEiOiJ2RU0rcDZKVXJnTW5RY3Rsc0p4bXp1MVhWTmI1TkdHMmU0eG5YNzBhbDNZNGxiZ3Nhei9FSGFCUXg1TFNsN3hBU0JXM0pBd0IyWk1PNll5Wm5LS2ExM0tOZmhOR2VLWnoxUWlVSFlsRWVDRlRqdnBVZlpqUVFPN0o2dWRTZStNNXdaQWl6bEViT2F1cEk4Vm9lbTBwOG1JVHlySTgxK1ZUZXBVL2dLSWdLTkFHczhmeE9LaFpKNEtpb1RnaVpMMi9yc0tLVjN4bWxkeGZGTHBRaGZqMTRscmxtWWxxbUVlcitjVkxCUVlZVHRtdFRFMHlSQzJQc2pRcWpTOVlHZkMrKzZUU3ovanVEbldPS0pYSWkwVlp1VHptdjFmOFN2WXhnemhDNVlGZkdWN3g4SUZhZzFTdXBYRkFLNHY1UjZRUGV3dUtvbXk4MDByQ0xWK3I4MzRTM0lmcDc4SkJ5ektKc2tBMThsTjNobHM9Iiwic3ViIjoiOWFjNjRlODctYWU0Mi00ODY2LWI5ZTQtMGM5NTBiMzE3NGEwIiwic2lkIjoidTdvNzhkZTZmNDAtOGM2Ni00ODE2LTlmOGItNGVjMzBhZjQzIiwiaWF0IjoxNzkyMTM0MjI3LCJleHAiOjE3OTQ3MjYyMjcsInVzZXJfaWQiOiIyODU2MTEwMzUifQ.5tGmUBqpfYsrzIRXDt_KnclzejNN4NmVOygc3uhrNUY",
  "sid": "u7o78de6f40-8c66-4816-9f8b-4ec30af43",
  "deviceId": "d48e229769325e97"
};

(async () => {
  console.log('--- 1. Importing session into DB ---');
  const cookieStr = `tid=${sessionJson.tid}; _sid=${sessionJson.sid}; _device_id=${sessionJson.deviceId}; token=${sessionJson.token}; _is_logged_in=1`;
  
  const res = importSessionJson({
    ...sessionJson,
    cookies: cookieStr
  }, 'acc_8249789547');
  console.log('Import result:', res);

  // Set as active account
  const db = getDb();
  db.config.accounts['acc_8249789547'].name = 'Fer three';
  db.config.activeOrderAccount = 'acc_8249789547';
  saveDb(db);

  console.log('\n--- 2. Testing Swiggy Profile with this cookie ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--window-position=-32000,-32000', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Prewarm on swiggy.com to get fresh AWS WAF token
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 2000));

  // Set account cookies
  const parsedCookies = [
    { name: 'tid', value: sessionJson.tid, domain: '.swiggy.com', path: '/' },
    { name: '_sid', value: sessionJson.sid, domain: '.swiggy.com', path: '/' },
    { name: '_device_id', value: sessionJson.deviceId, domain: '.swiggy.com', path: '/' },
    { name: 'token', value: sessionJson.token, domain: '.swiggy.com', path: '/' },
    { name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' }
  ];
  await page.setCookie(...parsedCookies).catch(() => {});

  // Check Swiggy cart API directly in page context
  const cartApiRes = await page.evaluate(async () => {
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart');
      const json = await r.json();
      return json;
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('Cart API statusCode:', cartApiRes?.statusCode, cartApiRes?.statusMessage);
  if (cartApiRes?.data) {
    console.log('Cart Data found:', JSON.stringify(cartApiRes.data.cartMeta || {}).slice(0, 300));
  }

  // Check restaurant 67272 menu
  const menuRes = await page.evaluate(async () => {
    try {
      const r = await fetch('https://www.swiggy.com/dapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=26.8467&lng=80.9462&restaurantId=67272');
      const json = await r.json();
      const info = json?.data?.cards?.find(c => c.card?.card?.info)?.card?.card?.info;
      return { status: json.statusCode, info };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('\nMenu API for 67272:', menuRes?.info?.name, menuRes?.info?.city);

  // Now navigate to the group cart link
  console.log('\n--- 3. Navigating to Swiggy Group Cart Link ---');
  await page.goto('https://swig.gy/gc/67272/Umbashiya-642855918', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  console.log('Page URL after group cart navigation:', page.url());

  const pageHtml = await page.evaluate(() => {
    return {
      title: document.title,
      text: document.body.innerText.slice(0, 800)
    };
  });
  console.log('Page info:', pageHtml);

  // Check cart after visiting group cart
  const cartAfterGc = await page.evaluate(async () => {
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart');
      return await r.json();
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('\nCart after GC navigation statusCode:', cartAfterGc?.statusCode);
  if (cartAfterGc?.data?.cartMeta) {
    console.log('Order Total:', cartAfterGc.data.cartMeta.order_total);
    console.log('Restaurant:', cartAfterGc.data.cartMeta.restaurant_details?.name);
  }

  // Now attempt checkout screen capture
  console.log('\n--- 4. Navigating to Checkout & Capturing Payment Screen ---');
  await page.goto('https://www.swiggy.com/checkout', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  const checkoutText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log('Checkout Page text preview:', checkoutText.slice(0, 400));

  await page.screenshot({ path: 'fer_three_checkout_screen.png' });
  console.log('📸 Screenshot saved to fer_three_checkout_screen.png');

  await browser.close();
})();
