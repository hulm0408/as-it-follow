import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-position=-32000,-32000',
      '--no-sandbox'
    ]
  });

  const page = await browser.newPage();
  console.log('1. Loading swiggy.com root to solve WAF...');
  await page.goto('https://www.swiggy.com/', { waitUntil: 'load', timeout: 30000 });

  // Wait for WAF
  for (let i = 0; i < 15; i++) {
    const cookies = await page.cookies();
    const waf = cookies.find(c => c.name === 'aws-waf-token');
    if (waf && waf.value.length > 50) {
      console.log('2. WAF Solved! Token length:', waf.value.length);
      break;
    }
    await new Promise(r => setTimeout(r, 800));
  }

  // Now navigate to user's exact group cart link:
  const testLink = 'https://swig.gy/gc/216642/Rahul-282862499';
  console.log('3. Navigating to:', testLink);
  await page.goto(testLink, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  const pageState = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      textSample: document.body.innerText.slice(0, 1500)
    };
  });

  console.log('Page State:', JSON.stringify(pageState, null, 2));

  // Also check if any group cart or items exist in window
  const inCart = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const matches = [];
    all.forEach(el => {
      const t = el.innerText?.trim();
      if (t && (t.includes('₹') || t.includes('Item') || t.includes('Cart') || t.includes('Rahul'))) {
        if (t.length < 100) matches.push(t);
      }
    });
    return matches.slice(0, 20);
  });
  console.log('Matches:', inCart);

  await browser.close();
})();
