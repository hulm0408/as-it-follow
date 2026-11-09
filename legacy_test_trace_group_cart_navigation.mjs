import puppeteer from 'puppeteer-core';
import { getDb } from './store.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const db = getDb();
  const acc = db.config.accounts['acc_6296591407'];
  const groupCartUrl = 'https://swig.gy/gc/67272/Umbashiya-642855918';

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Solve WAF
  await page.goto('https://www.swiggy.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 3500));

  // 2. Set account cookies
  const current = await page.cookies();
  await page.deleteCookie(...current.filter(c => c.name !== 'aws-waf-token'));
  const pairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = pairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  }).filter(c => c.name !== 'aws-waf-token');
  parsed.push({ name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' });
  await page.setCookie(...parsed);

  // 3. Track all network requests when navigating to the group cart link
  const networkCalls = [];
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('dapi') || u.includes('group') || u.includes('cart') || u.includes('menu')) {
      networkCalls.push({
        status: res.status(),
        url: u,
        method: res.request().method()
      });
    }
  });

  console.log('Navigating to group cart URL:', groupCartUrl);
  await page.goto(groupCartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('Nav err:', e.message));
  await new Promise(r => setTimeout(r, 5000));

  console.log('Final URL:', page.url());
  console.log('Page Title:', await page.title());

  console.log('\nRelevant Network Calls:');
  for (const call of networkCalls) {
    console.log(`${call.status} [${call.method}] ${call.url}`);
  }

  // Check DOM content
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\nBody text preview:\n', bodyText.slice(0, 500).replace(/\s+/g, ' '));

  await browser.close();
})();
