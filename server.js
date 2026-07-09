const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
let runScraper, getScrapedData;
try {
  const scraper = require("./oddsagora-scraper");
  runScraper = scraper.runScraper;
  getScrapedData = scraper.getScrapedData;
} catch (e) {
  console.error("Aviso: scraper nao disponivel (puppeteer nao instalado):", e.message);
  runScraper = async () => ({ positiveSurebets: 0, totalOpportunities: 0, errors: ["Scraper nao disponivel"] });
  getScrapedData = () => ({ odds: [], timestamp: null });
}

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const IMPORT_FILE = path.join(DATA_DIR, "imported-odds.json");
const PINNACLE_FILE = path.join(DATA_DIR, "pinnacle-odds.json");
const BETESPORTE_FILE = path.join(DATA_DIR, "betesporte-odds.json");
const SAMPLE_FILE = path.join(DATA_DIR, "sample-odds.json");
const ODDSAGORA_SUREBETS_URL = "https://www.oddsagora.com.br/surebets-ajax/";
const ODDSAGORA_PAGE_URL = "https://www.oddsagora.com.br/sure-bets/";
const ODDSAGORA_AES_PASSPHRASE = "J*8sQ!p$7aD_fR2yW@gHn*3bVp#sAdLd_k";
const ODDSAGORA_AES_SALT = "5b9a8f2c3e6d1a4b7c8e9d0f1a2b3c4d";
const PINNACLE_API_BASE = "https://guest.api.arcadia.pinnacle.com/0.1";
const PINNACLE_SPORT_NAMES = {
  29: "Futebol", 3: "Baseball", 4: "Basketball", 33: "Tennis",
  15: "Football Americano", 22: "MMA", 34: "Volei", 18: "Handebol", 19: "Hockey"
};
const PINNACLE_UNITS = {
  29: "gols", 3: "corridas", 4: "pontos", 33: "games",
  15: "pontos", 22: "assaltos", 34: "pontos", 18: "gols", 19: "gols"
};
const PINNACLE_SPORT_SLUGS = {
  29: "soccer", 3: "baseball", 4: "basketball", 33: "tennis",
  15: "american-football", 22: "mma", 34: "volleyball", 18: "handball", 19: "ice-hockey"
};
const BAD_PINNACLE_NAMES = new Set(["over", "under", "odd", "even", "yes", "no", ""]);

const BETESPORTE_SPORT_NAMES = {
  1: "Futebol", 2: "Basquete", 3: "Baseball", 5: "Tenis",
  23: "Volei", 29: "Futsal", 16: "Futebol Americano", 20: "Tenis de Mesa",
  4: "Hockey", 10: "Boxe", 12: "Rugby", 22: "Dardos",
  21: "Cricket", 117: "MMA", 40: "Formula 1"
};

let cache = {
  source: "sample",
  updatedAt: null,
  rows: [],
  pinnacle: [],
  pinnacleMatched: 0,
  betesporte: [],
  betesporteMatched: 0,
  scraped: null
};

let autoRefreshTimer = null;
let autoRefreshCounter = 0;
const AUTO_REFRESH_INTERVAL_MS = 60000;
const SCRAPER_INTERVAL_CYCLES = 10; // Run scraper every 10 cycles (10 min)

async function autoRefresh() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const rows = await fetchOddsAgoraSurebets(controller.signal);
    clearTimeout(timeout);
    if (rows.length) {
      cache._rows = rows;
      writeJson(IMPORT_FILE, rows);
      cache.source = "oddsagora";
      // Auto-push to Render
      const renderUrl = process.env.RENDER_PUSH_URL || "";
      if (renderUrl) {
        fetch(`${renderUrl}/api/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rows)
        }).then(r => r.json()).then(r => console.error("  push render:", r.ok)).catch(e => console.error("  push render error:", e.message));
      }
    }
  } catch (e) {
    console.error("  OA error:", e?.message || e);
  }

  try {
    const events = await Promise.race([
      fetchPinnacleEvents(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 45000))
    ]);
    if (events.length) {
      writeJson(PINNACLE_FILE, events);
    }
  } catch (e) {
    console.error("  Pinnacle error:", e?.message || e);
  }

  try {
    const events = await Promise.race([
      fetchBetEsporteEvents(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000))
    ]);
    if (events.length) {
      writeJson(BETESPORTE_FILE, events);
    }
  } catch (e) {
    console.error("  BetEsporte error:", e?.message || e);
  }

  // Run scraper every N cycles
  autoRefreshCounter++;
  if (autoRefreshCounter % SCRAPER_INTERVAL_CYCLES === 0) {
    runScraper().catch(e => console.error("  Scraper error:", e?.message || e));
  }

  loadCurrentRows();
  cache.scraped = getScrapedData();
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(autoRefresh, AUTO_REFRESH_INTERVAL_MS);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function normalizeOdd(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(numeric) && numeric > 1 ? numeric : null;
}

function calculateSurebet(outcomes, totalStake = 1000) {
  const clean = outcomes
    .map((outcome) => ({ ...outcome, odd: normalizeOdd(outcome.odd) }))
    .filter((outcome) => outcome.odd);

  if (clean.length < 2) return null;

  const implied = clean.reduce((sum, outcome) => sum + 1 / outcome.odd, 0);
  const profitPercent = (1 / implied - 1) * 100;
  const payout = totalStake / implied;
  const stakes = clean.map((outcome) => {
    const stake = payout / outcome.odd;
    return {
      ...outcome,
      stake: round(stake),
      returnAmount: round(stake * outcome.odd)
    };
  });

  return {
    impliedProbability: round(implied * 100, 4),
    profitPercent: round(profitPercent, 2),
    guaranteedReturn: round(payout),
    guaranteedProfit: round(payout - totalStake),
    stakes
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizeEvent(input, index = 0) {
  const outcomes = Array.isArray(input.outcomes) ? input.outcomes : [];
  const calculation = calculateSurebet(outcomes, input.totalStake || 1000);
  const bestOdd = outcomes.reduce((max, item) => Math.max(max, normalizeOdd(item.odd) || 0), 0);

  return {
    id: input.id || crypto.createHash("sha1").update(JSON.stringify(input) + index).digest("hex").slice(0, 10),
    sport: input.sport || "Futebol",
    league: input.league || input.tournament || "Mercado importado",
    country: input.country || "Brasil",
    event: input.event || input.name || `${input.home || "Casa"} x ${input.away || "Visitante"}`,
    market: input.market || input.bettingType || "Resultado",
    rawMarket: input.rawMarket || "",
    startsAt: input.startsAt || input.date || null,
    url: input.url || "",
    bestOdd,
    outcomes,
    surebet: calculation,
    isSurebet: Boolean(calculation && calculation.profitPercent > 0),
    risk: input.risk || `Verifique odds em ${input.sport || "esporte"} - ${input.market || "mercado"}`
  };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function rowsFromFlatCsv(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.eventId || row.event || row.name || `${row.sport}-${row.league}-${row.market}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: row.eventId || key,
        sport: row.sport,
        league: row.league,
        country: row.country,
        event: row.event || row.name,
        market: row.market,
        startsAt: row.startsAt || row.date,
        url: row.url,
        outcomes: []
      });
    }
    grouped.get(key).outcomes.push({
      name: row.outcome || row.selection || row.side,
      bookmaker: row.bookmaker || row.casa,
      odd: row.odd || row.odds || row.price,
      url: row.bookmakerUrl || row.betUrl
    });
  }
  return Array.from(grouped.values());
}

