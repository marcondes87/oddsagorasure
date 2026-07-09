const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.time('total');
  
  // Just one league, 3 matches
  const html = await fetchUrl('https://www.oddsagora.com.br/football/brazil/brasileirao-betano/');
  
  const regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  const matches = [];
  while ((match = regex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (json['@type'] && json['@type'].includes('SportsEvent') && json.url) {
        const name = json.name || '';
        const parts = name.split(' - ');
        const cleanUrl = json.url.split('#')[0];
        matches.push({ name, url: cleanUrl, startDate: json.startDate || '' });
      }
    } catch (e) {}
  }
  
  console.log(`Found ${matches.length} matches, scraping first ${Math.min(3, matches.length)}...`);
  
  console.time('browser');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  console.timeEnd('browser');
  
  const targetMatches = matches.slice(0, 3);
  
  for (const m of targetMatches) {
    console.log(`\nScraping: ${m.name}`);
    console.time('match');
    
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });
    
    try {
      await page.goto(m.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      
      const result = await page.evaluate(() => {
        const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(Boolean);
        
        let inOdds = false, oddsLines = [];
        for (const line of lines) {
          if (line === 'Casas de apostas') { inOdds = true; continue; }
          if (inOdds && (line.includes('Meu bilhete') || line.includes('Previsões'))) break;
          if (inOdds) oddsLines.push(line);
        }
        
        const dataLines = oddsLines.slice(4);
        const bookmakers = [];
        for (let i = 0; i + 4 < dataLines.length; i += 5) {
          const name = dataLines[i];
          const odds = [parseFloat(dataLines[i+1]), parseFloat(dataLines[i+2]), parseFloat(dataLines[i+3])];
          if (name && odds.every(o => !isNaN(o))) {
            bookmakers.push({ name, odds });
          }
        }
        return { bookmakers };
      });
      
      if (result.bookmakers.length > 0) {
        // Best odds
        const bestO1 = Math.max(...result.bookmakers.map(b => b.odds[0]));
        const bestOX = Math.max(...result.bookmakers.map(b => b.odds[1]));
        const bestO2 = Math.max(...result.bookmakers.map(b => b.odds[2]));
        const sumInv = 1/bestO1 + 1/bestOX + 1/bestO2;
        const profit = ((1/sumInv - 1) * 100).toFixed(2);
        console.log(`  BMs: ${result.bookmakers.length}, Best: ${bestO1}/${bestOX}/${bestO2}, Profit: ${profit}%`);
      } else {
        console.log('  No bookmakers found');
      }
    } catch (e) {
      console.log('  Error:', e.message);
    }
    
    await page.close().catch(() => {});
    console.timeEnd('match');
  }
  
  await browser.close();
  console.timeEnd('total');
}

main().catch(console.error);
