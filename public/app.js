// V2 - stake-badge removido em 19/07
const REFRESH_INTERVAL = 60000; // 1 min - deep refresh

const state = {
  rows: [],
  stake: 1000,
  syncing: false
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const els = {
  cards: document.getElementById("cards"),
  sourceLabel: document.getElementById("sourceLabel"),
  updatedLabel: document.getElementById("updatedLabel"),
  countdownLabel: document.getElementById("countdownLabel"),
  syncStatus: document.getElementById("syncStatus"),
  sportFilter: document.getElementById("sportFilter"),
  profitFilter: document.getElementById("profitFilter"),
  metricSurebets: document.getElementById("metricSurebets"),
  metricBest: document.getElementById("metricBest"),
  metricOdd: document.getElementById("metricOdd"),
  metricStake: document.getElementById("metricStake"),
  pinnacleCount: document.getElementById("pinnacleCount"),
  pinnacleMatchCount: document.getElementById("pinnacleMatchCount"),
  betesporteCount: document.getElementById("betesporteCount"),
  betesporteMatchCount: document.getElementById("betesporteMatchCount"),
  stakeCount: document.getElementById("stakeCount"),
  stakeMatchCount: document.getElementById("stakeMatchCount"),
  pinStakeCross: document.getElementById("pinStakeCross"),
  beStakeCross: document.getElementById("beStakeCross"),
  pinBeCross: document.getElementById("pinBeCross"),
  scraperCount: document.getElementById("scraperCount"),
  scraperMatchCount: document.getElementById("scraperMatchCount"),
  reloadData: document.getElementById("reloadData"),
  bancaInput: document.getElementById("bancaInput"),
  calcStake: document.getElementById("calcStake"),
  calcOddsList: document.getElementById("calcOddsList"),
  calcAddOutcome: document.getElementById("calcAddOutcome"),
  calcImplied: document.getElementById("calcImplied"),
  calcProfit: document.getElementById("calcProfit"),
  calcPayout: document.getElementById("calcPayout"),
  calcTotalStake: document.getElementById("calcTotalStake"),
  calcProfitBar: document.getElementById("calcProfitBar"),
  calcBreakEven: document.getElementById("calcBreakEven"),
  calcBarMax: document.getElementById("calcBarMax"),
  calcBreakdown: document.getElementById("calcBreakdown"),
  calcStatus: document.getElementById("calcStatus")
};

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(`${button.dataset.view}View`).classList.add("active");
  });
});

[els.sportFilter, els.profitFilter].forEach((el) => {
  el.addEventListener("input", loadData);
});

els.reloadData.addEventListener("click", () => { deepRefresh(); });
els.bancaInput.addEventListener("input", () => {
  state.stake = Number(els.bancaInput.value) || 1000;
  els.metricStake.textContent = currency.format(state.stake);
  renderCards(state.rows);
});
els.calcStake.addEventListener("input", runCalculator);
els.calcAddOutcome.addEventListener("click", addCalcOutcome);

async function syncAndLoad() {
  try {
    await loadData();
    els.syncStatus.textContent = "Atualizado";
  } catch { /* ignore */ }
  resetCountdown();
}

// Full refresh runs in background (auto-refresh or manual deep)
let deepRefreshRunning = false;
async function deepRefresh() {
  if (deepRefreshRunning) return;
  deepRefreshRunning = true;
  els.reloadData.disabled = true;
  els.reloadData.innerHTML = '<span class="icon-sync spinning">&#x21bb;</span> Sincronizando...';
  els.syncStatus.textContent = "Sincronizando...";

  const signal = (ms) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  };

  const results = await Promise.allSettled([
    fetch("/api/refresh-oddsagora", { method: "POST", signal: signal(60000) }).then(r => r.json()),
    fetch("/api/refresh-pinnacle", { method: "POST", signal: signal(50000) }).then(r => r.json()),
    fetch("/api/refresh-betesporte", { method: "POST", signal: signal(25000) }).then(r => r.json()),
    fetch("/api/refresh-scraper", { method: "POST", signal: signal(120000) }).then(r => r.json()),
  ]);

  const parts = [];
  results.forEach((result, i) => {
    const labels = ["OA", "Pinnacle", "BetEsporte", "Scraper"];
    if (result.status === "fulfilled" && result.value?.ok) {
      const v = result.value;
      if (i === 0) parts.push(`${v.imported} sb`);
      else if (i === 1) parts.push(`${v.pinnacleEvents} ev, ${v.pinnacleMatched} cruz`);
      else if (i === 2) parts.push(`${v.betesporteEvents} ev, ${v.betesporteMatched} cruz`);
      else if (i === 3) parts.push(`${v.positiveSurebets} sb`);
    } else {
      parts.push(`${labels[i]}: erro`);
    }
  });
  els.syncStatus.textContent = parts.join(" | ");

  try {
    await loadData();
  } catch { /* ignore */ }

  deepRefreshRunning = false;
  els.reloadData.disabled = false;
  els.reloadData.innerHTML = '<span class="icon-sync">&#x21bb;</span> Atualizar';
  resetCountdown();
}