const TYPE_WORDS = ["gol", "ponto", "escanteio", "cartao", "falta", "impedimento", "lance livre", "cesta", "rebote", "assistencia", "erro", "saque", "ace", "dupla falta"];
const SPORT_UNITS = {
  "futebol": "gols", "baseball": "corridas", "basquete": "pontos", "basketball": "pontos",
  "tenis": "games", "tennis": "games", "football americano": "pontos", "mma": "assaltos",
  "volei": "pontos", "handebol": "gols", "hockey": "gols"
};
// Match corrupted/normalized sport name substrings to units
const SPORT_FUZZY = [
  ["nis", "games"],    // TǦnis -> games
  ["lei", "pontos"],   // Vǚlei -> pontos
  ["quei", "gols"],    // Hǚquei -> gols
  ["futeb", "gols"],   // Futebol
  ["hande", "gols"],   // Handebol
  ["baseb", "corridas"], // Baseball
  ["basket", "pontos"], // Basketball
  ["basqu", "pontos"],  // Basquete
  ["footb", "pontos"], // Football Americano
  ["mma", "assaltos"], // MMA
];

function extractMarketType(raw, sportRaw) {
  const name = (raw || "").toLowerCase();
  for (const w of TYPE_WORDS) {
    if (name.includes(w)) {
      const plural = w.endsWith("ao") ? w.replace(/ao$/, "oes") : w.endsWith("a") ? w + "s" : w + "s";
      const singular = w.endsWith("s") ? w.slice(0, -1) : w;
      if (name.includes(w + "s") || name.includes(w + " ")) return plural;
      if (name.includes(w)) return name.includes(w + "s") ? plural : singular;
    }
  }
  if (name.includes("goal")) return "gols";
  if (name.includes("point")) return "pontos";
  if (name.includes("corner")) return "escanteios";
  if (name.includes("card")) return "cartoes";
  if (name.includes("foul")) return "faltas";
  const rawName = (sportRaw || "").toLowerCase();
  for (const [key, unit] of Object.entries(SPORT_UNITS)) {
    if (rawName.includes(key)) return unit;
  }
  for (const [sub, unit] of SPORT_FUZZY) {
    if (rawName.includes(sub)) return unit;
  }
  return "";
}

function simplifyMarketName(raw, sport) {
  const name = (raw || "").toLowerCase();
  const num = name.match(/(\d+[.,]?\d*)/);
  const suffix = num ? ` ${num[1]}` : "";
  const type = extractMarketType(raw, sport);
  const typeSuffix = type ? ` ${type}` : "";

  // Detect period-specific markets (1st half, 2nd half, 1st set, etc.)
  let periodPrefix = "";
  if (/primeiro tempo|first half|1[o°º]?\s*tempo|^1t[^a-z]/i.test(name)) periodPrefix = "1o Tempo - ";
  else if (/segundo tempo|second half|2[o°º]?\s*tempo|^2t/i.test(name)) periodPrefix = "2o Tempo - ";
  else if (/primeiro set|1[o°º]?\s*set|1st set/i.test(name)) periodPrefix = "1o Set - ";
  else if (/segundo set|2[o°º]?\s*set|2nd set/i.test(name)) periodPrefix = "2o Set - ";
  else if (/primeiro periodo|first period|1[o°º]?\s*periodo/i.test(name)) periodPrefix = "1o Periodo - ";
  else if (/segundo periodo|second period|2[o°º]?\s*periodo/i.test(name)) periodPrefix = "2o Periodo - ";
  else if (/partida completa|full (time|match)|jogo todo/.test(name) || (!periodPrefix && !/tempo|set|periodo|half/.test(name))) {
    periodPrefix = "";
  }

  if (name.includes("h/a") || name.includes("casa/fora") || name.includes("moneyline") || name.includes("vencedor")) {
    if (name.includes("h/a")) return `${periodPrefix}Casa/Fora`;
    return `${periodPrefix}Vencedor`;
  }
  if (name.includes("o/u") || name.includes("mais/menos") || name.includes("over/under"))
    return `${periodPrefix}Acima/Abaixo${suffix}${typeSuffix}`;
  if (name.includes("1x2")) return `${periodPrefix}1X2`;
  if (name.includes("ambas")) return `${periodPrefix}Ambas Marcam`;
  if (name.includes("handicap")) return `${periodPrefix}Handicap${suffix}${typeSuffix}`;
  return raw || "Mercado";
}

