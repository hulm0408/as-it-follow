import puppeteer from 'puppeteer-core';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--window-position=-32000,-32000', '--no-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://www.swiggy.com/restaurants/restaurant-67272', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) break;
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 4000));
  
  const dishInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => b.innerText?.trim()).filter(Boolean);
    const dishes = Array.from(document.querySelectorAll('[data-testid="normal-dish-item"], [class*="Item_root"], [class*="itemRow"]')).map(d => ({
      name: d.querySelector('[class*="name"], h3')?.innerText,
      price: d.querySelector('[class*="price"]')?.innerText,
      btn: d.querySelector('button, div[role="button"]')?.innerText
    }));
    return { buttons: buttons.slice(0, 15), dishes: dishes.slice(0, 5) };
  });
  console.log('Dishes found:', JSON.stringify(dishInfo, null, 2));
  await browser.close();
})();
