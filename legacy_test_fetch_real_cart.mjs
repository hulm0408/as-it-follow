import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_7667327578'];
  console.log('Using account:', acc.name, acc.phone);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  if (acc.cookies) {
    const cookiePairs = acc.cookies.split(';').map(s => s.trim()).filter(Boolean);
    const parsedCookies = cookiePairs.map(p => {
      const [name, ...val] = p.split('=');
      return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
    });
    await page.setCookie(...parsedCookies).catch(() => {});
  }

  console.log('1. Solving WAF on swiggy.com...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 3000));

  const groupCartUrl = 'https://swig.gy/gc/978746/Umbashiya-442849410';
  console.log('2. Navigating to group cart:', groupCartUrl);
  await page.goto(groupCartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  console.log('Current URL:', page.url());

  // Check /dapi/cart
  const cartInfo = await page.evaluate(async () => {
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart');
      const data = await r.json();
      return { status: r.status, data };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('Cart Info Status:', cartInfo.status);
  if (cartInfo.data?.data) {
    const d = cartInfo.data.data;
    console.log('Restaurant:', d.cartMeta?.restaurant_details?.name || d.cart?.restaurant?.name);
    console.log('Cart subtotal:', d.cartMeta?.cart_subtotal);
    console.log('Order total (Final Payable):', d.cartMeta?.order_total);
    console.log('Discount total:', d.cartMeta?.discount_total);
    console.log('Items keys:', Object.keys(d.cartItems || {}));
  } else {
    console.log('Cart data raw:', JSON.stringify(cartInfo, null, 2).slice(0, 500));
  }

  await browser.close();
})();
