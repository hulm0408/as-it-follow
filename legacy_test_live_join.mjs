import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_8249789547']; // Fer three
  console.log('Testing with account:', acc.name, acc.phone);

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
    if (waf && waf.value.length > 50) {
      console.log('WAF Token acquired:', waf.value.slice(0, 30));
      break;
    }
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 1500));

  // Set account cookies
  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsedCookies = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');

  // Also add userLocation
  parsedCookies.push(
    { name: 'userLocation', value: '%7B%22lat%22%3A%2226.8467%22%2C%22lng%22%3A%2280.9462%22%2C%22address%22%3A%22Aliganj%2C%20Lucknow%22%2C%22area%22%3A%22Aliganj%22%7D', domain: '.swiggy.com', path: '/' }
  );

  await page.setCookie(...parsedCookies).catch(() => {});

  // Intercept all requests
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('group') || u.includes('cart') || u.includes('menu')) {
      console.log('API Response:', res.status(), u.slice(0, 100));
    }
  });

  console.log('2. Trying to open group cart link via in-page click or navigation...');
  const gcUrl = 'https://swig.gy/gc/67272/Umbashiya-642855918';

  // Let's create an anchor and click it to simulate natural user click
  await page.evaluate((targetUrl) => {
    const a = document.createElement('a');
    a.href = targetUrl;
    a.id = 'test-gc-link';
    a.target = '_self';
    document.body.appendChild(a);
    a.click();
  }, gcUrl);

  console.log('Clicked link, waiting for navigation...');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 6000));

  console.log('Final URL:', page.url());
  console.log('Page Title:', await page.title().catch(() => ''));

  const info = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, div[role="button"]')).map(b => b.innerText?.trim()).filter(Boolean);
    const text = document.body.innerText;
    return {
      buttons: [...new Set(btns)].slice(0, 40),
      bodySnippet: text.slice(0, 1000)
    };
  });

  console.log('Page Info:', info);
  await page.screenshot({ path: 'test_live_join.png' });
  console.log('Screenshot saved to test_live_join.png');

  await browser.close();
})();
