const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');
  await page.goto('https://www.oddsagora.com.br/football/h2h/slovacko-MNEDyOlF/zorya-j9Wy32w4/', { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  
  const data = await page.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n');
    let inOdds = false;
    let collected = [];
    for (const line of lines) {
      const t = line.trim();
      if (t === 'Casas de apostas') { inOdds = true; continue; }
      if (t.includes('Meu bilhete') || t.includes('Previsões')) { inOdds = false; break; }
      if (inOdds && t) collected.push(t);
    }
    return collected;
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch(e => console.log('Error:', e.message));
