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
  pinBeCross: document.getElementById("pinBeCross"),
  scraperCount: document.getElementById("scraperCount"),
  scraperMatchCount: document.getElementById("scraperMatchCount"),
  reloadData: document.getElementById("reloadData"),
  bancaInput: document.getElementById("bancaInput"),
  importText: document.getElementById("importText"),
  importJson: document.getElementById("importJson"),
  importCsv: document.getElementById("importCsv"),
  importResult: document.getElementById("importResult"),
  calcStake: document.getElementById("calcStake"),
  calcButton: document.getElementById("calcButton"),
  calcResult: document.getElementById("calcResult")
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

els.reloadData.addEventListener("click", () => {
  if (state.rows.length === 0) deepRefresh(); else syncAndLoad();
});
els.bancaInput.addEventListener("input", () => {
  state.stake = Number(els.bancaInput.value) || 1000;
  els.metricStake.textContent = currency.format(state.stake);
  renderCards(state.rows);
});
els.importJson.addEventListener("click", () => importData("application/json"));
els.importCsv.addEventListener("click", () => importData("text/csv"));
els.calcButton.addEventListener("click", runCalculator);

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
  if (els.pinBeCross) els.pinBeCross.textContent = String(data.pinBeCross || 0);
  if (els.scraperCount && data.scraped) els.scraperCount.textContent = String(data.scraped.positiveSurebets || 0);
  if (els.scraperMatchCount && data.scraped) els.scraperMatchCount.textContent = String(data.scraped.scrapedMatches || 0);
  if (els.bancaInput) els.bancaInput.value = String(state.stake);

  hydrateSports(data.rows || []);
  renderMetrics(data.rows || []);
  renderCards(data.rows || []);
}

function hydrateSports(rows) {
  const current = els.sportFilter.value;
  const sports = [...new Set(rows.map((row) => row.sport).filter(Boolean))].sort();
  els.sportFilter.innerHTML = '<option value="">Todos</option>' + sports.map((sport) => `<option>${escapeHtml(sport)}</option>`).join("");
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
      <article class="card${row.pinnacleMatch ? " has-pinnacle" : ""}${row.betesporteMatch ? " has-betesporte" : ""}${row.pinnacleBetEsporte ? " has-pinbe" : ""}">
        <div class="card-header">
          <div>
            <div class="event-title">${escapeHtml(row.event)}</div>
            <div class="meta-row">
              <span class="tag tag-market" title="${escapeHtml(row.rawMarket || row.market)}">${escapeHtml(row.market)}</span>
              <span class="tag tag-sport">${escapeHtml(row.sport)}</span>
              <span class="tag tag-country">${escapeHtml(row.country)}</span>
              <span class="tag tag-league">${escapeHtml(row.league)}</span>
              ${row.pinnacleBetEsporte ? '<span class="tag tag-pinbe">PINNACLE x BETESPORTE</span>' : ""}
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
            const isExtra = outcome.pinnacle || outcome.betesporte;
            return `
            <div class="outcome${isPinnacle ? " pinnacle-outcome" : ""}${isBetEsporte ? " betesporte-outcome" : ""}">
              ${isPinnacle ? '<div class="pinnacle-badge">Pinnacle</div>' : ""}
              ${isBetEsporte ? '<div class="betesporte-badge">BetEsporte</div>' : ""}
              <strong class="outcome-name">${escapeHtml(outcome.name || "Selecao")}</strong>
              ${outcome.url && !isExtra ? `
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

async function importData(contentType) {
  const response = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: els.importText.value
  });
  const data = await response.json();
  els.importResult.textContent = JSON.stringify(data, null, 2);
  if (data.ok) await loadData();
}

function runCalculator() {
  const stake = Number(els.calcStake.value || 0);
  const odds = [...document.querySelectorAll(".calcOdd")]
    .map((input, index) => ({ name: `Resultado ${index + 1}`, bookmaker: "Manual", odd: Number(input.value) }))
    .filter((item) => item.odd > 1);
  const implied = odds.reduce((sum, item) => sum + 1 / item.odd, 0);
  const payout = stake / implied;
  const profit = payout - stake;
  els.calcResult.innerHTML = `
    <div class="calc-line"><span>Probabilidade implicita</span><strong>${(implied * 100).toFixed(4)}%</strong></div>
    <div class="calc-line"><span>Lucro esperado</span><strong>${currency.format(profit)} (${((1 / implied - 1) * 100).toFixed(2)}%)</strong></div>
    ${odds.map((item) => `<div class="calc-line"><span>${escapeHtml(item.name)} @ ${item.odd.toFixed(2)}</span><strong>${currency.format(payout / item.odd)}</strong></div>`).join("")}
  `;
}

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
      deepRefresh();
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
