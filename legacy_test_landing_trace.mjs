import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  // Let's use Fer three (acc_8249789547)
  const acc = db.config.accounts['acc_8249789547'];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('request', req => {
    const u = req.url();
    if (u.includes('group') || u.includes('cart') || u.includes('join')) {
      console.log(`[REQ] ${req.method()} ${u}`);
      if (req.method() === 'POST') {
        try { console.log('   Payload:', req.postData()?.slice(0, 300)); } catch(e) {}
      }
    }
  });

  page.on('response', async res => {
    const u = res.url();
    if (u.includes('group') || u.includes('cart') || u.includes('join')) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const j = await res.json();
          console.log(`[RES ${res.status()}] ${u}`);
          console.log('   Response preview:', JSON.stringify(j).slice(0, 300));
        }
      } catch(e) {}
    }
  });

  console.log('1. Solving WAF on swiggy.com...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 2000));

  // Set account cookies
  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');
  parsed.push({ name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' });
  await page.setCookie(...parsed);

  const fullUrl = 'https://www.swiggy.com/?c=group_cart_share&source_caller=ui&af_dp=swiggy%3A%2F%2Fmenu%3Frestaurant_id%3D67272%26group_cart_id%3D642855918%26host_name%3DUmbashiya&pid=swiggy_group_cart&onelink_id=eguM&af_xp=custom&af_force_deeplink=true&deep_link_value=swiggy%3A%2F%2Fmenu%3Frestaurant_id%3D67272%26group_cart_id%3D642855918%26host_name%3DUmbashiya&shortlink=ent3ycb4';
  
  console.log('2. Navigating to group cart share landing URL...');
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 8000));

  console.log('Current URL after landing:', page.url());
  console.log('Title:', await page.title());

  await page.screenshot({ path: 'landing_view.png' });

  // Check DOM for modal or join prompts
  const domInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a, span'));
    return {
      text: document.body.innerText.slice(0, 800),
      buttons: buttons.map(b => b.innerText?.trim()).filter(t => t && t.length < 50).slice(0, 30)
    };
  });
  console.log('DOM info:', JSON.stringify(domInfo, null, 2));

  await browser.close();
})();
