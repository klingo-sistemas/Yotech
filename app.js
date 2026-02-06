// ===============================
// CONFIG
// ===============================
const API_URL = "https://script.google.com/macros/s/AKfycbzLY6WE_XD26ql7phJ_b4VQ7pZLl-eJehG85x7gPZeOwLbqJpUYYthzvBA4x9mMqghu/exec"; // .../exec

// ===============================
// STATE
// ===============================
let rawData = [];
let filtered = [];

// ===============================
// HELPERS - datas (DD/MM/YYYY) e normalização
// ===============================
function parseBrDate(str) {
  // aceita "07/08/2025" (dd/mm/yyyy). Retorna Date ou null.
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return null;
  const [dd, mm, yyyy] = s.split("/").map(Number);
  // Date(yyyy, mm-1, dd) evita bug de timezone do ISO
  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toISODateInput(d) {
  // yyyy-mm-dd (pra preencher input[type=date], se precisar)
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function sameMonthYear(dateObj, ym) {
  // ym no formato "YYYY-MM" (input month)
  if (!dateObj || !ym) return false;
  const [Y, M] = ym.split("-").map(Number);
  return dateObj.getFullYear() === Y && (dateObj.getMonth() + 1) === M;
}

function strNorm(s) {
  return (s ?? "").toString().trim();
}

function isConcluidoSim(v) {
  const x = strNorm(v).toLowerCase();
  return x === "sim" || x === "true" || x === "1";
}

// ===============================
// FETCH (com fallback JSONP opcional)
// ===============================
async function fetchData() {
  setError("");

  // 1) tentativa padrão (fetch)
  try {
    const res = await fetch(API_URL, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json;
  } catch (e) {
    // 2) fallback JSONP (caso CORS atrapalhe)
    // Se você não quiser JSONP, pode remover isso.
    try {
      const json = await fetchJsonp(`${API_URL}?callback=__cb`);
      return json;
    } catch (e2) {
      throw new Error(
        "Falha ao buscar dados da API (fetch/JSONP). Verifique a URL do Web App e permissões do Apps Script."
      );
    }
  }
}

function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    const cbName = `cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout JSONP"));
    }, 12000);

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    function cleanup() {
      clearTimeout(timeout);
      script.remove();
      delete window[cbName];
    }

    const u = url.includes("callback=")
      ? url.replace("callback=__cb", `callback=${cbName}`)
      : `${url}${url.includes("?") ? "&" : "?"}callback=${cbName}`;

    script.src = u;
    script.onerror = () => {
      cleanup();
      reject(new Error("Erro JSONP"));
    };

    document.head.appendChild(script);
  });
}

// ===============================
// UI HOOKS
// ===============================
const el = (id) => document.getElementById(id);

const ui = {
  lastUpdate: el("lastUpdate"),
  btnRefresh: el("btnRefresh"),
  btnClear: el("btnClear"),

  fImplantador: el("fImplantador"),
  fStatus: el("fStatus"),
  fMonthBase: el("fMonthBase"),
  fMonth: el("fMonth"),
  useInicio: el("useInicio"),
  usePrev: el("usePrev"),
  inicioDe: el("inicioDe"),
  inicioAte: el("inicioAte"),
  prevDe: el("prevDe"),
  prevAte: el("prevAte"),
  fSearch: el("fSearch"),

  kTotal: el("kTotal"),
  kDone: el("kDone"),
  kOpen: el("kOpen"),
  kLate: el("kLate"),
  countInfo: el("countInfo"),

  barsImplantador: el("barsImplantador"),
  tblBody: el("tblBody"),
  errBox: el("errBox"),
};

function setError(msg) {
  if (!msg) {
    ui.errBox.style.display = "none";
    ui.errBox.textContent = "";
    return;
  }
  ui.errBox.style.display = "block";
  ui.errBox.textContent = msg;
}

// ===============================
// DATA MAPPING
// Espera receber algo assim:
// [{ cliente, implantador, concluido, data_inicio, previsao_start }, ...]
// ===============================
function normalizeRows(rows) {
  return (rows || []).map((r) => {
    const cliente = strNorm(r.cliente);
    const implantador = strNorm(r.implantador);
    const concluido = strNorm(r.concluido);
    const data_inicio = strNorm(r.data_inicio);
    const previsao_start = strNorm(r.previsao_start);

    const dInicio = parseBrDate(data_inicio);
    const dPrev = parseBrDate(previsao_start);

    return {
      cliente,
      implantador,
      concluido,
      data_inicio,
      previsao_start,
      dInicio,
      dPrev,
    };
  });
}

// ===============================
// FILTERS
// ===============================
function applyFilters() {
  const imp = ui.fImplantador.value;
  const st = ui.fStatus.value;
  const search = ui.fSearch.value.trim().toLowerCase();

  const monthBase = ui.fMonthBase.value; // previsao_start | data_inicio
  const ym = ui.fMonth.value; // YYYY-MM

  const useInicio = ui.useInicio.checked;
  const usePrev = ui.usePrev.checked;

  // date inputs são YYYY-MM-DD
  const inicioDe = ui.inicioDe.value ? new Date(ui.inicioDe.value + "T00:00:00") : null;
  const inicioAte = ui.inicioAte.value ? new Date(ui.inicioAte.value + "T23:59:59") : null;
  const prevDe = ui.prevDe.value ? new Date(ui.prevDe.value + "T00:00:00") : null;
  const prevAte = ui.prevAte.value ? new Date(ui.prevAte.value + "T23:59:59") : null;

  filtered = rawData.filter((r) => {
    if (imp && r.implantador !== imp) return false;
    if (st && r.concluido !== st) return false;

    if (search) {
      const hay = `${r.cliente} ${r.implantador}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    // filtro por mês/ano (baseado no campo escolhido)
    if (ym) {
      const baseDate = (monthBase === "data_inicio") ? r.dInicio : r.dPrev;
      if (!sameMonthYear(baseDate, ym)) return false;
    }

    // filtros de intervalo (pode usar 1 ou 2 ao mesmo tempo)
    // regra: se marcou ambos, precisa passar em ambos.
    if (useInicio) {
      const d = r.dInicio;
      if (!d) return false;
      if (inicioDe && d < inicioDe) return false;
      if (inicioAte && d > inicioAte) return false;
    }
    if (usePrev) {
      const d = r.dPrev;
      // se previsao_start for texto tipo "Sem previsão de start", dPrev vira null -> não passa
      if (!d) return false;
      if (prevDe && d < prevDe) return false;
      if (prevAte && d > prevAte) return false;
    }

    return true;
  });

  renderAll();
}

