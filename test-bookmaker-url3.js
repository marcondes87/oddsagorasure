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
  
  // Find bookmakerUrl
  const idx = text.indexOf('bookmakerUrl');
  if (idx === -1) { console.log('Not found'); return; }
  
  // Extract the value
  const valStart = text.indexOf('"', idx + 13); // skip "bookmakerUrl":
  if (valStart === -1) { console.log('No start quote'); return; }
  const valEnd = text.indexOf('"', valStart + 1);
  if (valEnd === -1) { console.log('No end quote'); return; }
  
  const url = text.slice(valStart + 1, valEnd);
  // Unescape JSON escapes
  const cleanUrl = url.replace(/\\\//g, '/');
  console.log('bookmakerUrl:', cleanUrl);
  
  const fullUrl = 'https://www.oddsagora.com.br' + cleanUrl;
  console.log('Full URL:', fullUrl);
  
  try {
    const data = await fetchUrl(fullUrl);
    console.log('Response length:', data.length);
    console.log('Sample:', data.slice(0, 500));
  } catch (e) {
    console.log('Fetch error:', e.message);
  }
}

main().catch(console.error);
