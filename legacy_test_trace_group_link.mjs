import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  // Test with Fer three (acc_8249789547) who is NOT the host
  const acc = db.config.accounts['acc_8249789547'];
  const groupCartId = '642855918';
  const restaurantId = '67272';

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Listen to ALL network requests and responses
  page.on('request', req => {
    const u = req.url();
    if (u.includes('dapi') || u.includes('group') || u.includes('cart')) {
      console.log(`[REQ] ${req.method()} ${u}`);
      if (req.method() === 'POST') {
        try { console.log('  POST payload:', req.postData()); } catch(e) {}
      }
    }
  });

  page.on('response', async res => {
    const u = res.url();
    if (u.includes('dapi') || u.includes('group') || u.includes('cart')) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const j = await res.json();
          console.log(`[RES ${res.status()}] ${u}`);
          console.log('  Data keys:', Object.keys(j?.data || j || {}));
          if (JSON.stringify(j).includes('group') || JSON.stringify(j).includes('cartItems')) {
            console.log('  Snippet:', JSON.stringify(j).slice(0, 300));
          }
        }
      } catch(e) {}
    }
  });

  console.log('1. Loading swiggy.com for WAF...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 2000));

  // Set Fer three's cookies
  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');
  parsed.push({ name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' });
  await page.setCookie(...parsed);

  console.log('2. Navigating to restaurant menu with group_cart_id query params...');
  // Let's test navigating to swiggy menu with group_cart_id
  const targetUrl = `https://www.swiggy.com/city/lucknow/arabecue-fried-chicken-aliganj-rest67272?group_cart_id=${groupCartId}&host_name=Umbashiya`;
  console.log('Target URL:', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

  await new Promise(r => setTimeout(r, 6000));

  // Check screenshot and DOM for any modal or join button
  await page.screenshot({ path: 'group_menu_view.png' });

  const modalInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, div[role="button"], a, span'));
    const visible = btns.map(b => b.innerText?.trim()).filter(t => t && (
      t.toLowerCase().includes('join') ||
      t.toLowerCase().includes('group') ||
      t.toLowerCase().includes('umbashiya') ||
      t.toLowerCase().includes('order together') ||
      t.toLowerCase().includes('cart')
    ));
    return {
      title: document.title,
      matches: visible.slice(0, 20),
      bodyTextSnippet: document.body.innerText.slice(0, 500)
    };
  });

  console.log('DOM info:', JSON.stringify(modalInfo, null, 2));

  await browser.close();
})();
