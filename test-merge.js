// Test mergeBestOutcomes with line-value matching
const serverCode = require('fs').readFileSync('server.js', 'utf8');

// Extract the relevant functions by eval
function normalizeTeam(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s\/.-]/g, "").trim();
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
  const slots = {};
  for (const o of primaryOutcomes) {
    const sk = slotKey(o, homeTeam, awayTeam);
    if (sk && (!slots[sk] || Number(o.odd) > Number(slots[sk].odd))) slots[sk] = o;
  }
  for (const o of secondaryOutcomes) {
    const sk = slotKey(o, homeTeam, awayTeam);
    if (sk && (!slots[sk] || Number(o.odd) > Number(slots[sk].odd))) slots[sk] = o;
  }
  const seen = new Set();
  const result = [];
  for (const key of Object.keys(slots).sort()) {
    if (!seen.has(key)) { seen.add(key); result.push(slots[key]); }
  }
  return result.length >= 2 ? result : primaryOutcomes;
}

// Test case 1: OA over/under 2.5 + Pinnacle total (different lines)
const oaOutcomes = [{ name: "Mais 2.5 gols", bookmaker: "Betnacional", odd: 5.5 }];
const pinOutcomes = [
  { name: "Over 1.5", bookmaker: "Pinnacle", odd: 1.5, marketType: "total" },
  { name: "Under 1.5", bookmaker: "Pinnacle", odd: 2.5, marketType: "total" },
  { name: "Over 2.5", bookmaker: "Pinnacle", odd: 2.0, marketType: "total" },
  { name: "Under 2.5", bookmaker: "Pinnacle", odd: 1.8, marketType: "total" },
  { name: "Over 3", bookmaker: "Pinnacle", odd: 2.51, marketType: "total" },
  { name: "Under 3", bookmaker: "Pinnacle", odd: 3.02, marketType: "total" },
];
const merged = mergeBestOutcomes(oaOutcomes, pinOutcomes, "Queensland Lions", "Eastern Suburbs");
console.log("Test 1 - OA 2.5 + Pinnacle total (different lines):");
merged.forEach(o => console.log(`  ${o.bookmaker}: ${o.name} @ ${o.odd} [slot: ${slotKey(o, "QL", "ES")}]`));
console.log(`  Expected: "Mais 2.5 gols" + "Under 2.5" (same line 2.5)`);
console.log(`  Got: ${merged.length} outcomes`);
console.log();

// Test case 2: OA moneyline + Pinnacle moneyline (should work)
const oaML = [
  { name: "Casa", bookmaker: "Betano.br", odd: 2.10 },
  { name: "Empate", bookmaker: "Betnacional", odd: 3.40 },
  { name: "Fora", bookmaker: "Superbet.br", odd: 3.50 },
];
const pinML = [
  { name: "Queensland Lions", bookmaker: "Pinnacle", odd: 2.15, marketType: "moneyline" },
  { name: "Empate", bookmaker: "Pinnacle", odd: 3.35, marketType: "moneyline" },
  { name: "Eastern Suburbs", bookmaker: "Pinnacle", odd: 3.60, marketType: "moneyline" },
];
const mergedML = mergeBestOutcomes(oaML, pinML, "Queensland Lions", "Eastern Suburbs");
console.log("Test 2 - OA moneyline + Pinnacle moneyline:");
mergedML.forEach(o => console.log(`  ${o.bookmaker}: ${o.name} @ ${o.odd} [slot: ${slotKey(o, "QL", "ES")}]`));
console.log(`  Expected: Pinnacle Home (2.15), OA Draw (3.40), Pinnacle Away (3.60)`);
console.log();

// Test case 3: "Acima 4.5" + "Abaixo 3" from same source (different lines, should NOT pair)
const pinMixed = [
  { name: "Acima 4.5 gols", bookmaker: "Pinnacle", odd: 2.51, marketType: "total" },
  { name: "Abaixo 3 gols", bookmaker: "Pinnacle", odd: 3.02, marketType: "total" },
];
const mergedMixed = mergeBestOutcomes(pinMixed, [], "QL", "ES");
console.log("Test 3 - Same source, different lines:");
mergedMixed.forEach(o => console.log(`  ${o.bookmaker}: ${o.name} @ ${o.odd} [slot: ${slotKey(o, "QL", "ES")}]`));
console.log(`  Expected: fallback to primary = both kept (but different slots)`);
console.log();

// Test surebet calculation with merged moneyline
function calculateSurebet(outcomes, totalStake = 1000) {
  const clean = outcomes.filter(o => o.odd);
  if (clean.length < 2) return null;
  const implied = clean.reduce((sum, o) => sum + 1 / Number(o.odd), 0);
  const profitPercent = (1 / implied - 1) * 100;
  return { impliedProbability: implied * 100, profitPercent };
}

console.log("Test 4 - Surebet calc on best moneyline:");
const calc = calculateSurebet(mergedML);
console.log(`  Implied: ${calc.impliedProbability.toFixed(2)}% Profit: ${calc.profitPercent.toFixed(2)}%`);
console.log(`  Is surebet: ${calc.profitPercent > 0}`);
