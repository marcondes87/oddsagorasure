const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function killOrphanedChrome() {
  // Only kill headless Chrome processes (spawned by Puppeteer), never user's Chrome
  try {
    const { execSync } = require('child_process');
    const result = execSync('wmic process where "name=\'chrome.exe\' and commandline like \'%headless%\'" get processid 2>nul', { encoding: 'utf8', timeout: 5000 });
    const pids = result.split(/\s+/).filter(p => /^\d+$/.test(p));
    pids.forEach(pid => {
      try { execSync(`taskkill /f /pid ${pid} 2>nul`, { stdio: 'ignore', timeout: 3000 }); } catch (e) {}
    });
    if (pids.length > 0) console.log(`  Killed ${pids.length} headless Chrome process(es)`);
  } catch (e) {}
}

const DATA_DIR = path.join(__dirname, 'data');
const SCRAPER_FILE = path.join(DATA_DIR, 'scraped-odds.json');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0';

const LEAGUES = [
  '/football/brazil/brasileirao-betano/',
  '/football/brazil/brasileirao-serie-b/',
  '/football/brazil/copa-betano-do-brasil/',
];
const MAX_MATCHES_PER_LEAGUE = 3;

const MARKET_TABS = [
  '1X2',
  'Acima/Abaixo',  // Over/Under
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractMatchesFromHtml(html) {
  const matches = [];
  const regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (json['@type'] && json['@type'].includes('SportsEvent') && json.url) {
        const name = json.name || '';
        const parts = name.split(' - ');
        const home = parts[0]?.trim() || '';
        const away = parts[1]?.trim() || '';
        const cleanUrl = json.url.split('#')[0];
        matches.push({ home, away, name, url: cleanUrl, startDate: json.startDate || '', sport: json.sport || '' });
      }
    } catch (e) {}
  }
  return matches;
}

async function extractOddsData(page) {
  return await page.evaluate(() => {
    // Breadcrumb for sport/league - try multiple approaches
    let sport = 'Futebol', league = '';

    // Approach 1: Find breadcrumb by text pattern "> Sport > Country > League >"
    const bodyText = document.body.innerText;
    const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
    const breadLine = lines.find(l => l.includes('>') && (l.includes('Página') || /^\w/.test(l)));
    if (breadLine) {
      const parts = breadLine.split('>').map(p => p.trim()).filter(p => p && !p.includes('Página'));
      if (parts.length >= 2) {
        sport = parts[0];
        // Find last part that doesn't contain " - " (team separator)
        const nonTeam = parts.filter(p => !p.includes(' - '));
        league = nonTeam[nonTeam.length - 1] || parts[parts.length - 1];
      }
    }

    // Approach 2: Find by DOM selectors (fallback)
    if (!league) {
      const breadEl = document.querySelector('[class*="breadcrumb"], nav[class*="bread"], .breadcrumbs, [class*="Breadcrumb"], nav a[href*="football"]');
      if (breadEl) {
        const items = breadEl.querySelectorAll('a, span, li');
        const crumbs = [];
        items.forEach(el => {
          const t = el.textContent.trim();
          if (t && t !== '>' && t !== '<' && !t.startsWith('http') && t.length < 50) crumbs.push(t);
        });
        const filtered = crumbs.filter(c => !c.includes(' - ') && c !== 'Página Inicial');
        if (filtered.length >= 2) { sport = filtered[0]; league = filtered[filtered.length - 1]; }
      }
    }

    // Approach 3: Regex fallback
    if (!league) {
      const breadMatch = bodyText.match(/(?:Página Inicial\s*>?\s*)(\w+(?:\s*\w+)*)(?:\s*>?\s*)([\w\sÀ-ÿ]+?)(?:\s*>?\s*[\w\sÀ-ÿ]+?(?:\s*-+\s*[\w\sÀ-ÿ]+)?)/);
      if (breadMatch) {
        sport = breadMatch[1];
        league = breadMatch[2].trim();
      }
    }

    // Event time
    let eventTime = '';
    const timeEl = document.querySelector('[datetime], time, [class*="date"], [class*="time"]');
    if (timeEl) eventTime = timeEl.textContent.trim() || timeEl.getAttribute('datetime') || '';
    if (!eventTime) {
      const dm = document.body.innerText.match(/\d{2}\s+\w+\s+\d{4}/);
      if (dm) eventTime = dm[0];
    }

    // Extract bookmakers by finding each row and parsing children
    const bookmakers = [];
    const allRows = document.querySelectorAll('div.flex.h-9');
    allRows.forEach(rowEl => {
      const children = rowEl.children;
      if (children.length < 4) return;

      // First child: bookmaker name + link (find link with text)
      const firstChild = children[0];
      const links = firstChild.querySelectorAll('a');
      let name = '', href = '';
      links.forEach(a => {
        const t = a.textContent.trim();
        if (t && t.length > 1 && t.length < 30 && !t.includes('Casas') && !t.includes('Todas')) {
          name = t; href = a.href;
        }
      });
      if (!name && firstChild.textContent.trim().length > 1) {
        name = firstChild.textContent.trim();
      }
      if (!name || name.length < 2 || name.length > 30) return;

      // Children 1-3: odds cells
      const odds = [];
      for (let ci = 1; ci <= 3 && ci < children.length; ci++) {
        const cell = children[ci];
        const cellLink = cell.querySelector('a');
        const val = parseFloat(cellLink ? cellLink.textContent.trim() : cell.textContent.trim());
        odds.push(isNaN(val) ? 0 : val);
      }
      if (odds.length < 2 || odds.some(o => o <= 0)) return;

      // Last child: payout
      const lastChild = children[children.length - 1];
      const payText = lastChild.textContent.trim().replace('%', '');
      const payout = parseFloat(payText);

      bookmakers.push({
        name,
        odds,
        payout: isNaN(payout) ? 0 : payout,
        url: href
      });
    });

    return { sport, league, eventTime, bookmakers };
  });
}

