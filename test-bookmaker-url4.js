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
  
  // Find the Object.assign with the actual data payload
  const assignIdx = text.indexOf('Object.assign');
  if (assignIdx === -1) { console.log('Object.assign not found'); return; }
  
  // Get everything after Object.assign
  const afterAssign = text.slice(assignIdx);
  console.log('After Object.assign:', afterAssign.slice(0, 300));
  
  // Extract the JSON.parse argument - it's a JSON string with escaped quotes
  // The pattern is: Object.assign(pageVar, JSON.parse("{\"...\"}"));
  // Find the JSON.PARSE opening
  const parseIdx = afterAssign.indexOf('JSON.parse(');
  if (parseIdx === -1) return;
  
  const afterParse = afterAssign.slice(parseIdx);
  // Find the first " after JSON.parse(
  const firstQuote = afterParse.indexOf('"');
  if (firstQuote === -1) return;
  
  // The string starts at firstQuote+1 and ends at the closing ")
  // But it's a JSON-escaped string, so " inside are \"
  let str = '';
  let i = firstQuote + 1;
  while (i < afterParse.length) {
    const ch = afterParse[i];
    if (ch === '\\' && afterParse[i+1] === '"') {
      str += '"';
      i += 2;
    } else if (ch === '\\' && afterParse[i+1] === '\\') {
      str += '\\';
      i += 2;
    } else if (ch === '"') {
      // Check if the next chars are )) which means this is the end
      // Actually the pattern is "));
      // So after ", we should see ))
      break;
    } else {
      str += ch;
      i++;
    }
  }
  
  try {
    const parsed = JSON.parse(str);
    console.log('Parsed keys:', Object.keys(parsed));
    if (parsed.bookmakerUrl) {
      const cleanUrl = parsed.bookmakerUrl.replace(/\\\//g, '/');
      console.log('bookmakerUrl:', cleanUrl);
    }
  } catch (e) {
    console.log('Parse error:', e.message);
    console.log('String (first 200):', str.slice(0, 200));
  }
}

main().catch(console.error);
