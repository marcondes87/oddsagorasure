// Test mergeBestOutcomes with restrict-to-primary-slots logic
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

// Test case 1: OA over/under 2.5 + Pinnacle total (different lines - should NOT merge mismatched lines)
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
console.log("Test 1 - OA 2.5 + Pinnacle total (restrict to primary slots):");
merged.forEach(o => console.log(`  ${o.bookmaker}: ${o.name} @ ${o.odd} [slot: ${slotKey(o, "Queensland Lions", "Eastern Suburbs")}]`));
console.log(`  Count: ${merged.length} (expected: 1 = fallback to primary since OA has only 1 outcome)`);
// OA has only 1 outcome (Mais 2.5), so merge returns primaryOutcomes (1 outcome)
console.log(`  First outcome: ${merged[0].bookmaker} ${merged[0].name}`);
console.log();

// Test case 2: OA moneyline + Pinnacle moneyline
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
mergedML.forEach(o => console.log(`  ${o.bookmaker}: ${o.name} @ ${o.odd} [slot: ${slotKey(o, "Queensland Lions", "Eastern Suburbs")}]`));
console.log(`  Expected: Pinnacle QL (2.15), Betnacional Empate (3.40), Pinnacle ES (3.60)`);
console.log();

// Surebet calc
function calculateSurebet(outcomes, totalStake = 1000) {
  const clean = outcomes.filter(o => o.odd);
  if (clean.length < 2) return null;
  const implied = clean.reduce((sum, o) => sum + 1 / Number(o.odd), 0);
  const profitPercent = (1 / implied - 1) * 100;
  return { impliedProbability: implied * 100, profitPercent, outcomeCount: clean.length };
}

const calc = calculateSurebet(mergedML);
console.log(`Moneyline surebet: implied=${calc.impliedProbability.toFixed(2)}% profit=${calc.profitPercent.toFixed(2)}% count=${calc.outcomeCount}`);
console.log();

// Test case 3: OA over/under with BOTH sides + Pinnacle same lines
const ouOa = [
  { name: "Mais 2.5 gols", bookmaker: "Betano", odd: 2.10 },
  { name: "Menos 2.5 gols", bookmaker: "Betnacional", odd: 1.70 },
];
const ouPin = [
  { name: "Over 2.5", bookmaker: "Pinnacle", odd: 2.20, marketType: "total" },
  { name: "Under 2.5", bookmaker: "Pinnacle", odd: 1.65, marketType: "total" },
];
const mergedOU = mergeBestOutcomes(ouOa, ouPin, "Queensland Lions", "Eastern Suburbs");
console.log("Test 3 - OA O/U 2.5 both sides + Pinnacle same line:");
mergedOU.forEach(o => console.log(`  ${o.bookmaker}: ${o.name} @ ${o.odd}`));
console.log(`  Count: ${mergedOU.length} (expected: 2)`);
const ouCalc = calculateSurebet(mergedOU);
console.log(`  Profit: ${ouCalc.profitPercent.toFixed(2)}%`);
