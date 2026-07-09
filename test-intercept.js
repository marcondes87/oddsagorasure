const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-gpu', '--disable-images', '--disable-web-security'] 
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0');
  await page.setViewport({ width: 1280, height: 800 });

  // Block resources that slow down loading
  await page.setRequestInterception(true);
  const requests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('google') || url.includes('facebook') || url.includes('doubleclick') || 
        url.includes('analytics') || url.includes('tracking') || url.endsWith('.png') || 
        url.endsWith('.jpg') || url.endsWith('.gif') || url.endsWith('.svg') ||
        url.endsWith('.woff') || url.endsWith('.woff2') || url.endsWith('.ttf')) {
      req.abort();
    } else {
      // Capture ajax-user-data responses
      if (url.includes('ajax-user-data/h2h/')) {
        console.log('CAPTURING:', url.slice(0, 100));
      }
      req.continue();
    }
  });

  // Capture responses
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('ajax-user-data/h2h/')) {
      try {
        const text = await resp.text();
        console.log('INTERCEPTED H2H response:', text.slice(0, 500));
        requests.push({ url, data: text });
      } catch (e) {
        console.log('Error reading response:', e.message);
      }
    }
  });

  try {
    await page.goto('https://www.oddsagora.com.br/football/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/', { 
      waitUntil: 'domcontentloaded', timeout: 30000 
    });
    await new Promise(r => setTimeout(r, 8000));
    
    // Try to extract rendered data
    const rendered = await page.evaluate(() => {
      // Find table with odds
      const tables = document.querySelectorAll('table');
      let found = [];
      tables.forEach((t, idx) => {
        const text = t.textContent;
        if (text.includes('%') && text.includes('Payout') && found.length === 0) {
          const rows = t.querySelectorAll('tr');
          rows.forEach((row, ri) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
              const nameCell = cells[0];
              const link = nameCell.querySelector('a');
              found.push({
                row: ri,
                name: nameCell.textContent.trim().slice(0, 30),
                href: link ? link.href : null,
                odds: Array.from(cells).slice(1).map(c => c.textContent.trim())
              });
            }
          });
        }
      });
      return found.length > 0 ? found : null;
    });
    
    if (rendered) {
      console.log('\nRENDERED TABLE:');
      rendered.forEach(r => console.log(r.row + ':', r.name, '->', r.href, 'odds:', r.odds.slice(0,4).join(', ')));
    } else {
      console.log('No table found via querySelector');
    }
  } catch (e) {
    console.log('Page error:', e.message);
  }
  
  console.log('\nCaptured requests:', requests.length);
  await browser.close();
})().catch(e => console.log('FATAL:', e.message));