async function scrapeMatchPage(page, matchUrl) {
  try {
    await page.goto(matchUrl, { waitUntil: 'networkidle0', timeout: 20000 });
    try {
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        return text.includes('Payout') && /[12]\.\d{2}/.test(text);
      }, { timeout: 15000 });
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));

    // Extract 1X2 data
    const result1X2 = await extractOddsData(page);

    // Try clicking "Acima/Abaixo" tab for Over/Under
    let resultOU = { bookmakers: [] };
    try {
      const ouClicked = await page.evaluate(() => {
        const allEls = document.querySelectorAll('a, button, span, div');
        for (const el of allEls) {
          if (el.textContent.trim() === 'Acima/Abaixo' && el.offsetParent !== null) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (ouClicked) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          await page.waitForFunction(() => {
            const cells = document.querySelectorAll('.odds-cell');
            return cells.length > 0;
          }, { timeout: 5000 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
        resultOU = await extractOddsData(page);
      }
    } catch (e) {}

    return {
      sport: result1X2.sport,
      league: result1X2.league,
      eventTime: result1X2.eventTime,
      result1X2: { bookmakers: result1X2.bookmakers },
      resultOU: { bookmakers: resultOU.bookmakers }
    };
  } catch (e) {
    return null;
  }
}

function calculateSurebets(bookmakers) {
  const results = [];
  const byCount = {};
  for (const bm of bookmakers) {
    if (bm.odds.some(o => o <= 0)) continue;
    const key = bm.odds.length;
    if (!byCount[key]) byCount[key] = [];
    byCount[key].push(bm);
  }

  for (const [numOutcomes, group] of Object.entries(byCount)) {
    const n = parseInt(numOutcomes);
    if (n < 2) continue;

    const bestOdds = [];
    for (let i = 0; i < n; i++) {
      let best = 0, bestBm = '', bestUrl = '';
      for (const bm of group) {
        if (bm.odds[i] > best) { best = bm.odds[i]; bestBm = bm.name; bestUrl = bm.url || ''; }
      }
      bestOdds.push({ odd: best, bookmaker: bestBm, url: bestUrl });
    }

    const sumInv = bestOdds.reduce((s, o) => s + 1 / o.odd, 0);
    const profitPercent = parseFloat(((1 / sumInv - 1) * 100).toFixed(2));

    results.push({ outcomes: n, bestOdds, sumInverse: parseFloat(sumInv.toFixed(4)), profitPercent });
  }

  return results;
}

async function runScraper() {
  killOrphanedChrome();
  console.log('[OddsAgora Scraper] Starting...');
  const startTime = Date.now();

  // Step 1: Get match URLs
  console.log('[OddsAgora Scraper] Fetching leagues...');
  const allMatches = [];
  for (const league of LEAGUES) {
    const url = `https://www.oddsagora.com.br${league}`;
    try {
      const html = await fetchUrl(url);
      const matches = extractMatchesFromHtml(html);
      const limited = matches.slice(0, MAX_MATCHES_PER_LEAGUE).map(m => ({ ...m, leaguePath: league }));
      allMatches.push(...limited);
      console.log(`  ${league}: ${limited.length} matches`);
    } catch (e) {
      console.log(`  ${league}: error - ${e.message}`);
    }
  }
  console.log(`[OddsAgora Scraper] Total: ${allMatches.length} matches`);

  if (allMatches.length === 0) return [];

  // Step 2: Scrape odds
  console.log('[OddsAgora Scraper] Launching Puppeteer...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-images'] });

  const CONCURRENCY = 3;
  const scraped = [];

  for (let batchIdx = 0; batchIdx < allMatches.length; batchIdx += CONCURRENCY) {
    const batch = allMatches.slice(batchIdx, batchIdx + CONCURRENCY);
    console.log(`  Batch ${batchIdx / CONCURRENCY + 1}/${Math.ceil(allMatches.length / CONCURRENCY)}`);

    const results = await Promise.all(batch.map(async (m) => {
      const page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);
      await page.setViewport({ width: 1280, height: 800 });
      await page.setRequestInterception(true);
      page.on('request', req => {
        if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
        else req.continue();
      });
      try {
        const data = await scrapeMatchPage(page, m.url);
        if (data) return { ...m, ...data };
        return null;
      } catch (e) {
        return null;
      } finally {
        await page.close().catch(() => {});
      }
    }));

    scraped.push(...results.filter(Boolean));
  }

  await browser.close();

  // Step 3: Calculate surebets for each match+market combo
  const allSurebets = [];
  for (const m of scraped) {
    const teamNames = (m.name || '').split(' - ').map(p => p.replace(/\([^)]*\)/g, '').trim().toLowerCase()).filter(Boolean);

    for (const marketKey of ['result1X2', 'resultOU']) {
      const data = m[marketKey];
      if (!data || !data.bookmakers || data.bookmakers.length === 0) continue;

      const marketName = marketKey === 'result1X2' ? 'Resultado Final 1X2' : 'Total de Gols (Acima/Abaixo)';
      const labels = marketKey === 'result1X2' ? ['Casa', 'Empate', 'Fora'] : ['Mais', 'Menos'];

      const surebets = calculateSurebets(data.bookmakers);
      for (const s of surebets) {
        // Only keep realistic surebets: profit < 15% AND sumInverse > 0.85
        if (s.profitPercent > 0 && s.profitPercent < 15 && s.sumInverse > 0.85) {
          const outcomes = s.bestOdds.map((o, idx) => {
            let bookmaker = o.bookmaker || '';
            let outUrl = o.url || m.url;
            if (teamNames.length > 0 && teamNames.includes(bookmaker.toLowerCase())) {
              bookmaker = `${labels[idx]} (Casa ${idx + 1})`;
              outUrl = m.url;
            }
            return {
              name: labels[idx] || `Outcome ${idx + 1}`,
              bookmaker,
              odd: o.odd,
              url: outUrl
            };
          });

          allSurebets.push({
            id: 'scraped-' + m.name.replace(/\s+/g, '-').toLowerCase().slice(0, 30) + '-' + marketKey.slice(-3),
            event: m.name,
            sport: m.sport || 'Futebol',
            league: m.league || data?.league || '',
            country: '',
            market: marketName,
            startsAt: m.startDate || null,
            url: m.url,
            bestOdd: Math.max(...s.bestOdds.map(o => o.odd)),
            outcomes,
            surebet: {
              profitPercent: s.profitPercent,
              stakes: outcomes.map(o => ({ name: o.name, bookmaker: o.bookmaker, stake: 0, odd: o.odd, url: o.url }))
            },
            isSurebet: true,
            scrapedSource: true,
            scrapedMarket: marketKey
          });
        }
      }
    }
  }

  allSurebets.sort((a, b) => b.surebet.profitPercent - a.surebet.profitPercent);
  const topSurebets = allSurebets.slice(0, 50);

  const output = {
    scrapedAt: new Date().toISOString(),
    totalMatches: allMatches.length,
    scrapedMatches: scraped.length,
    positiveSurebets: topSurebets.length,
    rows: topSurebets,
    duration: Date.now() - startTime
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SCRAPER_FILE, JSON.stringify(output, null, 2));

  console.log(`[OddsAgora Scraper] Done in ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  console.log(`[OddsAgora Scraper] ${scraped.length}/${allMatches.length} scraped, ${topSurebets.length} positive surebets`);

  for (const sb of topSurebets) {
    console.log(`  ${sb.surebet.profitPercent}% - ${sb.event} [${sb.market}]`);
    for (const o of sb.outcomes) {
      console.log(`     ${o.bookmaker}: ${o.odd}`);
    }
  }

  return output;
}

function getScrapedData() {
  try {
    return JSON.parse(fs.readFileSync(SCRAPER_FILE, 'utf8'));
  } catch {
    return { rows: [], scrapedAt: null, totalMatches: 0, scrapedMatches: 0, positiveSurebets: 0 };
  }
}

if (require.main === module) {
  runScraper().catch(console.error);
}

module.exports = { runScraper, getScrapedData };
