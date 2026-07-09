const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const ODDSAGORA_AES_PASSPHRASE = "J*8sQ!p$7aD_fR2yW@gHn*3bVp#sAdLd_k";
const ODDSAGORA_AES_SALT = "5b9a8f2c3e6d1a4b7c8e9d0f1a2b3c4d";

function fetchUrl(url, ref) {
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Referer': ref || 'https://www.oddsagora.com.br/' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function decryptOddsAgora(text) {
  try {
    const decoded = Buffer.from(text, "base64").toString("utf8");
    const [encB64, ivHex] = decoded.split(":");
    if (!encB64 || !ivHex) throw new Error("Invalid format");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encB64, "base64");
    const key = crypto.pbkdf2Sync(ODDSAGORA_AES_PASSPHRASE, ODDSAGORA_AES_SALT, 1000, 32, "sha256");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    if (decrypted[0] === 0x1f && decrypted[1] === 0x8b) {
      return JSON.parse(zlib.gunzipSync(decrypted).toString("utf8"));
    }
    return JSON.parse(decrypted.toString("utf8"));
  } catch (e) {
    throw new Error('Decrypt failed: ' + e.message);
  }
}

async function main() {
  // Step 1: Get h2h page data
  const h2hText = await fetchUrl(
    'https://www.oddsagora.com.br/ajax-user-data/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/',
    'https://www.oddsagora.com.br/football/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/'
  );
  
  // Extract the Object.assign JSON
  const assignIdx = h2hText.indexOf('Object.assign');
  const afterAssign = h2hText.slice(assignIdx);
  const parseIdx = afterAssign.indexOf('JSON.parse(');
  const afterParse = afterAssign.slice(parseIdx);
  const firstQuote = afterParse.indexOf('"');
  
  let str = '';
  let i = firstQuote + 1;
  while (i < afterParse.length) {
    const ch = afterParse[i];
    if (ch === '\\' && afterParse[i+1] === '"') { str += '"'; i += 2; }
    else if (ch === '\\' && afterParse[i+1] === '/') { str += '/'; i += 2; }
    else if (ch === '\\' && afterParse[i+1] === '\\') { str += '\\'; i += 2; }
    else if (ch === '"') { break; }
    else { str += ch; i++; }
  }
  
  const data = JSON.parse(str);
  
  // Check for encriptedResponse
  if (data.encriptedResponse) {
    console.log('encriptedResponse found, length:', data.encriptedResponse.length);
    try {
      const decrypted = decryptOddsAgora(data.encriptedResponse);
      console.log('Decrypted keys:', Object.keys(decrypted));
      console.log('Sample:', JSON.stringify(decrypted).slice(0, 1000));
    } catch (e) {
      console.log('Decrypt failed:', e.message);
    }
  } else {
    console.log('No encriptedResponse');
  }
  
  // Step 2: Try bookmakerUrl
  if (data.bookmakerUrl) {
    const cleanUrl = data.bookmakerUrl.replace(/\\\//g, '/');
    const fullUrl = 'https://www.oddsagora.com.br' + cleanUrl;
    console.log('\nFetching bookmakerUrl:', fullUrl);
    try {
      const nextGames = await fetchUrl(fullUrl, 'https://www.oddsagora.com.br/football/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/');
      console.log('Response length:', nextGames.length);
      // Try to decrypt
      if (nextGames.length > 100) {
        try {
          const decrypted = decryptOddsAgora(nextGames);
          console.log('Decrypted keys:', Object.keys(decrypted));
          console.log('Sample:', JSON.stringify(decrypted).slice(0, 1500));
        } catch (e) {
          console.log('Not encrypted, sample:', nextGames.slice(0, 300));
        }
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}

main().catch(console.error);
