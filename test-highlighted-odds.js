const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-gpu', '--disable-images', '--disable-web-security']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const url = 'https://www.oddsagora.com.br/football/h2h/fluminense-EV9L3kU4/red-bull-bragantino-jwKvKhGa/';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForFunction(() => document.body.innerText.includes('Payout'), { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(() => {
    // Find the odds grid: rows with odds-cell
    const oddsCells = document.querySelectorAll('.odds-cell');
    const bookmakers = [];
    
    // Each bookmaker row has 4+ odds-cells: [name, odd1, oddX, odd2, payout]
    const gridRows = [];
    let currentRow = [];
    oddsCells.forEach(cell => {
      currentRow.push(cell);
      // If we have 5 cells, that's a full bookmaker row
      if (currentRow.length === 5) {
        gridRows.push(currentRow);
        currentRow = [];
      }
    });
    if (currentRow.length > 0 && gridRows.length > 0) {
      // Incomplete row - append to last? skip
    }
    
    // Extract bookmaker info
    gridRows.forEach((row, ri) => {
      const nameEl = row[0].querySelector('a, span, div');
      const name = nameEl ? nameEl.textContent.trim() : '';
      
      const odds = [];
      // cols 1,2,3 = 1, X, 2
      for (let ci = 1; ci <= 3; ci++) {
        const cell = row[ci];
        const link = cell.querySelector('a');
        const oddText = link ? link.textContent.trim() : cell.textContent.trim();
        const bg = window.getComputedStyle(cell).backgroundColor;
        const color = window.getComputedStyle(cell).color;
        const fw = window.getComputedStyle(cell).fontWeight;
        const linkEl = cell.querySelector('.odds-link');
        const href = linkEl ? linkEl.href : (link ? link.href : '');
        odds.push({ col: ci, odd: oddText, bg, color, fw, href: href.slice(0,100) });
      }
      
      // Check payout
      const payoutEl = row[4];
      const payoutText = payoutEl.textContent.trim();
      
      bookmakers.push({ name, payout: payoutText, odds });
    });
    
    // Also get highlighted odds (if any differ)
    // Check for different background/color on any cell
    const bgColors = new Set();
    const fgColors = new Set();
    bookmakers.forEach(bm => bm.odds.forEach(o => {
      if (o.bg) bgColors.add(o.bg);
      if (o.color) fgColors.add(o.color);
    }));
    
    return {
      bookmakers: bookmakers.map(b => ({
        n: b.name, p: b.payout,
        o1: b.odds[0]?.odd, o1c: b.odds[0]?.color, o1bg: b.odds[0]?.bg,
        oX: b.odds[1]?.odd, oXc: b.odds[1]?.color, oXbg: b.odds[1]?.bg,
        o2: b.odds[2]?.odd, o2c: b.odds[2]?.color, o2bg: b.odds[2]?.bg,
        link1: b.odds[0]?.href?.slice(0,60) || '',
        linkX: b.odds[1]?.href?.slice(0,60) || '',
        link2: b.odds[2]?.href?.slice(0,60) || '',
      })),
      bgColors: [...bgColors],
      fgColors: [...fgColors]
    };
  });

  console.log('=== BOOKMAKERS ===');
  result.bookmakers.forEach((b, i) => {
    console.log(`\n${i}: ${b.n} (${b.p})`);
    console.log(`  1: ${b.o1}  color=${b.o1c}  bg=${b.o1bg}  ${b.link1?'[link]':''}`);
    console.log(`  X: ${b.oX}  color=${b.oXc}  bg=${b.oXbg}  ${b.linkX?'[link]':''}`);
    console.log(`  2: ${b.o2}  color=${b.o2c}  bg=${b.o2bg}  ${b.link2?'[link]':''}`);
  });
  console.log('\n=== COLORS ===');
  console.log('Backgrounds:', result.bgColors);
  console.log('Foregrounds:', result.fgColors);

  await browser.close();
})().catch(e => console.log('Error:', e.message));
