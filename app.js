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
      if (!sameMonthYear(baseDate, ym))
