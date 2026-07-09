const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-gpu', '--disable-images'] 
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0');
  await page.setViewport({ width: 1280, height: 800 });
  
  await page.goto('https://www.oddsagora.com.br/football/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/', { 
    waitUntil: 'domcontentloaded', timeout: 20000 
  });
  await new Promise(r => setTimeout(r, 8000));
  
  const result = await page.evaluate(() => {
    const allText = document.body.innerText;
    const idx = allText.indexOf('Casas de apostas');
    if (idx === -1) return { error: 'Casas de apostas not found' };
    const section = allText.slice(idx, idx + 6000);
    const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
    return { totalLines: lines.length, first50: lines.slice(0, 50) };
  });
  
  console.log('Total lines:', result.totalLines);
  result.first50.forEach((line, i) => console.log(i + ':', line.replace(/\s+/g, ' ')));
  
  await browser.close();
})().catch(e => console.log('FATAL:', e.message));