function deriveOutcomeNames(bettingTypeId, bettingTypeName, homeName, awayName, outcomeCount, sport) {
  const name = (bettingTypeName || "").toLowerCase();
  const num = name.match(/(\d+[.,]?\d*)/);
  const val = num ? num[1] : "";
  const type = extractMarketType(bettingTypeName, sport);
  const typeSuffix = type ? ` ${type}` : "";
  if (outcomeCount === 2) {
    if (name.includes("o/u") || name.includes("mais/menos") || name.includes("over/under"))
      return val ? [`Mais ${val}${typeSuffix}`, `Menos ${val}${typeSuffix}`] : ["Mais", "Menos"];
    if (name.includes("ambas") || name.includes("both")) return ["Sim", "Nao"];
    if (name.includes("h/a") || name.includes("1x2") || name.includes("vencedor") || name.includes("moneyline")) {
      return [homeName || "Casa", awayName || "Fora"];
    }
    return [homeName || "Resultado 1", awayName || "Resultado 2"];
  }
  if (outcomeCount === 3) {
    return [homeName || "Casa", "Empate", awayName || "Fora"];
  }
  return Array.from({ length: outcomeCount }, (_, i) => `Selecao ${i + 1}`);
}

const PINNACLE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
  "Referer": "https://www.pinnacle.com/en/soccer/"
};

function americanToDecimal(american) {
  if (american > 0) return Math.round((american / 100 + 1) * 100) / 100;
  return Math.round((100 / Math.abs(american) + 1) * 100) / 100;
}

function normalizeTeam(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s\/.-]/g, "").trim();
}

function extractLastNames(name) {
  return String(name || "").toLowerCase().split(/[\s\/.]+/).filter(s => s.length > 1 && !["the", "de", "do", "da", "dos", "das", "el", "la", "los", "las"].includes(s));
}

function teamsMatch(a1, a2, b1, b2) {
  const na1 = normalizeTeam(a1), na2 = normalizeTeam(a2);
  const nb1 = normalizeTeam(b1), nb2 = normalizeTeam(b2);
  if ((na1 === nb1 && na2 === nb2) || (na1 === nb2 && na2 === nb1)) return true;

  const a1parts = extractLastNames(a1), a2parts = extractLastNames(a2);
  const b1parts = extractLastNames(b1), b2parts = extractLastNames(b2);
  const aNames = new Set([...a1parts, ...a2parts]);
  const bNames = new Set([...b1parts, ...b2parts]);
  let matches = 0;
  aNames.forEach(n => { if (bNames.has(n)) matches++; });
  const minRequired = Math.min(aNames.size, bNames.size);
  return matches >= Math.max(2, minRequired - 1);
}

function extractTeams(eventName) {
  const name = String(eventName || "");
  const separators = [" vs ", " x ", "  -  ", " - ", "  x  "];
  for (const sep of separators) {
    const idx = name.indexOf(sep);
    if (idx > 0) {
      const t1 = name.slice(0, idx).trim(), t2 = name.slice(idx + sep.length).trim();
      if (t1 && t2 && t1.length > 1 && t2.length > 1) return [t1, t2];
    }
  }
  return [name, ""];
}

async function fetchPinnacleEvents() {
  const sportIds = [29, 3, 4, 33, 15, 22, 34, 18, 19];
  const allEvents = [];

  for (const sid of sportIds) {
    try {
      const [matchupsResp, leaguesResp] = await Promise.all([
        fetch(`${PINNACLE_API_BASE}/sports/${sid}/matchups`, { headers: PINNACLE_HEADERS }),
        fetch(`${PINNACLE_API_BASE}/sports/${sid}/leagues?all=false`, { headers: PINNACLE_HEADERS })
      ]);
      if (!matchupsResp.ok) continue;
      const matchups = await matchupsResp.json();
      if (!Array.isArray(matchups) || matchups.length === 0) continue;

      // Try highlighted markets first (fast path, works for some sports)
      let allMarkets = [];
      const marketsResp = await fetch(`${PINNACLE_API_BASE}/sports/${sid}/markets/highlighted/straight`, { headers: PINNACLE_HEADERS });
      const mktCt = (marketsResp.headers.get("content-type") || "").toLowerCase();
      if (marketsResp.ok && mktCt.includes("json")) {
        const m = await marketsResp.json();
        if (Array.isArray(m)) allMarkets = m;
      }

      // If highlighted returned nothing, fetch per-league markets (works for all sports)
      if (allMarkets.length === 0) {
        try {
          const leagues = await leaguesResp.json();
          if (Array.isArray(leagues)) {
            for (const league of leagues) {
              const lId = league.id || league;
              await new Promise(r => setTimeout(r, 150));
              const lResp = await fetch(`${PINNACLE_API_BASE}/leagues/${lId}/markets/straight`, { headers: PINNACLE_HEADERS });
              if (lResp.ok) {
                const ct = (lResp.headers.get("content-type") || "").toLowerCase();
                if (ct.includes("json")) {
                  const d = await lResp.json();
                  if (Array.isArray(d)) allMarkets.push(...d);
                }
              }
            }
          }
        } catch {}
      }

      if (allMarkets.length > 0) {
        processPinnacleSport(sid, matchups, {}, allMarkets, allEvents);
      }
    } catch {}
  }

  return allEvents;
}

function extractTeamsFromMatchup(mu, hl) {
  let home, away;
  if (hl) {
    home = hl.participants?.find(p => p.alignment === "home")?.name;
    away = hl.participants?.find(p => p.alignment === "away")?.name;
  }
  if (!home || !away) {
    home = mu.participants?.find(p => p.alignment === "home")?.name;
    away = mu.participants?.find(p => p.alignment === "away")?.name;
  }
  if (!home || !away) {
    const participants = (mu.participants || []).filter(p => p.alignment === "neutral");
    const teamMap = {};
    participants.forEach(p => {
      const lower = (p.name || "").toLowerCase().trim();
      if (!BAD_PINNACLE_NAMES.has(lower) && !/^\d+$/.test(lower) && !/^\d+\s*-\s*\d+/.test(lower) && !lower.includes(",") && lower.length > 0) {
        teamMap[lower] = p.name;
      }
    });
    const uniqueNames = Object.values(teamMap);
    if (uniqueNames.length >= 2) { home = uniqueNames[0]; away = uniqueNames[1]; }
  }
  return home && away && home.toLowerCase() !== away.toLowerCase() ? { home, away } : null;
}

