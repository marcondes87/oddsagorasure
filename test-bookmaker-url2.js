const https = require('https');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const text = await fetchUrl('https://www.oddsagora.com.br/ajax-user-data/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/');
  
  // Find the second JSON.parse("...") with the actual data
  const matches = [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && typeof parsed === 'object' && parsed.bookmakerUrl) {
        console.log('Found bookmakerUrl:', parsed.bookmakerUrl);
        console.log('Found bookiehash:', (parsed.bookiehash || '').slice(0, 80));
        
        // Fetch the bookmakerUrl
        const fullUrl = 'https://www.oddsagora.com.br' + parsed.bookmakerUrl;
        console.log('\nFetching:', fullUrl);
        try {
          const data = await fetchUrl(fullUrl);
          console.log('Response length:', data.length);
          console.log('Sample:', data.slice(0, 500));
        } catch (e) {
          console.log('Fetch error:', e.message);
        }
        return;
      }
    } catch (e) {
      // not JSON
    }
  }
  console.log('No bookmakerUrl found');
}

main().catch(console.error);