async function loadData() {
  const params = new URLSearchParams();
  if (els.sportFilter.value) params.set("sport", els.sportFilter.value);
  if (els.profitFilter.value) params.set("minProfit", els.profitFilter.value);

  const response = await fetch(`/api/surebets?${params}`);
  const data = await response.json();
  state.rows = (data.rows || []);
  els.sourceLabel.textContent = "Ativo";
  els.updatedLabel.textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleString("pt-BR") : "Sem atualizacao";
  if (els.pinnacleCount) els.pinnacleCount.textContent = String(data.pinnacleCount || 0);
  if (els.pinnacleMatchCount) els.pinnacleMatchCount.textContent = String(data.pinnacleMatched || 0);
  if (els.betesporteCount) els.betesporteCount.textContent = String(data.betesporteCount || 0);
  if (els.betesporteMatchCount) els.betesporteMatchCount.textContent = String(data.betesporteMatched || 0);
  if (els.stakeCount) els.stakeCount.textContent = String(data.stakeCount || 0);
  if (els.stakeMatchCount) els.stakeMatchCount.textContent = String(data.stakeMatched || 0);
  if (els.pinStakeCross) els.pinStakeCross.textContent = String(data.pinStakeCross || 0);
  if (els.beStakeCross) els.beStakeCross.textContent = String(data.beStakeCross || 0);
  if (els.pinBeCross) els.pinBeCross.textContent = String(data.pinBeCross || 0);
  if (els.scraperCount && data.scraped) els.scraperCount.textContent = String(data.scraped.positiveSurebets || 0);
  if (els.scraperMatchCount && data.scraped) els.scraperMatchCount.textContent = String(data.scraped.scrapedMatches || 0);
  if (els.bancaInput) els.bancaInput.value = String(state.stake);

  hydrateSports(data.rows || []);
  renderMetrics(data.rows || []);
  renderCards(data.rows || []);
}

const ALL_SPORTS = [
  "Futebol", "Basquete", "Baseball", "Tenis", "Tênis",
  "Futebol Americano", "MMA", "Volei", "Vôlei", "Handebol",
  "Hoquei", "Hóquei", "Boxe", "Rugby", "Futsal",
  "Tenis de Mesa", "Tênis de Mesa", "Dardos", "Cricket", "Formula 1",
  "Automobilismo", "Ciclismo", "Golfe", "Sinuca"
];

