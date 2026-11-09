import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_8249789547'];

  console.log('Using account:', acc.name, '(', acc.phone, ')');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('1. Loading swiggy.com for WAF...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) {
      console.log('WAF token acquired!');
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
  await page.setCookie(...parsedCookies).catch(() => {});

  // Intercept responses
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('dapi') || u.includes('cart') || u.includes('group')) {
      try {
        const text = await res.text();
        console.log(`[${res.status()}] ${u.slice(0, 80)}`);
        if (text.includes('item') || text.includes('group') || text.includes('cart')) {
          console.log(' ->', text.slice(0, 200));
        }
      } catch(e) {}
    }
  });

  // Test navigating to restaurant 67272 menu with groupCartId
  console.log('2. Navigating to restaurant 67272 menu with groupCartId...');
  await page.goto('https://www.swiggy.com/menu/67272?groupCartId=642855918', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  // Check buttons & text on page
  const domInfo = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, a, div[role="button"], span, div'));
    const btns = [];
    for (const el of all) {
      const t = el.innerText?.trim();
      if (t && t.length < 50 && (t.toLowerCase().includes('join') || t.toLowerCase().includes('group') || t.toLowerCase().includes('umbashiya') || t.toLowerCase().includes('cart') || t.toLowerCase().includes('order'))) {
        btns.push(t);
      }
    }
    const body = document.body.innerText;
    return {
      buttons: [...new Set(btns)].slice(0, 30),
      bodySample: body.slice(0, 600)
    };
  });

  console.log('DOM Info:', domInfo);

  // Take screenshot
  await page.screenshot({ path: 'menu_with_gc.png' });
  console.log('Screenshot saved to menu_with_gc.png');

  await browser.close();
})();
