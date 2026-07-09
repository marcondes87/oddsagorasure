const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-gpu', '--disable-images'] 
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0');

  const url = 'https://www.oddsagora.com.br/football/h2h/fluminense-EV9L3kU4/red-bull-bragantino-jwKvKhGa/';
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const result = await page.evaluate(() => {
    // Find ALL links on the page
    const allLinks = document.querySelectorAll('a[href]');
    const links = [];
    
    allLinks.forEach(a => {
      const href = a.href;
      const text = a.textContent.trim();
      // Only keep meaningful links
      if (text && text.length > 1 && text.length < 50) {
        links.push({ text, href: href.slice(0, 150) });
      }
    });
    
    return links;
  });

  console.log('Total links:', result.length);
  // Show links that look like bookmaker/sportsbook/irpara
  result.forEach(r => {
    if (r.href.includes('irpara') || r.href.includes('bookmaker') || 
        r.href.includes('sportsbook') || r.href.includes('betano') ||
        r.href.includes('betnacional') || r.href.includes('kto') ||
        r.href.includes('superbet') || r.href.includes('estrela') ||
        r.text.includes('Betano') || r.text.includes('Betnacional') ||
        r.text.includes('KTO') || r.text.includes('Superbet') ||
        r.href.includes('oddsagora.com.br/ir')) {
      console.log(`  [${r.text}] -> ${r.href}`);
    }
  });

  await browser.close();
})().catch(e => console.log('Error:', e.message));
