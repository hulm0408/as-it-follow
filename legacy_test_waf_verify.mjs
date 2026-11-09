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
  console.log('1. Loading swiggy.com...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  let wafToken = '';
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) {
      wafToken = waf.value;
      console.log('WAF Solved! Token length:', wafToken.length);
      break;
    }
    await new Promise(r => setTimeout(r, 800));
  }

  await new Promise(r => setTimeout(r, 2000));

  // Test sms-otp
  console.log('2. Testing sms-otp:');
  const smsRes = await page.evaluate(async (mob, waf) => {
    try {
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (waf) headers['aws-waf-token'] = waf;
      const res = await fetch('https://www.swiggy.com/dapi/auth/sms-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mobile: mob }),
        credentials: 'include'
      });
      return { status: res.status, data: await res.json().catch(() => ({})) };
    } catch (e) {
      return { error: e.message };
    }
  }, '8904715184', wafToken);
  console.log('SMS Result:', JSON.stringify(smsRes));

  // Test otp-verify with dummy OTP to see exact error response
  console.log('3. Testing otp-verify:');
  const verifyRes = await page.evaluate(async (mob, waf) => {
    try {
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (waf) headers['aws-waf-token'] = waf;
      const res = await fetch('https://www.swiggy.com/dapi/auth/otp-verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mobile: mob, otp: '999999' }),
        credentials: 'include'
      });
      return { status: res.status, data: await res.json().catch(() => ({})) };
    } catch (e) {
      return { error: e.message };
    }
  }, '8904715184', wafToken);
  console.log('Verify Result for dummy OTP:', JSON.stringify(verifyRes));

  await browser.close();
}
test().catch(console.error);
