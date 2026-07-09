const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');
  await page.setViewport({ width: 1280, height: 800 });
  
  await page.goto('https://www.oddsagora.com.br/football/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/', { 
    waitUntil: 'networkidle2', timeout: 30000 
  });
  await new Promise(r => setTimeout(r, 4000));
  
  const result = await page.evaluate(() => {
    // Find the odds table by looking for elements containing "Casas de apostas"
    const allText = document.body.innerText;
    
    // Find "Casas de apostas" and capture surrounding text
    const idx = allText.indexOf('Casas de apostas');
    if (idx === -1) return { error: 'Casas de apostas not found' };
    
    const section = allText.slice(idx, idx + 5000);
    const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
    
    // Show first 30 lines after "Casas de apostas"
    return {
      totalLines: lines.length,
      first40: lines.slice(0, 40)
    };
  });
  
  console.log('Total lines in section:', result.totalLines);
  result.first40.forEach((line, i) => {
    console.log(i + ':', line.replace(/\s+/g, ' '));
  });
  
  await browser.close();
})().catch(e => console.log('FATAL:', e.message));
