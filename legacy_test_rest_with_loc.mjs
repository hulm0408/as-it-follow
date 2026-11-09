import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_8249789547'];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('1. Solving WAF...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 1500));

  // Set account cookies + userLocation + logged_in
  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsedCookies = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');

  parsedCookies.push(
    { name: 'userLocation', value: '%7B%22lat%22%3A%2226.8467%22%2C%22lng%22%3A%2280.9462%22%2C%22address%22%3A%22Aliganj%2C%20Lucknow%22%2C%22area%22%3A%22Aliganj%22%7D', domain: '.swiggy.com', path: '/' },
    { name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' }
  );

  await page.setCookie(...parsedCookies).catch(() => {});

  console.log('2. Opening restaurant page with groupCartId...');
  const testUrl = 'https://www.swiggy.com/restaurants/arabecue-fried-chicken-aliganj-lucknow-67272?groupCartId=642855918';
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  const dom = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, div[role="button"]')).map(b => b.innerText?.trim()).filter(Boolean);
    const body = document.body.innerText;
    return {
      buttons: [...new Set(btns)].slice(0, 30),
      bodySnippet: body.slice(0, 600)
    };
  });

  console.log('DOM Info:', dom);
  await page.screenshot({ path: 'rest_with_loc.png' });
  console.log('Screenshot saved to rest_with_loc.png');

  await browser.close();
})();
