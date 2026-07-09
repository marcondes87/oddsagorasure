const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] 
  });
  console.log('Browser launched');
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');
  await page.setViewport({ width: 1280, height: 800 });
  
  const url = 'https://www.oddsagora.com.br/football/h2h/slovacko-MNEDyOlF/zorya-j9Wy32w4/';
  console.log('Navigating to:', url);
  
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Page loaded, waiting for render...');
  await new Promise(r => setTimeout(r, 4000));
  
  const data = await page.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n');
    
    // Find odds section
    let inOdds = false;
    let oddsLines = [];
    for (const line of lines) {
      const t = line.trim();
      if (t === 'Casas de apostas') { inOdds = true; continue; }
      if (inOdds && (t.includes('Meu bilhete') || t.includes('Previsões') || t.includes('Procurando'))) break;
      if (inOdds && t) oddsLines.push(t);
    }
    
    console.log('Odds section lines:', oddsLines.length);
    
    // Skip header (1, X, 2, Payout)
    const dataLines = oddsLines.slice(4);
    
    // Group into bookmaker entries (5 lines each)
    const bookmakers = [];
    for (let i = 0; i + 4 < dataLines.length; i += 5) {
      const name = dataLines[i];
      const odd1 = parseFloat(dataLines[i+1]);
      const oddX = parseFloat(dataLines[i+2]);
      const odd2 = parseFloat(dataLines[i+3]);
      const payout = parseFloat(dataLines[i+4].replace('%', ''));
      if (name && !isNaN(odd1) && !isNaN(odd2)) {
        bookmakers.push({ name, odds: [odd1, oddX, odd2], payout });
      }
    }
    
    return { bookmakers };
  });
  
  console.log(`\nFound ${data.bookmakers.length} bookmakers:`);
  data.bookmakers.forEach(b => {
    console.log(`  ${b.name}: ${b.odds.join(', ')} (payout: ${b.payout}%)`);
  });
  
  // Calculate surebet
  const n = 3; // 1X2
  const bestOdds = [];
  for (let i = 0; i < n; i++) {
    let best = 0, bestBm = '';
    for (const b of data.bookmakers) {
      if (b.odds[i] > best) { best = b.odds[i]; bestBm = b.name; }
    }
    bestOdds.push({ odd: best, bookmaker: bestBm });
  }
  const sumInv = bestOdds.reduce((s, o) => s + 1 / o.odd, 0);
  const profit = (1 / sumInv - 1) * 100;
  
  console.log(`\nBest odds across all bookmakers:`);
  bestOdds.forEach((o, i) => console.log(`  Outcome ${i+1}: ${o.odd} (${o.bookmaker})`));
  console.log(`Sum inverse: ${sumInv.toFixed(4)}`);
  console.log(`Profit: ${profit.toFixed(2)}%`);
  console.log(profit > 0 ? '✅ SURBET!' : '❌ No surebet');
  
  await browser.close();
})().catch(e => console.log('FATAL:', e.message));
