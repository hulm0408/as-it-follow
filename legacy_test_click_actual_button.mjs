import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const acc = db.config.accounts['acc_9157928345'];

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

  const cookiePairs = (acc.cookies || '').split(';').map(s => s.trim()).filter(Boolean);
  const parsed = cookiePairs.map(p => {
    const [name, ...val] = p.split('=');
    return { name, value: val.join('='), domain: '.swiggy.com', path: '/' };
  });
  await page.setCookie(...parsed);

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('dialog', async dialog => {
    console.log('DIALOG:', dialog.type(), dialog.message());
    await dialog.accept();
  });

  page.on('request', req => {
    console.log(`[REQ] ${req.method()} ${req.url()}`);
    if (req.postData()) console.log(`  POST: ${req.postData()}`);
  });

  page.on('response', async res => {
    if (res.url().includes('swiggy.com')) {
      const text = await res.text().catch(() => '');
      console.log(`[RES ${res.status()}] ${res.url()} -> ${text.slice(0, 150)}`);
    }
  });

  await page.goto('https://www.swiggy.com/my-account/settings', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Finding and clicking button._14Qnj...');
  await page.waitForSelector('button._14Qnj', { timeout: 10000 });
  await page.click('button._14Qnj');

  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: 'after_button_click.png' });

  // Check what DOM appeared
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('BODY AFTER CLICK:\n', bodyText);

  // Check all modal / overlay elements
  const overlays = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[class*="modal"], div[class*="popup"], div[class*="drawer"], div[class*="overlay"], div[class*="bottomSheet"]'));
    return dialogs.map(d => ({ class: d.className, text: d.innerText }));
  });
  console.log('Overlays found:', JSON.stringify(overlays, null, 2));

  // If there's any button inside modal, list them
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      class: b.className,
      text: b.innerText
    }));
  });
  console.log('All buttons now:', JSON.stringify(buttons, null, 2));

  // If there is another button like confirm or proceed, click it!
  const nextBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => b.innerText?.trim() !== 'Delete account' && b.innerText?.trim().length > 0);
    if (target) {
      target.click();
      return target.innerText;
    }
    return null;
  });
  console.log('Clicked next button:', nextBtn);

  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: 'after_next_click.png' });

  const bodyText2 = await page.evaluate(() => document.body.innerText);
  console.log('BODY AFTER NEXT CLICK:\n', bodyText2);

  await browser.close();
}

run().catch(console.error);
