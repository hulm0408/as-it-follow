import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_6296591407']; // Umbashiya

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

  // Set Umbashiya cookies
  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');

  await page.setCookie(...parsed);
  await new Promise(r => setTimeout(r, 1500));

  console.log('2. Inspecting Umbashiya cart...');
  const cartData = await page.evaluate(async () => {
    const r = await fetch('https://www.swiggy.com/dapi/cart');
    const j = await r.json();
    return j;
  });

  console.log('Cart status:', cartData?.statusCode, cartData?.statusMessage);
  console.log('Cart Meta:', {
    restaurant: cartData?.data?.cartMeta?.restaurant_details?.name,
    restaurantId: cartData?.data?.cartMeta?.restaurant_details?.id,
    orderTotal: cartData?.data?.cartMeta?.order_total,
    groupCart: cartData?.data?.cartMeta?.group_cart,
    createdFromGroupCart: cartData?.data?.cartMeta?.created_from_group_cart,
    sharedCart: cartData?.data?.cartMeta?.shared_cart
  });

  // Let's print the cart items!
  const items = [];
  if (cartData?.data?.cartItems) {
    for (const [k, v] of Object.entries(cartData.data.cartItems)) {
      if (v.items) {
        for (const it of v.items) {
          items.push({ id: it.id, name: it.name, qty: it.quantity, price: it.final_price || it.price });
        }
      }
    }
  }
  console.log('Items in Umbashiya cart:', items);

  await browser.close();
})();
