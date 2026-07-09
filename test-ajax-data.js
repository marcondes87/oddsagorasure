const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');

const ODDSAGORA_AES_PASSPHRASE = "J*8sQ!p$7aD_fR2yW@gHn*3bVp#sAdLd_k";
const ODDSAGORA_AES_SALT = "5b9a8f2c3e6d1a4b7c8e9d0f1a2b3c4d";
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
        'Referer': 'https://www.oddsagora.com.br/'
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function decrypt(encryptedBase64) {
  try {
    const decoded = Buffer.from(encryptedBase64, "base64").toString("utf8");
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
  // Try to fetch the H2H data via the Ajax endpoint
  const h2hUrl = 'https://www.oddsagora.com.br/ajax-user-data/h2h/bahia-UeD7XtzM/chapecoense-jcQV3XP6/';
  console.log('Fetching:', h2hUrl);
  
  try {
    const data = await fetchUrl(h2hUrl);
    console.log('Response length:', data.length);
    console.log('First 200 chars:', data.slice(0, 200));
    
    // Try to decrypt if it's base64
    if (data.length > 100) {
      try {
        const decrypted = decrypt(data);
        console.log('Decrypted:', JSON.stringify(decrypted).slice(0, 500));
      } catch (e) {
        console.log('Not encrypted data, trying as JSON...');
        try {
          const json = JSON.parse(data);
          console.log('JSON keys:', Object.keys(json));
          console.log('JSON:', JSON.stringify(json).slice(0, 500));
        } catch (e2) {
          console.log('Not JSON either:', e2.message);
        }
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

main();