function processMarketOutcomes(mu, market, home, away, sid) {
  const isMoneyline = market.type === "moneyline";
  const isSpread = market.type === "spread";
  const isTotal = market.type === "total";
  const unit = PINNACLE_UNITS[sid] || "";

  return market.prices.map(p => {
    let name;
    if (isMoneyline) {
      name = p.designation === "home" ? home : p.designation === "away" ? away : p.designation === "draw" ? "Empate" : (p.designation || "Selecao");
    } else if (isSpread) {
      const hcp = p.handicap || 0;
      name = p.designation === "home" ? `${home} ${hcp > 0 ? "+" : ""}${hcp}` : `${away} ${hcp > 0 ? "+" : ""}${hcp}`;
      if (unit) name += ` ${unit}`;
    } else if (isTotal) {
      const pts = p.points || 0;
      name = p.designation === "over" ? `Acima ${pts}` : `Abaixo ${pts}`;
      if (unit) name += ` ${unit}`;
    } else {
      name = p.designation || "Selecao";
    }
    return { name, odd: americanToDecimal(p.price), marketType: market.type, marketLabel: market.type };
  });
}

function processPinnacleSport(sid, matchups, hlMap, markets, allEvents) {
  const matchupLookup = {};
  matchups.forEach(m => { matchupLookup[m.id] = m; });

  // Grab all full-game straight markets, not just moneyline
  const straightMarkets = markets.filter(m => m.period === 0 && ["moneyline", "spread", "total"].includes(m.type));
  const processedIds = new Set();

  for (const ml of straightMarkets) {
    const mu = matchupLookup[ml.matchupId];
    if (!mu || processedIds.has(mu.id)) continue;
    processedIds.add(mu.id);

    const teams = extractTeamsFromMatchup(mu, hlMap[mu.id]);
    if (!teams) continue;

    // Collect all market types for this matchup
    const matchupMarkets = straightMarkets.filter(m => m.matchupId === mu.id);
    const allOutcomes = [];
    for (const mkt of matchupMarkets) {
      allOutcomes.push(...processMarketOutcomes(mu, mkt, teams.home, teams.away, sid));
    }

    // Determine market label from outcome types
    const marketTypes = [...new Set(allOutcomes.map(o => o.marketType))];
    const marketLabels = marketTypes.map(t => {
      if (t === "moneyline") return "Vencedor";
      if (t === "spread") return "Handicap";
      if (t === "total") return "Acima/Abaixo";
      return t;
    });

    const slug = PINNACLE_SPORT_SLUGS[sid] || "soccer";
    allEvents.push({
      pinnacleId: mu.id,
      home: teams.home,
      away: teams.away,
      league: mu.league?.name || "",
      sport: PINNACLE_SPORT_NAMES[sid] || "Esporte",
      startTime: mu.startTime,
      market: marketLabels.join(" + "),
      url: `https://www.pinnacle.com/en/${slug}/event/${mu.id}`,
      outcomes: allOutcomes
    });
  }
}

const BETESPORTE_API = "https://betesporte.bet.br/api";

