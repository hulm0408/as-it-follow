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

  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 2000));

  const sessionJson = {
    tid: "eyJ0eXAiOiJKV1QiLCJLSUQiOiIyIiwiYWxnIjoiSFMyNTYifQ.eyJpc3MiOiJoYXAiLCJzZXNzaW9uX2RhdGEiOiJ2RU0rcDZKVXJnTW5RY3Rsc0p4bXp1MVhWTmI1TkdHMmU0eG5YNzBhbDNZNGxiZ3Nhei9FSGFCUXg1TFNsN3hBU0JXM0pBd0IyWk1PNll5Wm5LS2ExM0tOZmhOR2VLWnoxUWlVSFlsRWVDRlRqdnBVZlpqUVFPN0o2dWRTZStNNXdaQWl6bEViT2F1cEk4Vm9lbTBwOG1JVHlySTgxK1ZUZXBVL2dLSWdLTkFHczhmeE9LaFpKNEtpb1RnaVpMMi9yc0tLVjN4bWxkeGZGTHBRaGZqMTRscmxtWWxxbUVlcitjVkxCUVlZVHRtdFRFMHlSQzJQc2pRcWpTOVlHZkMrKzZUU3ovanVEbldPS0pYSWkwVlp1VHptdjFmOFN2WXhnemhDNVlGZkdWN3g4SUZhZzFTdXBYRkFLNHY1UjZRUGV3dUtvbXk4MDByQ0xWK3I4MzRTM0lmcDc4SkJ5ektKc2tBMThsTjNobHM9Iiwic3ViIjoiOWFjNjRlODctYWU0Mi00ODY2LWI5ZTQtMGM5NTBiMzE3NGEwIiwic2lkIjoidTdvNzhkZTZmNDAtOGM2Ni00ODE2LTlmOGItNGVjMzBhZjQzIiwiaWF0IjoxNzkyMTM0MjI3LCJleHAiOjE3OTQ3MjYyMjcsInVzZXJfaWQiOiIyODU2MTEwMzUifQ.5tGmUBqpfYsrzIRXDt_KnclzejNN4NmVOygc3uhrNUY",
    sid: "u7o78de6f40-8c66-4816-9f8b-4ec30af43",
    deviceId: "d48e229769325e97",
    token: "0f1e190c-a9b3-4ed8-954d-8f165d53a3081acdded4-d46d-4a47-913a-0dc7079f6342"
  };

  await page.setCookie(
    { name: 'tid', value: sessionJson.tid, domain: '.swiggy.com', path: '/' },
    { name: '_sid', value: sessionJson.sid, domain: '.swiggy.com', path: '/' },
    { name: '_device_id', value: sessionJson.deviceId, domain: '.swiggy.com', path: '/' },
    { name: 'token', value: sessionJson.token, domain: '.swiggy.com', path: '/' },
    { name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' }
  );

  const menuWithGc = await page.evaluate(async () => {
    try {
      const url = 'https://www.swiggy.com/dapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=26.8467&lng=80.9462&restaurantId=67272&groupCartId=642855918&group_cart_id=642855918';
      const r = await fetch(url);
      const json = await r.json();
      
      // Search json for group cart info or cart items
      const jsonStr = JSON.stringify(json);
      const has642 = jsonStr.includes('642855918');
      const hasUmb = jsonStr.includes('Umbashiya');
      
      return {
        status: json.statusCode,
        has642,
        hasUmb,
        keys: Object.keys(json.data || {})
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('Menu with GC Result:', menuWithGc);
  await browser.close();
})();
