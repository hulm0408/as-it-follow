import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--window-position=-32000,-32000', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Solve WAF
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 2000));

  // 2. Set account cookies
  const sessionJson = {
    tid: "eyJ0eXAiOiJKV1QiLCJLSUQiOiIyIiwiYWxnIjoiSFMyNTYifQ.eyJpc3MiOiJoYXAiLCJzZXNzaW9uX2RhdGEiOiJ2RU0rcDZKVXJnTW5RY3Rsc0p4bXp1MVhWTmI1TkdHMmU0eG5YNzBhbDNZNGxiZ3Nhei9FSGFCUXg1TFNsN3hBU0JXM0pBd0IyWk1PNll5Wm5LS2ExM0tOZmhOR2VLWnoxUWlVSFlsRWVDRlRqdnBVZlpqUVFPN0o2dWRTZStNNXdaQWl6bEViT2F1cEk4Vm9lbTBwOG1JVHlySTgxK1ZUZXBVL2dLSWdLTkFHczhmeE9LaFpKNEtpb1RnaVpMMi9yc0tLVjN4bWxkeGZGTHBRaGZqMTRscmxtWWxxbUVlcitjVkxCUVlZVHRtdFRFMHlSQzJQc2pRcWpTOVlHZkMrKzZUU3ovanVEbldPS0pYSWkwVlp1VHptdjFmOFN2WXhnemhDNVlGZkdWN3g4SUZhZzFTdXBYRkFLNHY1UjZRUGV3dUtvbXk4MDByQ0xWK3I4MzRTM0lmcDc4SkJ5ektKc2tBMThsTjNobHM9Iiwic3ViIjoiOWFjNjRlODctYWU0Mi00ODY2LWI5ZTQtMGM5NTBiMzE3NGEwIiwic2lkIjoidTdvNzhkZTZmNDAtOGM2Ni00ODE2LTlmOGItNGVjMzBhZjQzIiwiaWF0IjoxNzkyMTM0MjI3LCJleHAiOjE3OTQ3MjYyMjcsInVzZXJfaWQiOiIyODU2MTEwMzUifQ.5tGmUBqpfYsrzIRXDt_KnclzejNN4NmVOygc3uhrNUY",
    sid: "u7o78de6f40-8c66-4816-9f8b-4ec30af43",
    deviceId: "d48e229769325e97",
    token: "0f1e190c-a9b3-4ed8-954d-8f165d53a3081acdded4-d46d-4a47-913a-0dc7079f6342"
  };

  const userLoc = encodeURIComponent(JSON.stringify({
    lat: "26.8467",
    lng: "80.9462",
    address: "Aliganj, Lucknow",
    area: "Aliganj"
  }));

  await page.setCookie(
    { name: 'tid', value: sessionJson.tid, domain: '.swiggy.com', path: '/' },
    { name: '_sid', value: sessionJson.sid, domain: '.swiggy.com', path: '/' },
    { name: '_device_id', value: sessionJson.deviceId, domain: '.swiggy.com', path: '/' },
    { name: 'token', value: sessionJson.token, domain: '.swiggy.com', path: '/' },
    { name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' },
    { name: 'userLocation', value: userLoc, domain: '.swiggy.com', path: '/' }
  );

  // Intercept all responses
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('group') || u.includes('cart') || u.includes('order')) {
      try {
        const text = await res.text();
        if (text.includes('item') || text.includes('642855918') || text.includes('Umbashiya')) {
          console.log(`[MATCH] ${res.status()} ${u.slice(0, 100)}`);
          console.log(text.slice(0, 500));
        }
      } catch (e) {}
    }
  });

  // Test endpoints directly in page context
  const testUrls = [
    '/dapi/cart?group_cart_id=642855918',
    '/dapi/cart?groupCartId=642855918',
    '/dapi/cart/group?group_cart_id=642855918',
    '/dapi/cart/group?groupCartId=642855918',
    '/dapi/cart/group-cart/642855918',
    '/dapi/group-cart/642855918',
    '/dapi/group-order/cart?groupCartId=642855918',
    '/dapi/cart'
  ];

  const results = await page.evaluate(async (urls) => {
    const out = {};
    for (const u of urls) {
      try {
        const r = await fetch('https://www.swiggy.com' + u);
        const json = await r.json();
        out[u] = { status: r.status, data: json };
      } catch (e) {
        out[u] = { error: e.message };
      }
    }
    return out;
  }, testUrls);

  console.log('Results:');
  for (const [u, r] of Object.entries(results)) {
    if (r.data && r.data.data) {
      console.log(`SUCCESS on ${u}:`, JSON.stringify(r.data.data).slice(0, 400));
    } else {
      console.log(`${u}: status ${r.status || r.error}`);
    }
  }

  await browser.close();
})();