// ===============================
// RENDER
// ===============================
function renderAll() {
  // KPIs
  const total = filtered.length;
  const done = filtered.filter((r) => isConcluidoSim(r.concluido)).length;
  const open = total - done;

  const today = new Date();
  today.setHours(0,0,0,0);

  const late = filtered.filter((r) => {
    if (isConcluidoSim(r.concluido)) return false;
    if (!r.dPrev) return false;
    return r.dPrev < today;
  }).length;

  ui.kTotal.textContent = total;
  ui.kDone.textContent = done;
  ui.kOpen.textContent = open;
  ui.kLate.textContent = late;

  ui.countInfo.textContent = `Mostrando ${total} de ${rawData.length} registros`;

  // Por implantador (barras)
  const map = new Map();
  for (const r of filtered) {
    const key = r.implantador || "(Sem implantador)";
    map.set(key, (map.get(key) || 0) + 1);
  }
  const arr = [...map.entries()].sort((a,b) => b[1]-a[1]);
  const max = arr.length ? arr[0][1] : 1;

  ui.barsImplantador.innerHTML = arr.map(([name, n]) => {
    const pct = Math.round((n / max) * 100);
    return `
      <div class="barrow" title="${name}">
        <div class="name">${escapeHtml(name)}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="num">${n}</div>
      </div>
    `;
  }).join("");

  // Linha do tempo (ordenar por previsão, depois início)
  const sorted = [...filtered].sort((a,b) => {
    const ap = a.dPrev ? a.dPrev.getTime() : Number.POSITIVE_INFINITY;
    const bp = b.dPrev ? b.dPrev.getTime() : Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;

    const ai = a.dInicio ? a.dInicio.getTime() : Number.POSITIVE_INFINITY;
    const bi = b.dInicio ? b.dInicio.getTime() : Number.POSITIVE_INFINITY;
    return ai - bi;
  });

  ui.tblBody.innerHTML = sorted.map((r) => {
    const pill = isConcluidoSim(r.concluido)
      ? `<span class="pill"><span class="dot good"></span>Sim</span>`
      : `<span class="pill"><span class="dot warn"></span>Não</span>`;

    return `
      <tr>
        <td>${escapeHtml(r.cliente || "-")}</td>
        <td>${escapeHtml(r.implantador || "-")}</td>
        <td>${pill}</td>
        <td>${escapeHtml(r.data_inicio || "-")}</td>
        <td>${escapeHtml(r.previsao_start || "-")}</td>
      </tr>
    `;
  }).join("");
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===============================
// INIT
// ===============================
async function init() {
  ui.lastUpdate.textContent = "Carregando dados…";

  try {
    const data = await fetchData();
    rawData = normalizeRows(data);
    ui.lastUpdate.textContent = `Atualizado: ${new Date().toLocaleString("pt-BR")}`;

    // popula select de implantador
    const imps = [...new Set(rawData.map(r => r.implantador).filter(Boolean))].sort();
    ui.fImplantador.innerHTML = `<option value="">Todos</option>` + imps.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");

    applyFilters();
  } catch (e) {
    ui.lastUpdate.textContent = "Erro ao carregar";
    setError(e.message || String(e));
  }
}

function clearFilters() {
  ui.fImplantador.value = "";
  ui.fStatus.value = "";
  ui.fMonthBase.value = "previsao_start";
  ui.fMonth.value = "";
  ui.useInicio.checked = true;
  ui.usePrev.checked = true;
  ui.inicioDe.value = "";
  ui.inicioAte.value = "";
  ui.prevDe.value = "";
  ui.prevAte.value = "";
  ui.fSearch.value = "";
  applyFilters();
}

[
  ui.fImplantador, ui.fStatus, ui.fMonthBase, ui.fMonth,
  ui.useInicio, ui.usePrev,
  ui.inicioDe, ui.inicioAte, ui.prevDe, ui.prevAte, ui.fSearch
].forEach((x) => x.addEventListener("input", applyFilters));

ui.btnRefresh.addEventListener("click", init);
ui.btnClear.addEventListener("click", clearFilters);

init();

