import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  // We can test with Fer three
  const acc = db.config.accounts['acc_8249789547'];
  console.log('Account:', acc.name, '(', acc.phone, ')');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('1. Solving WAF on swiggy.com...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) {
      console.log('WAF solved! Token length:', waf.value.length);
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

  // Trace network requests
  const intercepted = [];
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('dapi') || u.includes('cart') || u.includes('group') || u.includes('order')) {
      try {
        const text = await res.text();
        intercepted.push({ status: res.status(), url: u, text: text.slice(0, 300) });
      } catch(e) {}
    }
  });

  const gcUrl = 'https://swig.gy/gc/67272/Umbashiya-642855918';
  console.log('2. Navigating to group cart URL:', gcUrl);

  // First fetch redirect target
  let targetUrl = gcUrl;
  try {
    const r = await fetch(gcUrl, { redirect: 'manual' });
    const loc = r.headers.get('location');
    if (loc) {
      console.log('Redirect location:', loc);
      targetUrl = loc;
    }
  } catch(e) {}

  await page.goto(gcUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(e => console.log('Nav error:', e.message));
  await new Promise(r => setTimeout(r, 4000));

  console.log('3. Current URL after navigation:', page.url());
  console.log('Page Title:', await page.title());

  // Search for any join buttons or text
  const domSearch = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, a, div[role="button"], span, div, h1, h2, h3, p'));
    const buttons = [];
    let joinEl = null;

    for (const el of all) {
      const t = el.innerText?.trim();
      if (!t || t.length > 80) continue;
      if (t.toLowerCase().includes('join') || t.toLowerCase().includes('group') || t.toLowerCase().includes('umbashiya')) {
        buttons.push({ tag: el.tagName, text: t, className: el.className });
      }
      if (t.toLowerCase() === 'join' || t.toLowerCase() === 'join group' || t.toLowerCase() === 'join order' || t.toLowerCase().includes('join group order')) {
        if (!joinEl) joinEl = t;
      }
    }

    return {
      matchedElements: buttons.slice(0, 20),
      joinTextFound: joinEl,
      bodyTextSnippet: document.body.innerText.slice(0, 800)
    };
  });

  console.log('DOM Search:', domSearch);

  // If a join button exists, click it!
  const clickResult = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, a, div[role="button"], span, div'));
    const joinBtn = all.find(el => {
      const t = el.innerText?.trim().toLowerCase();
      return t === 'join' || t === 'join group' || t === 'join order' || t === 'join group order' || t === 'join cart';
    });
    if (joinBtn) {
      joinBtn.click();
      return { clicked: true, text: joinBtn.innerText?.trim() };
    }
    return { clicked: false };
  });

  console.log('Join Click Result:', clickResult);
  if (clickResult.clicked) {
    await new Promise(r => setTimeout(r, 4000));
    console.log('URL after join:', page.url());
  }

  // Check what items are now in cart via /dapi/cart
  const cartCheck = await page.evaluate(async () => {
    try {
      const r = await fetch('https://www.swiggy.com/dapi/cart');
      const j = await r.json();
      return {
        statusCode: j?.statusCode,
        statusMessage: j?.statusMessage,
        cartMeta: j?.data?.cartMeta ? {
          orderTotal: j.data.cartMeta.order_total,
          restaurant: j.data.cartMeta.restaurant_details?.name,
          itemsCount: Object.keys(j?.data?.cartItems || {}).length
        } : null,
        cartItems: j?.data?.cartItems
      };
    } catch(e) {
      return { error: e.message };
    }
  });

  console.log('Cart after join:', JSON.stringify(cartCheck, null, 2).slice(0, 800));

  await page.screenshot({ path: 'after_join.png' });
  console.log('Screenshot saved to after_join.png');

  await browser.close();
})();
