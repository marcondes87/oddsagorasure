const https = require('https');
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
  // Test with just one league
  const url = 'https://www.oddsagora.com.br/football/world/amistoso-interclubes/';
  console.log('Fetching:', url);
  const html = await fetchUrl(url);
  console.log('HTML length:', html.length);
  
  const regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  let count = 0;
  while ((match = regex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (json['@type'] && json['@type'].includes('SportsEvent')) {
        count++;
        if (count <= 2) {
          console.log('Match:', json.name);
          console.log('  URL:', json.url);
          console.log('  Sport:', json.sport);
          console.log('  Start:', json.startDate);
        }
      }
    } catch (e) {}
  }
  console.log('Total matches in JSON-LD:', count);
}

main().catch(console.error);
