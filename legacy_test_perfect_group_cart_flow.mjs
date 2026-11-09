import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  // We can test with Umbashiya or Fer three
  const acc = db.config.accounts['acc_6296591407'];
  const testGroupCartId = '642855918';
  const testRestaurantId = '67272';

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

  const result = await page.evaluate(async (gcId, fallbackRestId) => {
    // 1. Fetch group cart from Swiggy dapi
    const vRes = await fetch(`https://www.swiggy.com/dapi/cart/group/view?group_cart_id=${gcId}`);
    const vJson = await vRes.json();
    const groupData = vJson?.data;

    const rId = groupData?.restaurant_id || fallbackRestId || '';
    const rawItems = groupData?.items || [];
    const groupItems = rawItems.map(it => ({
      itemId: String(it.item_id || it.itemId),
      name: it.name || 'Item',
      qty: it.quantity || 1,
      price: (it.final_price || it.price || 0) / 100
    }));

    // 2. Join the group cart
    await fetch('https://www.swiggy.com/dapi/cart/group/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_cart_id: gcId, guest_user_name: 'Member' })
    }).catch(() => {});

    // 3. Transfer group cart to personal cart
    await fetch('https://www.swiggy.com/dapi/cart/group/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_cart_id: gcId })
    }).catch(() => {});

    // 4. Also flush-sync items into personal cart
    const cartItems = {};
    for (const item of groupItems) {
      cartItems[item.itemId] = {
        quantity: item.qty,
        itemId: item.itemId,
        variantGroupId: null
      };
    }
    await fetch('https://www.swiggy.com/dapi/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flushFirst: 1,
        restaurantId: String(rId),
        cartItems: cartItems
      })
    }).catch(() => {});

    // 5. Inspect final /dapi/cart
    const cRes = await fetch('https://www.swiggy.com/dapi/cart');
    const cJson = await cRes.json();
    const cm = cJson?.data?.cartMeta || {};

    return {
      groupCartId: gcId,
      hostName: groupData?.host_user_name,
      restaurantId: rId,
      fetchedItemsCount: groupItems.length,
      fetchedItems: groupItems,
      finalCartRestaurant: cm.restaurant_details?.name,
      finalCartTotal: cm.order_total,
      finalCartSubtotal: cm.cart_subtotal
    };
  }, testGroupCartId, testRestaurantId);

  console.log('Result:', JSON.stringify(result, null, 2));

  await browser.close();
})();
