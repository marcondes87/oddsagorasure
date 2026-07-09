const https = require('https');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*',
        'Referer': 'https://www.oddsagora.com.br/football/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  // Extract bookiehash from h2h response
  const h2hData = await fetchUrl('https://www.oddsagora.com.br/ajax-user-data/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/');
  
  // Extract the JSON part from Object.assign
  const match = h2hData.match(/JSON\.parse\("([^"]+)"\)/);
  if (!match) { console.log('No JSON found'); return; }
  
  const escaped = match[1];
  const parsed = JSON.parse(escaped);
  console.log('Parsed keys:', Object.keys(parsed));
  
  if (parsed.bookmakerUrl) {
    console.log('bookmakerUrl:', parsed.bookmakerUrl);
    // Try fetching it
    const fullUrl = 'https://www.oddsagora.com.br' + parsed.bookmakerUrl;
    console.log('Fetching:', fullUrl);
    try {
      const data = await fetchUrl(fullUrl);
      console.log('Response length:', data.length);
      console.log('First 300:', data.slice(0, 300));
    } catch (e) {
      console.log('Error fetching:', e.message);
    }
  }
  
  if (parsed.bookiehash) {
    console.log('\nbookiehash:', parsed.bookiehash);
    // Try to parse the X-delimited format
    const parts = parsed.bookiehash.split('X').filter(Boolean).map(Number);
    console.log('Parts count:', parts.length);
    console.log('Parts:', parts.slice(0, 10), '...');
  }
}

main().catch(console.error);
