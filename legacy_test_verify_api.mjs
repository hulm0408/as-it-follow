import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await page.goto('https://www.swiggy.com/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Listen to network requests/responses
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('auth') || url.includes('dapi')) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch (e) {}
      console.log(`[NET RESPONSE] ${res.status()} ${url} -> ${bodyText.slice(0, 200)}`);
    }
  });

  console.log('--- Step 1: sms-otp ---');
  const smsRes = await page.evaluate(async () => {
    const res = await fetch('https://www.swiggy.com/dapi/auth/sms-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ mobile: '9012629051' }),
      credentials: 'include'
    });
    return { status: res.status, text: await res.text() };
  });
  console.log('SMS Result:', smsRes);

  await new Promise(r => setTimeout(r, 1000));

  console.log('--- Step 2: otp-verify ---');
  const verifyRes = await page.evaluate(async () => {
    const res = await fetch('https://www.swiggy.com/dapi/auth/otp-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ mobile: '9012629051', otp: '123456' }),
      credentials: 'include'
    });
    return { status: res.status, text: await res.text() };
  });
  console.log('Verify Result:', verifyRes);

  await new Promise(r => setTimeout(r, 2000));
  const cookies = await page.cookies();
  console.log('Cookies count:', cookies.length);
  for (const c of cookies) {
    console.log(`Cookie: ${c.name} = ${c.value.slice(0, 30)} (domain: ${c.domain})`);
  }

  await browser.close();
}
test().catch(console.error);
