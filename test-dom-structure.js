const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');
  await page.setViewport({ width: 1280, height: 800 });
  
  await page.goto('https://www.oddsagora.com.br/football/h2h/fluminense-EV9L3kU4/red-bull-bragantino-jwKvKhGa/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  
  const structure = await page.evaluate(() => {
    // Find all table-like structures
    const tables = document.querySelectorAll('table');
    const result = [];
    
    tables.forEach((table, idx) => {
      const rows = table.querySelectorAll('tr');
      if (rows.length < 2) return;
      
      const rowData = [];
      rows.forEach((row, ri) => {
        const cells = row.querySelectorAll('th, td');
        const cellTexts = [];
        cells.forEach(cell => {
          const link = cell.querySelector('a');
          cellTexts.push({
            text: cell.textContent.trim().slice(0, 50),
            href: link ? link.href : null,
            tag: cell.tagName
          });
        });
        rowData.push(cellTexts);
      });
      
      result.push({ idx, rows: rowData.length, data: rowData.slice(0, 8) });
    });
    
    // Also look for bookmaker sections
    const allEls = document.querySelectorAll('*');
    const bookmakerSection = [];
    for (const el of allEls) {
      if (el.children.length === 0 && el.textContent.trim() === 'Casas de apostas') {
        bookmakerSection.push('Found "Casas de apostas" in:', el.tagName, el.parentElement?.tagName);
      }
    }
    
    return { tables: result, bookmakerSection };
  });
  
  console.log(JSON.stringify(structure, null, 2));
  await browser.close();
})().catch(console.error);
