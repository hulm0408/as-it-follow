import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_7667327578']; // Chand (valid session, empty cart)

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
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }

  // Set Chand cookies
  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');

  await page.setCookie(...parsed);
  await new Promise(r => setTimeout(r, 1500));

  console.log('2. Opening group cart link as Chand...');
  const gcUrl = 'https://swig.gy/gc/67272/Umbashiya-642855918';

  // Let's create an in-page link and click it
  await page.evaluate((url) => {
    const a = document.createElement('a');
    a.href = url;
    a.id = 'gc-join-btn';
    document.body.appendChild(a);
    a.click();
  }, gcUrl);

  console.log('Waiting after clicking group cart link...');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 5000));

  console.log('URL after navigation:', page.url());
  console.log('Title:', await page.title().catch(() => ''));

  // Inspect DOM for Join modal or button
  const pageDom = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, a, div[role="button"], span, div, h1, h2, h3, p'));
    const matches = [];
    for (const el of all) {
      const t = el.innerText?.trim();
      if (!t || t.length > 100) continue;
      if (t.toLowerCase().includes('join') || t.toLowerCase().includes('group') || t.toLowerCase().includes('umbashiya') || t.toLowerCase().includes('arabecue')) {
        matches.push({ tag: el.tagName, text: t, className: el.className });
      }
    }
    return {
      matches: matches.slice(0, 30),
      bodySnippet: document.body.innerText.slice(0, 1000)
    };
  });

  console.log('Page DOM matches:', pageDom.matches);
  console.log('Page body snippet:', pageDom.bodySnippet.slice(0, 400));
  await page.screenshot({ path: 'chand_gc_join.png' });

  // If there's a join button, click it!
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
    const joinBtn = btns.find(b => {
      const t = b.innerText?.trim().toLowerCase();
      return t === 'join' || t === 'join group' || t === 'join order' || t === 'join group order';
    });
    if (joinBtn) {
      joinBtn.click();
      return { clicked: true, text: joinBtn.innerText };
    }
    return { clicked: false };
  });
  console.log('Join button click result:', clicked);

  if (clicked.clicked) {
    await new Promise(r => setTimeout(r, 4000));
  }

  // Check Chand's cart now
  const cartRes = await page.evaluate(async () => {
    const r = await fetch('https://www.swiggy.com/dapi/cart');
    return await r.json();
  });

  console.log('Chand Cart after joining:', {
    status: cartRes?.statusCode,
    message: cartRes?.statusMessage,
    itemsCount: cartRes?.data?.cartItemsCount,
    orderTotal: cartRes?.data?.cartMeta?.order_total,
    restaurant: cartRes?.data?.cartMeta?.restaurant_details?.name
  });

  await browser.close();
})();