function hydrateSports(rows) {
  const current = els.sportFilter.value;
  const fromData = new Set(rows.map((r) => r.sport).filter(Boolean));
  const merged = [...new Set([...ALL_SPORTS, ...fromData])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  els.sportFilter.innerHTML = '<option value="">Todos</option>' + merged.map((s) => `<option>${escapeHtml(s)}</option>`).join("");
  els.sportFilter.value = current;
}

function renderMetrics(rows) {
  const surebets = rows.filter((row) => row.isSurebet);
  const best = Math.max(0, ...surebets.map((row) => row.surebet.profitPercent));
  const bestOdd = Math.max(0, ...rows.map((row) => row.bestOdd || 0));
  els.metricSurebets.textContent = String(surebets.length);
  els.metricBest.textContent = `${best.toFixed(2)}%`;
  els.metricOdd.textContent = bestOdd.toFixed(2);
  els.metricStake.textContent = currency.format(state.stake);
}

function recalcStakes(outcomes, stake, profitPercent) {
  if (!outcomes || !outcomes.length) return outcomes;
  const clean = outcomes.filter(o => Number(o.odd) > 1);
  const implied = clean.reduce((s, o) => s + 1 / Number(o.odd), 0);
  const payout = stake / implied;
  const profit = payout - stake;
  return clean.map(o => ({
    ...o,
    stake: Math.round((payout / Number(o.odd)) * 100) / 100,
    returnAmount: Math.round((payout / Number(o.odd)) * Number(o.odd) * 100) / 100
  }));
}

function recalcImplicit(outcomes) {
  const clean = outcomes.filter(o => Number(o.odd) > 1);
  const implied = clean.reduce((s, o) => s + 1 / Number(o.odd), 0);
  return { implied, payout: 1 / implied, profitPct: (1 / implied - 1) * 100 };
}

function renderCards(rows) {
  if (!rows.length) {
    els.cards.innerHTML = '<div class="panel empty">Nenhuma oportunidade encontrada com os filtros atuais.</div>';
    return;
  }

  const stake = state.stake;

  els.cards.innerHTML = rows.map((row) => {
    const surebet = row.surebet;
    const profitClass = row.isSurebet ? "profit" : "profit negative";
    const outcomes = surebet?.stakes || row.outcomes || [];
    const scaled = surebet ? recalcStakes(outcomes, stake, surebet.profitPercent) : outcomes;
    const profitAmount = surebet ? surebet.profitPercent / 100 * stake : 0;
    const calc = recalcImplicit(outcomes);

    return `
      <article class="card${row.pinnacleMatch ? " has-pinnacle" : ""}${row.betesporteMatch ? " has-betesporte" : ""}${row.stakeMatch ? " has-stake" : ""}${row.pinnacleBetEsporte ? " has-pinbe" : ""}${row.pinnacleStake ? " has-pinstake" : ""}${row.betesporteStake ? " has-bestake" : ""}">
        <div class="card-header">
          <div>
            <div class="event-title">${escapeHtml(row.event)}</div>
            <div class="meta-row">
              <span class="tag tag-market" title="${escapeHtml(row.rawMarket || row.market)}">${escapeHtml(row.market)}</span>
              <span class="tag tag-sport">${escapeHtml(row.sport)}</span>
              <span class="tag tag-country">${escapeHtml(row.country)}</span>
              <span class="tag tag-league">${escapeHtml(row.league)}</span>
              ${row.pinnacleBetEsporte ? '<span class="tag tag-pinbe">PINNACLE x BETESPORTE</span>' : ""}
              ${row.pinnacleStake ? '<span class="tag tag-pinstake">PINNACLE x STAKE</span>' : ""}
              ${row.betesporteStake ? '<span class="tag tag-bestake">BETESPORTE x STAKE</span>' : ""}
              ${row.scrapedSource ? '<span class="tag tag-scraper">SCRAPER</span>' : ""}
            </div>
            <div class="meta-time">${row.startsAt ? new Date(row.startsAt).toLocaleString("pt-BR") : "Horario nao informado"}</div>
          </div>
          <div class="${profitClass}">
            ${surebet ? `${surebet.profitPercent.toFixed(2)}%` : "N/A"}
            <div class="profit-amount">${surebet ? currency.format(profitAmount) : "Sem calculo"}</div>
          </div>
        </div>
        <div class="outcomes">
          ${scaled.map((outcome) => {
            const isPinnacle = outcome.pinnacle;
            const isBetEsporte = outcome.betesporte;
            const isStake = outcome.bookmaker === "Stake" && (row.pinnacleStake || row.betesporteStake);
            const isExtra = outcome.pinnacle || outcome.betesporte || isStake;
            return `
            <div class="outcome${isPinnacle ? " pinnacle-outcome" : ""}${isBetEsporte ? " betesporte-outcome" : ""}">
              ${isPinnacle ? '<div class="pinnacle-badge">Pinnacle</div>' : ""}
              ${isBetEsporte ? '<div class="betesporte-badge">BetEsporte</div>' : ""}
              <strong class="outcome-name">${escapeHtml(outcome.name || "Selecao")}</strong>
              ${outcome.url ? `
                <a href="${escapeHtml(outcome.url)}" target="_blank" rel="noopener" class="book-btn" title="Apostar na ${escapeHtml(outcome.bookmaker)}">
                  <span class="book-btn-bookmaker">${escapeHtml(outcome.bookmaker || "Casa")}</span>
                  <span class="book-btn-go">IR</span>
                </a>
              ` : `
                <div class="book${isPinnacle ? " pinnacle-book" : ""}${isBetEsporte ? " betesporte-book" : ""}">${escapeHtml(outcome.bookmaker || "Casa")}</div>
              `}
              <div class="odd">${Number(outcome.odd).toFixed(2)}</div>
              <div class="stake">Stake: ${currency.format(outcome.stake || 0)}</div>
              <div class="meta-return">Retorno: ${currency.format(outcome.returnAmount || 0)}</div>
            </div>`;
          }).join("")}
        </div>
        <div class="calc-panel">
          <button class="calc-toggle" onclick="toggleCalc(this)">Calculadora</button>
          <div class="calc-body">
            <div class="calc-grid-inline">
              <div class="calc-stat">
                <span>Prob. Implicita</span>
                <strong>${(calc.implied * 100).toFixed(4)}%</strong>
              </div>
              <div class="calc-stat">
                <span>Payout</span>
                <strong>${(calc.payout * 100).toFixed(4)}%</strong>
              </div>
              <div class="calc-stat">
                <span>Lucro</span>
                <strong>${calc.profitPct.toFixed(2)}%</strong>
              </div>
              <div class="calc-stat">
                <span>Lucro (R$${stake})</span>
                <strong>${currency.format(profitAmount)}</strong>
              </div>
            </div>
            <div class="calc-breakdown">
              <small>Distribuicao dos stakes (Banca: ${currency.format(stake)}):</small>
              ${scaled.map(o => `
                <div class="calc-line">
                  <span>${escapeHtml(o.name || "Outcome")} @ ${Number(o.odd).toFixed(2)}</span>
                  <strong>${currency.format(o.stake || 0)}</strong>
                  <span class="calc-return">→ ${currency.format(o.returnAmount || 0)}</span>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function toggleCalc(btn) {
  const body = btn.nextElementSibling;
  const isOpen = body.style.display === "block";
  body.style.display = isOpen ? "none" : "block";
  btn.textContent = isOpen ? "Calculadora" : "Ocultar";
}

function addCalcOutcome() {
  const items = els.calcOddsList.querySelectorAll(".calc-pro-row");
  const idx = items.length + 1;
  const row = document.createElement("div");
  row.className = "calc-pro-row";
  row.innerHTML = `
    <input class="calc-pro-name" type="text" value="Resultado ${idx}" placeholder="Nome">
    <input class="calc-pro-odd" type="number" step="0.01" min="1.01" value="${idx <= 2 ? (idx === 1 ? 2.1 : 2.05) : ""}" placeholder="Odd">
    ${items.length >= 2 ? '<button class="calc-pro-remove" title="Remover">&times;</button>' : ""}
  `;
  els.calcOddsList.appendChild(row);
  if (items.length >= 2) els.calcOddsList.querySelectorAll(".calc-pro-remove").forEach(b => b.remove());
  if (items.length >= 1) {
    const firstRemove = els.calcOddsList.querySelector(".calc-pro-row:first-child .calc-pro-remove");
    if (!firstRemove) {
      const firstRow = els.calcOddsList.querySelector(".calc-pro-row:first-child");
      const rm = document.createElement("button");
      rm.className = "calc-pro-remove";
      rm.title = "Remover";
      rm.textContent = "\u00D7";
      firstRow.appendChild(rm);
    }
  }
  row.querySelector(".calc-pro-odd").focus();
  runCalculator();
}

let calcOutcomeCount = 0;
function initCalculator() {
  calcOutcomeCount = 0;
  els.calcOddsList.innerHTML = "";
  addCalcOutcome();
  addCalcOutcome();
}
els.calcOddsList.addEventListener("input", (e) => {
  if (e.target.classList.contains("calc-pro-odd") || e.target.classList.contains("calc-pro-name")) {
    runCalculator();
  }
});
els.calcOddsList.addEventListener("click", (e) => {
  if (e.target.classList.contains("calc-pro-remove")) {
    const row = e.target.closest(".calc-pro-row");
    if (els.calcOddsList.querySelectorAll(".calc-pro-row").length <= 2) return;
    row.remove();
    runCalculator();
  }
});

function runCalculator() {
  const stake = Number(els.calcStake.value) || 0;
  const rows = [...els.calcOddsList.querySelectorAll(".calc-pro-row")];
  const odds = rows.map((row, i) => {
    const name = row.querySelector(".calc-pro-name").value.trim() || `Resultado ${i+1}`;
    const odd = Number(row.querySelector(".calc-pro-odd").value);
    return { name, odd };
  }).filter(o => o.odd > 1);

  if (odds.length < 2 || stake <= 0) {
    els.calcImplied.textContent = "--";
    els.calcProfit.textContent = "--";
    els.calcPayout.textContent = "--";
    els.calcTotalStake.textContent = "--";
    els.calcProfitBar.style.width = "0%";
    els.calcBreakdown.innerHTML = "";
    els.calcStatus.textContent = odds.length < 2 ? "Adicione pelo menos 2 odds" : "Defina um stake valido";
    els.calcStatus.className = "calc-pro-status";
    return;
  }

  const implied = odds.reduce((s, o) => s + 1 / o.odd, 0);
  const payout = stake / implied;
  const profit = payout - stake;
  const profitPct = (1 / implied - 1) * 100;
  const isProfitable = profitPct > 0;

  els.calcImplied.textContent = (implied * 100).toFixed(4) + "%";
  els.calcTotalStake.textContent = currency.format(stake);
  els.calcPayout.textContent = currency.format(payout);

  const profitEl = els.calcProfit;
  profitEl.textContent = isProfitable ? `${profitPct.toFixed(2)}% (${currency.format(profit)})` : `${profitPct.toFixed(2)}% (${currency.format(profit)})`;
  profitEl.style.color = isProfitable ? "var(--accent)" : "var(--danger)";

  const barPct = Math.min(Math.max(profitPct + 2, 0), 12);
  els.calcProfitBar.style.width = (barPct / 12 * 100) + "%";
  els.calcProfitBar.style.background = isProfitable ? "var(--accent)" : "var(--danger)";
  els.calcBreakEven.textContent = "0%";
  els.calcBarMax.textContent = `+10%`;
  if (profitPct < -1) els.calcBarMax.textContent = `${profitPct.toFixed(1)}%`;

  const breakdown = odds.map(o => ({
    ...o,
    stake: Math.round((payout / o.odd) * 100) / 100,
    ret: Math.round((payout / o.odd) * o.odd * 100) / 100
  }));

  els.calcBreakdown.innerHTML = `
    <div class="calc-pro-bd-header">
      <span>Resultado</span>
      <span>Odd</span>
      <span>Stake</span>
      <span>Retorno</span>
    </div>
    ${breakdown.map(o => `
      <div class="calc-pro-bd-row">
        <span class="calc-pro-bd-name">${escapeHtml(o.name)}</span>
        <span class="calc-pro-bd-odd">${o.odd.toFixed(2)}</span>
        <span class="calc-pro-bd-stake">${currency.format(o.stake)}</span>
        <span class="calc-pro-bd-return">${currency.format(o.ret)}</span>
      </div>
    `).join("")}
    <div class="calc-pro-bd-total">
      <span>Total</span>
      <span></span>
      <span>${currency.format(breakdown.reduce((s, o) => s + o.stake, 0))}</span>
      <span>${currency.format(breakdown.reduce((s, o) => s + o.ret, 0))}</span>
    </div>
  `;

  if (isProfitable) {
    els.calcStatus.innerHTML = `<span class="calc-pro-status-yes">Surebet encontrada! Lucro garantido de ${profitPct.toFixed(2)}%</span>`;
  } else if (profitPct > -1) {
    els.calcStatus.innerHTML = `<span class="calc-pro-status-warn">Quase la! Margem de ${Math.abs(profitPct).toFixed(2)}% abaixo do break-even</span>`;
  } else {
    els.calcStatus.innerHTML = `<span class="calc-pro-status-no">Margem negativa de ${Math.abs(profitPct).toFixed(2)}% — nao e surebet</span>`;
  }
  els.calcStatus.className = "calc-pro-status" + (isProfitable ? " profit" : "");
}

initCalculator();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

let countdownInterval = null;

function resetCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  let remaining = Math.floor(REFRESH_INTERVAL / 1000);
  updateCountdown(remaining);
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      syncAndLoad();
      return;
    }
    updateCountdown(remaining);
  }, 1000);
}

function updateCountdown(seconds) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    els.countdownLabel.textContent = `${m}m ${s}s`;
  } else {
    els.countdownLabel.textContent = `${seconds}s`;
  }
}

loadData();
resetCountdown();