async function fetchBetEsporteEvents() {
  const allEvents = [];
  const sportIds = [1, 2, 3, 5, 23, 29, 16, 20, 4, 10, 12, 22, 21, 117, 40];
  const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" };

  for (const sid of sportIds) {
    try {
      const resp = await fetch(`${BETESPORTE_API}/PreMatch/GetEvents?sportId=${sid}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const countries = data?.data?.countries || [];
      for (const country of countries) {
        for (const tournament of (country.tournaments || [])) {
          const tname = tournament.name || "";
          for (const ev of (tournament.events || [])) {
            const homeName = ev.homeTeamName || "";
            const awayName = ev.awayTeamName || "";
            if (!homeName || !awayName) continue;
            const startRaw = ev.date || 0;
            let startTime;
            if (typeof startRaw === "string") {
              startTime = new Date(startRaw.replace("Z", "+00:00")).getTime();
            } else {
              startTime = Number(startRaw) * 1000;
            }
            const markets = ev.markets || [];
            const outcomes = [];
            for (const mkt of markets) {
              const typeId = mkt.type;
              for (const opt of (mkt.options || [])) {
                const odd = Number(opt.odd);
                if (odd <= 1) continue;
                let name = opt.name || "";
                outcomes.push({ name, odd, typeId, sportId: sid, home: homeName, away: awayName });
              }
            }
            if (outcomes.length < 2) continue;
            const evId = ev.id || "";
            const tourId = tournament.id || "";
            const evUrl = tourId
              ? `https://betesporte.bet.br/sports/desktop/pre-match-detail/${sid}/${tourId}/${evId}`
              : `https://betesporte.bet.br/sports/desktop/sport-event/${sid}/${evId}`;
            allEvents.push({
              home: homeName,
              away: awayName,
              league: tname,
              sport: BETESPORTE_SPORT_NAMES[sid] || "Esporte",
              startTime: startTime ? new Date(startTime).toISOString() : null,
              market: "Multi",
              url: evUrl,
              outcomes
            });
          }
        }
      }
    } catch {}
  }
  // Remove duplicates
  const seen = new Set();
  return allEvents.filter(e => {
    const key = normalizeTeam(e.home) + "|" + normalizeTeam(e.away) + "|" + (e.league || "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function crossReferenceBetEsporte(oddsagoraRows, betesporteEvents) {
  let matched = 0;
  const enhanced = oddsagoraRows.map(row => {
    const [team1, team2] = extractTeams(row.event || "");
    const rowHome = normalizeTeam(team1);
    const rowAway = normalizeTeam(team2);
    if (!rowHome) return row;

    const match = betesporteEvents.find(be => {
      const beHome = normalizeTeam(be.home);
      const beAway = normalizeTeam(be.away);
      if (!teamsMatch(rowHome, rowAway, beHome, beAway)) return false;
      if (row.league && be.league) {
        const normLeague = normalizeTeam(row.league);
        const beLeague = normalizeTeam(be.league);
        const rowWords = new Set(normLeague.split(/\s+/).filter(w => w.length > 2));
        const beWords = new Set(beLeague.split(/\s+/).filter(w => w.length > 2));
        let overlap = 0;
        rowWords.forEach(w => { if (beWords.has(w)) overlap++; });
        if (overlap === 0 && rowWords.size > 0 && beWords.size > 0) return false;
      }
      return true;
    });

    if (!match) return row;

    const betOutcomes = (match.outcomes || []).filter(o => Number(o.odd) > 1);

    if (betOutcomes.length === 0) return row;

    matched++;

    const beFormatted = betOutcomes.map(o => ({
      name: o.name, bookmaker: "BetEsporte", odd: o.odd, url: match.url || "", betesporte: true
    }));
    const mergedOutcomes = mergeBestOutcomes(row.outcomes || [], beFormatted, team1, team2);

    const totalStake = row.surebet?.stakes?.reduce((s, st) => s + (st.stake || 0), 0) || 1000;
    const recalc = calculateSurebet(mergedOutcomes, totalStake);

    return {
      ...row,
      outcomes: mergedOutcomes,
      surebet: recalc,
      isSurebet: Boolean(recalc && recalc.profitPercent > 0),
      betesporteMatch: true,
      betesporteEvent: match
    };
  });

  return { rows: enhanced, matched };
}

function marketTypeMatch(oddsagoraMarket, pinnacleMarketType) {
  const m = String(oddsagoraMarket || "").toLowerCase();
  if (m.includes("1x2") || m.includes("casa/fora") || m.includes("vencedor")) return pinnacleMarketType === "moneyline";
  if (m.includes("handicap") || m.includes("spread")) return pinnacleMarketType === "spread";
  if (m.includes("acima") || m.includes("abaixo") || m.includes("total") || m.includes("over") || m.includes("under")) return pinnacleMarketType === "total";
  return true;
}

function classifyOutcomeSlot(outcomeName, homeTeam, awayTeam) {
  const name = normalizeTeam(outcomeName || "");
  const ht = normalizeTeam(homeTeam || "");
  const at = normalizeTeam(awayTeam || "");
  if (name === "empate" || name === "draw" || name === "x" || name === "nul") return "draw";
  if (/^(over|acima|mais)/.test(name)) return "over";
  if (/^(under|abaixo|menos)/.test(name)) return "under";
  if (name === "sim" || name === "yes") return "yes";
  if (name === "nao" || name === "no") return "no";
  if (name === "casa" || name === "home" || name === "1") return "home";
  if (name === "fora" || name === "away" || name === "2") return "away";
  if (ht && name === ht) return "home";
  if (at && name === at) return "away";
  if (ht && at) {
    const nw = new Set(name.split(/\s+/).filter(w => w.length > 2));
    const hw = new Set(ht.split(/\s+/).filter(w => w.length > 2));
    const aw = new Set(at.split(/\s+/).filter(w => w.length > 2));
    let hm = 0, am = 0;
    nw.forEach(w => {
      if ([...hw].some(h => h.includes(w) || w.includes(h))) hm++;
      if ([...aw].some(a => a.includes(w) || w.includes(a))) am++;
    });
    if (hm > am && hm >= Math.min(nw.size, hw.size) / 2) return "home";
    if (am > hm && am >= Math.min(nw.size, aw.size) / 2) return "away";
  }
  return null;
}

function extractLineValue(name) {
  const m = String(name || "").match(/(\d+[.,]?\d*)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function slotKey(outcome, homeTeam, awayTeam) {
  const s = classifyOutcomeSlot(outcome.name, homeTeam, awayTeam);
  if (!s) return null;
  if (s === "over" || s === "under") {
    const line = extractLineValue(outcome.name);
    return line != null ? `${s}:${line}` : s;
  }
  return s;
}

function mergeBestOutcomes(primaryOutcomes, secondaryOutcomes, homeTeam, awayTeam) {
  const primarySlots = new Set();
  for (const o of primaryOutcomes) {
    const sk = slotKey(o, homeTeam, awayTeam);
    if (sk) primarySlots.add(sk);
  }
  if (primarySlots.size === 0) return primaryOutcomes;

  const slots = {};
  for (const o of primaryOutcomes) {
    const sk = slotKey(o, homeTeam, awayTeam);
    if (sk && (!slots[sk] || Number(o.odd) > Number(slots[sk].odd))) slots[sk] = o;
  }
  for (const o of secondaryOutcomes) {
    const sk = slotKey(o, homeTeam, awayTeam);
    if (sk && primarySlots.has(sk) && (!slots[sk] || Number(o.odd) > Number(slots[sk].odd))) {
      slots[sk] = o;
    }
  }

  const order = ["home", "draw", "away", "yes", "no"];
  const result = [];
  for (const key of order) {
    if (slots[key]) result.push(slots[key]);
  }
  for (const key of Object.keys(slots).sort()) {
    if (!order.includes(key)) result.push(slots[key]);
  }
  return result.length >= 2 ? result : primaryOutcomes;
}

function crossReferencePinnacle(oddsagoraRows, pinnacleEvents) {
  let matched = 0;
  const enhanced = oddsagoraRows.map(row => {
    const [team1, team2] = extractTeams(row.event || "");
    const rowHome = normalizeTeam(team1);
    const rowAway = normalizeTeam(team2);
    if (!rowHome) return row;

    const match = pinnacleEvents.find(pe => {
      const peHome = normalizeTeam(pe.home);
      const peAway = normalizeTeam(pe.away);
      if (!teamsMatch(rowHome, rowAway, peHome, peAway)) return false;
      if (row.league && pe.league) {
        const normLeague = normalizeTeam(row.league);
        const peLeague = normalizeTeam(pe.league);
        const rowWords = new Set(normLeague.split(/\s+/).filter(w => w.length > 2));
        const peWords = new Set(peLeague.split(/\s+/).filter(w => w.length > 2));
        let overlap = 0;
        rowWords.forEach(w => { if (peWords.has(w)) overlap++; });
        if (overlap === 0 && rowWords.size > 0 && peWords.size > 0) return false;
      }
      return true;
    });

    if (!match) return row;

    const pinnacleOutcomes = match.outcomes.filter(o => marketTypeMatch(row.market, o.marketType));

    if (pinnacleOutcomes.length === 0) return row;

    matched++;

    const pinFormatted = pinnacleOutcomes.map(o => ({
      name: o.name, bookmaker: "Pinnacle", odd: o.odd, url: match.url || "", pinnacle: true, marketType: o.marketType
    }));
    const mergedOutcomes = mergeBestOutcomes(row.outcomes || [], pinFormatted, team1, team2);

    const totalStake = row.surebet?.stakes?.reduce((s, st) => s + (st.stake || 0), 0) || 1000;
    const recalc = calculateSurebet(mergedOutcomes, totalStake);

    return {
      ...row,
      outcomes: mergedOutcomes,
      surebet: recalc,
      isSurebet: Boolean(recalc && recalc.profitPercent > 0),
      pinnacleMatch: true,
      pinnacleEvent: match
    };
  });

  return { rows: enhanced, matched };
}

function decryptOddsAgoraResponse(encryptedBase64) {
  const decoded = Buffer.from(encryptedBase64, "base64").toString("utf8");
  const [encB64, ivHex] = decoded.split(":");
  if (!encB64 || !ivHex) throw new Error("Formato de resposta invalido");

  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encB64, "base64");

  const key = crypto.pbkdf2Sync(ODDSAGORA_AES_PASSPHRASE, Buffer.from(ODDSAGORA_AES_SALT, "utf8"), 1000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  if (decrypted[0] === 0x1f && decrypted[1] === 0x8b) {
    const decompressed = zlib.gunzipSync(decrypted);
    return JSON.parse(decompressed.toString("utf8"));
  }

  return JSON.parse(decrypted.toString("utf8"));
}

const OA_PROXIES = [
  { name: "direct", url: (u) => u },
  { name: "allorigins", url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: "codetabs", url: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` }
];

async function fetchOddsAgoraSurebets(signal) {
  const pageResp = await fetch(ODDSAGORA_PAGE_URL, { signal,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"
    }
  });
  const setCookie = pageResp.headers.get("set-cookie") || "";
  const cookieParts = setCookie.split(",").map(s => s.split(";")[0].trim()).filter(Boolean).join("; ");

  const headers = {
    "Accept": "*/*",
    "Referer": ODDSAGORA_PAGE_URL,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    ...(cookieParts ? { "Cookie": cookieParts } : {})
  };

  let lastError;
  for (const proxy of OA_PROXIES) {
    const url = proxy.url(ODDSAGORA_SUREBETS_URL);
    try {
      const response = await fetch(url, { signal, headers });
      if (!response.ok) { lastError = new Error(`${proxy.name}: HTTP ${response.status}`); continue; }
      const text = await response.text();
      if (!text || text.length < 20) { lastError = new Error(`${proxy.name}: curta (${text.length})`); continue; }
      const parsed = decryptOddsAgoraResponse(text);
      const rows = normalizeOddsAgoraPayload(parsed);
      if (rows.length) {
        console.error(`  OA ok via ${proxy.name}: ${rows.length} rows`);
        return rows;
      }
      lastError = new Error(`${proxy.name}: 0 rows (${text.length} chars)`);
    } catch (e) {
      lastError = new Error(`${proxy.name}: ${e.message}`);
    }
  }
  throw lastError || new Error("Todas as tentativas OA falharam");
}

const BOOKMAKER_DIRECT_LINKS = {
  "bet365": "https://www.bet365.bet.br/#/IP/B1",
  "betfair": "https://www.betfair.bet.br/apostas/",
  "1xbet": "https://1xbet.bet.br/en/lobby",
  "betano": "https://www.betano.bet.br/",
  "betboom": "https://betboom.bet.br/sport",
  "betnacional": "https://betnacional.bet.br/",
  "br4bet": "https://br4.bet.br/sports",
  "esportiva": "https://esportiva.bet.br/sports",
  "estrelabet": "https://www.estrelabet.bet.br/aposta-esportiva",
  "goldebet": "https://goldebet.bet.br/sports",
  "lotogreen": "https://lotogreen.bet.br/sports",
  "seguro": "https://www.seguro.bet.br/esportes/match/Soccer/World/2969/30217890",
  "betdasorte": "https://www.betdasorte.bet.br/sports",
  "brasil": "https://www.brasil.bet.br/sportsbook/",
  "f12": "https://f12.bet.br/sports",
  "jogodeouro": "https://jogodeouro.bet.br/pt/sports",
  "kto": "https://www.kto.bet.br/esportes",
  "luva": "https://luva.bet.br/sportsbook",
  "multi": "https://multi.bet.br/pb/sports#/overview",
  "superbet": "https://superbet.bet.br/"
};

function getBookmakerDirectUrl(bookmakerName) {
  const key = bookmakerName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [pattern, url] of Object.entries(BOOKMAKER_DIRECT_LINKS)) {
    if (key.includes(pattern)) return url;
  }
  return null;
}

function normalizeOddsAgoraPayload(payload) {
  const rows = payload?.d?.data || [];
  if (!Array.isArray(rows)) return [];

  return rows.map((row, index) => {
    const booksObj = row["bookmakers-logos-urls"] || {};
    const books = Object.values(booksObj);
    const homeName = row["home-name"] || "";
    const awayName = row["away-name"] || "";
    const sportName = row["sport-name"] || "Esporte";
    const outcomeNames = deriveOutcomeNames(
      row.BettingTypeID,
      row.bettingtypename,
      homeName,
      awayName,
      books.length,
      sportName
    );

    return normalizeEvent({
      id: String(row.EventID || row.id || index),
      sport: sportName,
      league: row["tournament-name"] || "",
      country: row["country-name"] || "",
      event: row.name || `${homeName} x ${awayName}`,
      market: simplifyMarketName(row.bettingtypename, sportName) || "Mercado",
      rawMarket: row["bettingtypename"] || "",
      startsAt: row.DateStart ? new Date(row.DateStart * 1000).toISOString() : null,
      url: row.url ? `https://www.oddsagora.com.br${row.url}` : "",
      outcomes: books.map((book, bookIndex) => ({
        name: outcomeNames[bookIndex] || `Selecao ${bookIndex + 1}`,
        bookmaker: book.name || "Casa",
        odd: book.coeficient,
        url: getBookmakerDirectUrl(book.name) || (book.url ? `https://www.oddsagora.com.br${book.url}` : "")
      }))
    }, index);
  });
}

function crossReferencePinnacleBetEsporte(pinnacleEvents, betesporteEvents) {
  const comparisons = [];
  let matched = 0;

  for (const be of betesporteEvents) {
    const beHome = normalizeTeam(be.home);
    const beAway = normalizeTeam(be.away);
    if (!beHome) continue;

    const match = pinnacleEvents.find(pe => {
      const peHome = normalizeTeam(pe.home);
      const peAway = normalizeTeam(pe.away);
      if (!teamsMatch(beHome, beAway, peHome, peAway)) return false;
      if (be.league && pe.league) {
        const beLeague = normalizeTeam(be.league);
        const peLeague = normalizeTeam(pe.league);
        const beWords = new Set(beLeague.split(/\s+/).filter(w => w.length > 2));
        const peWords = new Set(peLeague.split(/\s+/).filter(w => w.length > 2));
        let overlap = 0;
        beWords.forEach(w => { if (peWords.has(w)) overlap++; });
        if (overlap === 0 && beWords.size > 0 && peWords.size > 0) return false;
      }
      return true;
    });

    if (!match) continue;

    const beOutcomes = (be.outcomes || []).filter(o => Number(o.odd) > 1);
    const pinOutcomes = (match.outcomes || []).filter(o => Number(o.odd) > 1);

    // Group by compatible market types: match BetEsporte typeIds to Pinnacle types
    const beMoneylines = beOutcomes.filter(o => o.typeId === 1 || o.typeId === 1601 || o.typeId === 186 || o.typeId === 219 || o.typeId === 251 || o.typeId === 340 || o.typeId === 406);
    const pinMoneylines = pinOutcomes.filter(o => o.marketType === "moneyline" && o.name && o.name !== "Selecao" && o.name !== "");

    if (beMoneylines.length >= 2 && pinMoneylines.length >= 2) {
      const beUrl = be.url || "";
      const pinUrl = match.url || "";
      const beFormatted = beMoneylines.slice(0, Math.min(beMoneylines.length, 3)).map(o => ({
        name: o.name, bookmaker: "BetEsporte", odd: o.odd, url: beUrl, betesporte: true
      }));
      const pinFormatted = pinMoneylines.slice(0, Math.min(pinMoneylines.length, 3)).map(o => ({
        name: o.name, bookmaker: "Pinnacle", odd: o.odd, url: pinUrl, pinnacle: true
      }));
      const combined = mergeBestOutcomes(beFormatted, pinFormatted, be.home, be.away);
      const calc = calculateSurebet(combined, 1000);
      comparisons.push({
        id: "pin-be-" + matched,
        sport: be.sport || match.sport || "Esporte",
        league: be.league || match.league || "",
        country: "Multi",
        event: `${be.home} x ${be.away}`,
        market: "Moneyline",
        startsAt: be.startTime || match.startTime || null,
        url: beUrl || pinUrl,
        bestOdd: Math.max(...combined.map(o => o.odd)),
        outcomes: combined,
        surebet: calc,
        isSurebet: Boolean(calc && calc.profitPercent > 0),
        pinnacleBetEsporte: true
      });
      matched++;
    }
  }

  return { rows: comparisons, matched };
}

function loadCurrentRows() {
  const imported = readJson(IMPORT_FILE, null);
  const hasImport = Array.isArray(imported) && imported.length > 0;
  const base = hasImport ? imported : (cache._rows || []);
  let rows = base.map(normalizeEvent);

  const pinnacleEvents = readJson(PINNACLE_FILE, []);
  let pinnacleMatched = 0;
  if (Array.isArray(pinnacleEvents) && pinnacleEvents.length > 0) {
    const result = crossReferencePinnacle(rows, pinnacleEvents);
    rows = result.rows;
    pinnacleMatched = result.matched;
  }

  const betesporteEvents = readJson(BETESPORTE_FILE, []);
  let betesporteMatched = 0;
  if (Array.isArray(betesporteEvents) && betesporteEvents.length > 0) {
    const result = crossReferenceBetEsporte(rows, betesporteEvents);
    rows = result.rows;
    betesporteMatched = result.matched;
  }

  let pinBeCross = 0;
  if (Array.isArray(pinnacleEvents) && pinnacleEvents.length > 0 && Array.isArray(betesporteEvents) && betesporteEvents.length > 0) {
    const result = crossReferencePinnacleBetEsporte(pinnacleEvents, betesporteEvents);
    rows = [...rows, ...result.rows];
    pinBeCross = result.matched;
  }

  const scrapedData = cache?.scraped || getScrapedData();
  // Merge scraped rows into main rows list
  if (scrapedData && Array.isArray(scrapedData.rows) && scrapedData.rows.length > 0) {
    rows = [...rows, ...scrapedData.rows].sort(
      (a, b) => (b.surebet?.profitPercent || -100) - (a.surebet?.profitPercent || -100)
    );
  }

  cache = {
    source: hasImport ? "import" : "sample",
    updatedAt: new Date().toISOString(),
    rows,
    pinnacle: pinnacleEvents,
    pinnacleMatched,
    betesporte: betesporteEvents,
    betesporteMatched,
    pinBeCross,
    scraped: scrapedData
  };
  return cache;
}

function filterRows(rows, query) {
  let result = rows;
  if (query.sport) result = result.filter((row) => same(row.sport, query.sport));
  if (query.league) result = result.filter((row) => row.league.toLowerCase().includes(query.league.toLowerCase()));
  if (query.market) result = result.filter((row) => row.market.toLowerCase().includes(query.market.toLowerCase()));
  if (query.onlySurebets === "true") result = result.filter((row) => row.isSurebet);
  if (query.minProfit) {
    const minProfit = Number(query.minProfit);
    if (Number.isFinite(minProfit)) result = result.filter((row) => (row.surebet?.profitPercent || 0) >= minProfit);
  }
  return result.sort((a, b) => (b.surebet?.profitPercent || -100) - (a.surebet?.profitPercent || -100));
}

function same(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Acesso negado" });

  fs.readFile(filePath, (err, content) => {
    if (err) return sendJson(res, 404, { error: "Arquivo nao encontrado" });
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(content);
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }

  if (req.method === "GET" && url.pathname === "/api/surebets") {
    const current = cache;
    const rows = filterRows(current.rows, Object.fromEntries(url.searchParams));
    return sendJson(res, 200, {
      ...current,
      count: rows.length,
      rows,
      pinnacleCount: current.pinnacle?.length || 0,
      pinnacleMatched: current.pinnacleMatched || 0,
      betesporteCount: current.betesporte?.length || 0,
      betesporteMatched: current.betesporteMatched || 0,
      pinBeCross: current.pinBeCross || 0,
      scraped: cache.scraped
    });
  }

  if (req.method === "POST" && url.pathname === "/api/import") {
    const body = await readBody(req);
    const contentType = req.headers["content-type"] || "";
    let rows;
    if (contentType.includes("text/csv")) {
      rows = rowsFromFlatCsv(parseCsv(body));
    } else {
      const parsed = JSON.parse(body);
      rows = Array.isArray(parsed) ? parsed : parsed.rows;
    }
    if (!Array.isArray(rows)) return sendJson(res, 400, { error: "Envie um array JSON ou CSV valido." });
    writeJson(IMPORT_FILE, rows);
    loadCurrentRows();
    return sendJson(res, 200, { ok: true, imported: rows.length });
  }

  if (req.method === "POST" && url.pathname === "/api/refresh-pinnacle") {
    try {
      const events = await Promise.race([
        fetchPinnacleEvents(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout Pinnacle (45s)")), 45000))
      ]);
      writeJson(PINNACLE_FILE, events);
      loadCurrentRows();
      return sendJson(res, 200, {
        ok: true,
        pinnacleEvents: events.length,
        pinnacleMatched: cache.pinnacleMatched
      });
    } catch (error) {
      return sendJson(res, 200, { ok: true, pinnacleEvents: 0, pinnacleMatched: 0, warning: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/refresh-betesporte") {
    try {
      const events = await Promise.race([
        fetchBetEsporteEvents(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout BetEsporte (20s)")), 20000))
      ]);
      writeJson(BETESPORTE_FILE, events);
      loadCurrentRows();
      return sendJson(res, 200, {
        ok: true,
        betesporteEvents: events.length,
        betesporteMatched: cache.betesporteMatched
      });
    } catch (error) {
      return sendJson(res, 200, { ok: true, betesporteEvents: 0, betesporteMatched: 0, warning: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    if (fs.existsSync(IMPORT_FILE)) fs.unlinkSync(IMPORT_FILE);
    if (fs.existsSync(PINNACLE_FILE)) fs.unlinkSync(PINNACLE_FILE);
    loadCurrentRows();
    return sendJson(res, 200, { ok: true, source: "sample" });
  }

  if (req.method === "POST" && url.pathname === "/api/refresh-scraper") {
    try {
      const result = await runScraper();
      cache.scraped = result;
      return sendJson(res, 200, {
        ok: true,
        scrapedMatches: result?.scrapedMatches || 0,
        positiveSurebets: result?.positiveSurebets || 0
      });
    } catch (error) {
      return sendJson(res, 200, { ok: true, scrapedMatches: 0, positiveSurebets: 0, warning: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/refresh-oddsagora") {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const start = Date.now();
      const rows = await fetchOddsAgoraSurebets(controller.signal);
      clearTimeout(timeout);
      console.error(`  refresh-oddsagora OK: ${rows.length} rows em ${Date.now()-start}ms`);
      if (!rows.length) throw new Error("Nenhuma surebet retornada pelo endpoint.");
      cache._rows = rows;
      writeJson(IMPORT_FILE, rows);
      loadCurrentRows();
      return sendJson(res, 200, { ok: true, source: "oddsagora", imported: rows.length });
    } catch (error) {
      console.error(`  refresh-oddsagora ERRO: ${error.message}`);
      return sendJson(res, 502, {
        ok: false,
        error: error.message,
        detail: "O sistema continua funcionando com dados importados/manual. A integracao esta isolada para ajuste do decoder."
      });
    }
  }

  return sendJson(res, 404, { error: "Endpoint nao encontrado" });
}

ensureDataDir();
loadCurrentRows();
cache.scraped = getScrapedData();
// Busca dados da OA direto na memoria (sem depender de cache em disco)
setTimeout(async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const rows = await fetchOddsAgoraSurebets(controller.signal);
    clearTimeout(timeout);
    if (rows && rows.length) {
      cache._rows = rows;
      cache.source = "oddsagora";
      cache.updatedAt = new Date().toISOString();
      loadCurrentRows();
    }
  } catch (e) {
    console.error("  OA inicial error:", e.message);
  }
}, 100);
startAutoRefresh();

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch((error) => sendJson(res, 500, { error: error.message }));
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Surebets rodando em http://localhost:${PORT}`);
});
