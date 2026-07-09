const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-gpu', '--disable-images', '--disable-javascript'] // Start with JS off
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0');
  await page.setViewport({ width: 1280, height: 800 });

  // Block everything except the document
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    const type = req.resourceType();
    // Only allow document and xhr/fetch
    if (type === 'image' || type === 'font' || type === 'media' || type === 'stylesheet' ||
        url.includes('google') || url.includes('facebook') || url.includes('doubleclick') ||
        url.includes('analytics')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    console.log('Navigating...');
    await page.goto('https://www.oddsagora.com.br/football/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/', { 
      waitUntil: 'networkidle0', timeout: 60000 
    });
    console.log('Page loaded');
    await new Promise(r => setTimeout(r, 5000));
    
    // Try to find Vue.js data in the DOM
    const data = await page.evaluate(() => {
      // Look for Vue instance data
      const appEl = document.getElementById('app') || document.querySelector('[data-vue]');
      
      // Search through all scripts for pageVar
      const scripts = document.querySelectorAll('script');
      let pageVarData = null;
      scripts.forEach(s => {
        const text = s.textContent;
        if (text.includes('pageVar') && text.includes('bookmakerOdds')) {
          pageVarData = text.slice(0, 2000);
        }
      });
      
      // Try to access Vue.js __vue__
      let vueData = null;
      const mainEl = document.querySelector('[class*="app"], [class*="main"], #app');
      if (mainEl && mainEl.__vue__) {
        vueData = Object.keys(mainEl.__vue__);
      }
      
      // Check window variables
      const winVars = {};
      ['pageVar', 'pageOutrightsVar', 'bookmakerOdds', 'gameData', 'matchData'].forEach(k => {
        if (window[k]) {
          winVars[k] = typeof window[k];
        }
      });
      
      return { pageVarData, vueData, winVars, appEl: appEl ? appEl.tagName : null };
    });
    
    console.log(JSON.stringify(data, null, 2));
    
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await browser.close();
})().catch(e => console.log('FATAL:', e.message));
