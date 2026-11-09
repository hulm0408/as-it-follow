import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function test() {
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
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  let wafToken = '';
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) {
      wafToken = waf.value;
      break;
    }
    await new Promise(r => setTimeout(r, 800));
  }

  await new Promise(r => setTimeout(r, 2000));

  // Check what endpoints exist on /dapi/auth/
  const testEndpoints = [
    '/dapi/auth/otp-verify',
    '/dapi/auth/verify-otp',
    '/dapi/auth/signup',
    '/dapi/auth/sign-up',
    '/dapi/auth/create-account'
  ];

  for (const ep of testEndpoints) {
    const res = await page.evaluate(async (url, waf) => {
      try {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (waf) headers['aws-waf-token'] = waf;
        const r = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ mobile: '8904715184', otp: '123456', name: 'Test User' }),
          credentials: 'include'
        });
        return { status: r.status, data: await r.json().catch(() => ({})) };
      } catch (e) {
        return { error: e.message };
      }
    }, ep, wafToken);
    console.log(`Endpoint ${ep} response:`, JSON.stringify(res));
  }

  await browser.close();
}
test().catch(console.error);
