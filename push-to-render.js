const RENDER_URL = process.env.RENDER_URL || "https://arbipower-sb.onrender.com";

async function main() {
  console.log("Buscando dados do OA...");
  // Reuse server modules
  const crypto = require("crypto");
  const zlib = require("zlib");

  const OA_URL = "https://www.oddsagora.com.br/surebets-ajax/";
  const OA_PAGE = "https://www.oddsagora.com.br/sure-bets/";
  const PASSPHRASE = "J*8sQ!p$7aD_fR2yW@gHn*3bVp#sAdLd_k";
  const SALT = "5b9a8f2c3e6d1a4b7c8e9d0f1a2b3c4d";

  // Get cookies
  const pageResp = await fetch(OA_PAGE, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9"
    }
  });
  const setCookie = pageResp.headers.get("set-cookie") || "";
  const cookieParts = setCookie.split(",").map(s => s.split(";")[0].trim()).filter(Boolean).join("; ");

  // Fetch OA API
  const resp = await fetch(OA_URL, {
    headers: {
      "Accept": "*/*",
      "Referer": OA_PAGE,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      ...(cookieParts ? { "Cookie": cookieParts } : {})
    }
  });
  const text = await resp.text();
  if (!text || text.length < 20) throw new Error(`Resposta curta: ${text.length} chars`);

  // Decrypt
  const decoded = Buffer.from(text, "base64").toString("utf8");
  const [encB64, ivStr] = decoded.split(":");
  const iv = ivStr.length === 32 && /^[0-9a-f]+$/i.test(ivStr) ? Buffer.from(ivStr, "hex") : Buffer.from(ivStr, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const key = crypto.pbkdf2Sync(PASSPHRASE, Buffer.from(SALT, "utf8"), 1000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  if (decrypted[0] === 0x1f && decrypted[1] === 0x8b) {
    decrypted = zlib.gunzipSync(decrypted);
  }
  const parsed = JSON.parse(decrypted.toString("utf8"));
  const rows = parsed?.d?.data || [];
  console.log(`  ${rows.length} surebets do OA`);

  if (rows.length) {
    console.log(`Enviando OA para ${RENDER_URL}/api/ingest-oa ...`);
    const push = await fetch(`${RENDER_URL}/api/ingest-oa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows)
    });
    const result = await push.json();
    console.log("  OA:", JSON.stringify(result));
  } else {
    console.log("  OA: 0 surebets (pulado)");
  }

  // Fetch fresh Pinnacle data
  let pinData;
  try {
    const server = require("./server.js");
    console.log("Buscando dados frescos da Pinnacle...");
    const events = await Promise.race([
      server.fetchPinnacleEvents(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 45000))
    ]);
    if (events.length) {
      pinData = events;
      server.ensureDataDir();
      require("fs").writeFileSync(server.PINNACLE_FILE, JSON.stringify(pinData, null, 2));
      console.log(`  ${pinData.length} eventos da Pinnacle (fresco)`);
    }
  } catch (e) {
    console.log("  Pinnacle fetch error:", e.message);
    try {
      pinData = require("./data/pinnacle-odds.json");
      if (Array.isArray(pinData) && pinData.length) console.log(`  ${pinData.length} eventos (cache)`);
    } catch {}
  }
  if (Array.isArray(pinData) && pinData.length) {
    console.log(`Enviando Pinnacle (${pinData.length} eventos)...`);
    const push = await fetch(`${RENDER_URL}/api/ingest-pinnacle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pinData)
    });
    const result = await push.json();
    console.log("  Pinnacle:", JSON.stringify(result));
  } else {
    console.log("  Pinnacle: 0 eventos (pulado)");
  }

  // Fetch fresh BetEsporte data
  let beData;
  try {
    const server = require("./server.js");
    console.log("Buscando dados frescos da BetEsporte...");
    const events = await Promise.race([
      server.fetchBetEsporteEvents(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 25000))
    ]);
    if (events.length) {
      beData = events;
      require("fs").writeFileSync(server.BETESPORTE_FILE, JSON.stringify(beData, null, 2));
      console.log(`  ${beData.length} eventos da BetEsporte (fresco)`);
    }
  } catch (e) {
    console.log("  BetEsporte fetch error:", e.message);
    try {
      beData = require("./data/betesporte-odds.json");
      if (Array.isArray(beData) && beData.length) console.log(`  ${beData.length} eventos (cache)`);
    } catch {}
  }
  if (Array.isArray(beData) && beData.length) {
    console.log(`Enviando BetEsporte (${beData.length} eventos)...`);
    const push = await fetch(`${RENDER_URL}/api/ingest-betesporte`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(beData)
    });
    const result = await push.json();
    console.log("  BetEsporte:", JSON.stringify(result));
  } else {
    console.log("  BetEsporte: 0 eventos (pulado)");
  }
}

main().catch(e => console.error("Erro:", e.message));
