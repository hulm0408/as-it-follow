import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sessionJson = {
  name: "Fer three",
  customer_id: 285611035,
  mobile: "8249789547",
  token: "0f1e190c-a9b3-4ed8-954d-8f165d53a3081acdded4-d46d-4a47-913a-0dc7079f6342",
  tid: "eyJ0eXAiOiJKV1QiLCJLSUQiOiIyIiwiYWxnIjoiSFMyNTYifQ.eyJpc3MiOiJoYXAiLCJzZXNzaW9uX2RhdGEiOiJ2RU0rcDZKVXJnTW5RY3Rsc0p4bXp1MVhWTmI1TkdHMmU0eG5YNzBhbDNZNGxiZ3Nhei9FSGFCUXg1TFNsN3hBU0JXM0pBd0IyWk1PNll5Wm5LS2ExM0tOZmhOR2VLWnoxUWlVSFlsRWVDRlRqdnBVZlpqUVFPN0o2dWRTZStNNXdaQWl6bEViT2F1cEk4Vm9lbTBwOG1JVHlySTgxK1ZUZXBVL2dLSWdLTkFHczhmeE9LaFpKNEtpb1RnaVpMMi9yc0tLVjN4bWxkeGZGTHBRaGZqMTRscmxtWWxxbUVlcitjVkxCUVlZVHRtdFRFMHlSQzJQc2pRcWpTOVlHZkMrKzZUU3ovanVEbldPS0pYSWkwVlp1VHptdjFmOFN2WXhnemhDNVlGZkdWN3g4SUZhZzFTdXBYRkFLNHY1UjZRUGV3dUtvbXk4MDByQ0xWK3I4MzRTM0lmcDc4SkJ5ektKc2tBMThsTjNobHM9Iiwic3ViIjoiOWFjNjRlODctYWU0Mi00ODY2LWI5ZTQtMGM5NTBiMzE3NGEwIiwic2lkIjoidTdvNzhkZTZmNDAtOGM2Ni00ODE2LTlmOGItNGVjMzBhZjQzIiwiaWF0IjoxNzkyMTM0MjI3LCJleHAiOjE3OTQ3MjYyMjcsInVzZXJfaWQiOiIyODU2MTEwMzUifQ.5tGmUBqpfYsrzIRXDt_KnclzejNN4NmVOygc3uhrNUY",
  sid: "u7o78de6f40-8c66-4816-9f8b-4ec30af43",
  deviceId: "d48e229769325e97"
};

(async () => {
  console.log('1. Launching Chrome...');
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
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Solve WAF on swiggy.com
  console.log('2. Loading swiggy.com for WAF...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 2000));

  // 2. Set account cookies + userLocation
  const userLoc = encodeURIComponent(JSON.stringify({
    lat: "26.8467",
    lng: "80.9462",
    address: "Aliganj, Lucknow",
    area: "Aliganj",
    showUserDefaultAddressHint: false
  }));

  const parsedCookies = [
    { name: 'tid', value: sessionJson.tid, domain: '.swiggy.com', path: '/' },
    { name: '_sid', value: sessionJson.sid, domain: '.swiggy.com', path: '/' },
    { name: '_device_id', value: sessionJson.deviceId, domain: '.swiggy.com', path: '/' },
    { name: 'token', value: sessionJson.token, domain: '.swiggy.com', path: '/' },
    { name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' },
    { name: 'userLocation', value: userLoc, domain: '.swiggy.com', path: '/' }
  ];
  await page.setCookie(...parsedCookies).catch(() => {});

  // 3. Navigate to Arabecue Fried Chicken restaurant page
  console.log('3. Navigating to restaurant 67272...');
  await page.goto('https://www.swiggy.com/restaurants/restaurant-67272', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));

  // Check login state in page
  const headerText = await page.evaluate(() => {
    return {
      text: document.querySelector('header, [class*="Header"]')?.innerText?.slice(0, 300),
      buttons: Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => b.innerText?.trim()).filter(Boolean).slice(0, 15)
    };
  });
  console.log('Header text / login state:', headerText);

  // Try adding an item
  console.log('4. Looking for ADD buttons...');
  const addClicked = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, div[role="button"], div[class*="AddButton"], div[class*="add-button"]'));
    const btn = all.find(el => el.innerText?.trim().toUpperCase() === 'ADD');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked ADD button:', addClicked);
  await new Promise(r => setTimeout(r, 3000));

  // Check cart API in page
  const cartData = await page.evaluate(async () => {
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart');
      const json = await r.json();
      return json;
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('Cart API statusCode:', cartData?.statusCode, 'cartMeta:', JSON.stringify(cartData?.data?.cartMeta || {}).slice(0, 300));

  // If items in cart, navigate to checkout
  if (cartData?.data?.cartItems || cartData?.data?.cart) {
    console.log('5. Navigating to /checkout...');
    await page.goto('https://www.swiggy.com/checkout', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 4000));
    const checkoutInfo = await page.evaluate(() => {
      return {
        title: document.title,
        bodySnippet: document.body.innerText.slice(0, 800)
      };
    });
    console.log('Checkout Info:', checkoutInfo);
    await page.screenshot({ path: 'fer_three_real_checkout.png' });
    console.log('📸 Screenshot saved to fer_three_real_checkout.png');
  }

  await browser.close();
})();
