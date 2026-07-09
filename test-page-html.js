const https = require('https');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const html = await fetchHtml('https://www.oddsagora.com.br/football/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/');
  console.log('HTML length:', html.length);
  
  // Look for encrypted data patterns
  const patterns = [
    'ajax-user-data', 'encrypted', 'aes', 'base64', 'surebets',
    'data:image', 'window.__', 'csrf', 'token'
  ];
  for (const p of patterns) {
    const idx = html.indexOf(p);
    if (idx > -1) {
      console.log('Found:', p, 'at', idx, html.slice(Math.max(0, idx-50), idx+100));
    }
  }
  
  // Look for script tags with JSON-like content
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  let found = 0;
  while ((match = scriptRegex.exec(html)) !== null && found < 5) {
    const content = match[1].trim();
    if (content.length > 100 && (content.includes('{') || content.includes('data'))) {
      console.log('\nScript block', ++found, 'length:', content.length, 'prefix:', content.slice(0, 100));
    }
  }
  
  // Look for AJAX/API URLs
  const urlRegex = /\/ajax-user-data\/[^\s"']+/g;
  while ((match = urlRegex.exec(html)) !== null) {
    console.log('Data URL:', match[0]);
  }
}

main().catch(console.error);
