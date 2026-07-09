// Test extracting bookmaker links from a simple H2H page
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-gpu', '--disable-images'] 
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0');

  // Use a match that loads quickly (Fluminense-Bragantino or similar)
  const url = 'https://www.oddsagora.com.br/football/h2h/fluminense-EV9L3kU4/red-bull-bragantino-jwKvKhGa/';
  
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const result = await page.evaluate(() => {
    // Find all tables
    const tables = document.querySelectorAll('table');
    const results = [];
    
    tables.forEach((table, ti) => {
      const rows = table.querySelectorAll('tr');
      rows.forEach((row, ri) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return;
        
        const firstCell = cells[0];
        const link = firstCell.querySelector('a');
        const name = firstCell.textContent.trim();
        
        if (link && link.href && name.length > 1 && name.length < 30) {
          results.push({
            table: ti, row: ri, name, href: link.href,
            odds: Array.from(cells).slice(1, 4).map(c => c.textContent.trim())
          });
        }
      });
    });
    
    return results;
  });

  console.log('Found', result.length, 'bookmaker links:');
  result.forEach(r => {
    console.log(`  ${r.name}: odds=${r.odds.join(', ')} -> ${r.href.slice(0, 100)}`);
  });

  await browser.close();
})().catch(e => console.log('Error:', e.message));
