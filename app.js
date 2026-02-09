// ===============================
// CONFIG
// ===============================
const API_URL = "https://script.google.com/macros/s/AKfycbzLY6WE_XD26ql7phJ_b4VQ7pZLl-eJehG85x7gPZeOwLbqJpUYYthzvBA4x9mMqghu/exec";

// ===============================
// STATE
// ===============================
let rawData = [];
let filtered = [];

// ===============================
// SORT (Dashboard 3)
// ===============================
let sortKey = null;
let sortDir = 1; // 1 asc | -1 desc

function cmp(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });
}

function getSortValue(r, key) {
  switch (key) {
    case "cliente": return (r.cliente || "").toLowerCase();
    case "implantador": return (r.implantador || "").toLowerCase();

    case "concluido": // Status
      return isConcluidoSim(r.concluido) ? 1 : 0;

    case "data_inicio":
      return r.dInicio ? r.dInicio.getTime() : null;

    case "previsao_start":
      return r.dPrevComercial ? r.dPrevComercial.getTime() : null;

    case "start_real":
      return r.dStartReal ? r.dStartReal.getTime() : null;

    case "passado_suporte":
      return (r.passado_suporte || "").toLowerCase();

    case "data_passagem_suporte":
      return r.dPassSuporte ? r.dPassSuporte.getTime() : null;

    default:
      return (r[key] ?? "").toString().toLowerCase();
  }
}

function updateSortButtons() {
  document.querySelectorAll(".sortBtn").forEach(btn => {
    const key = btn.dataset.key;
    btn.classList.toggle("active", key === sortKey);
    if (key !== sortKey) btn.textContent = "⇅";
    else btn.textContent = sortDir === 1 ? "▲" : "▼";
  });
}

function hookSortButtons() {
  document.querySelectorAll(".sortBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      if (sortKey === key) sortDir *= -1; // inverte
      else { sortKey = key; sortDir = 1; }
      renderAll();
    });
  });
}

// ===============================
// HELPERS - datas (DD/MM/YYYY) estáveis
// ===============================
function parseBrDate(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return null;
  const [dd, mm, yyyy] = s.split("/").map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameMonthYear(dateObj, ym) {
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

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===============================
// JSONP fallback (pra evitar CORS)
// ===============================
async function fetchData() {
  setError("");

  try {
    const res = await fetch(API_URL, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_) {
    return await fetchJsonp(`${API_URL}?callback=__cb`);
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
// UI
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
  useStartReal: el("useStartReal"),
  inicioDe: el("inicioDe"),
  inicioAte: el("inicioAte"),
  startRealDe: el("startRealDe"),
  startRealAte: el("startRealAte"),
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
// NORMALIZE API DATA
// ===============================
function normalizeRows(payload) {
  console.log("PAYLOAD DA API:", payload);

  let rows = null;

  if (Array.isArray(payload)) {
    rows = payload;
  } else if (payload && payload.ok === true && Array.isArray(payload.data)) {
    rows = payload.data;
  } else if (payload && payload.ok === true && payload.data && Array.isArray(payload.data.data)) {
    rows = payload.data.data;
  } else {
    const err =
      payload?.error ||
      `Resposta inesperada da API. Esperado array ou {ok:true,data:[...]}. Tipo recebido: ${Object.prototype.toString.call(payload)}`;
    throw new Error(err);
  }

  return rows.map((r) => {
    const cliente = strNorm(r.cliente);
    const implantador = strNorm(r.implantador);
    const concluido = strNorm(r.concluido);

    const data_inicio = strNorm(r.data_inicio);
    const previsao_start = strNorm(r.previsao_start);
    const start_real = strNorm(r.start_real);
    const passado_suporte = strNorm(r.passado_suporte);
    const data_passagem_suporte = strNorm(r.data_passagem_suporte);

    const dInicio = parseBrDate(data_inicio);
    const dStartReal = parseBrDate(start_real);
    const dPrevComercial = parseBrDate(previsao_start);
    const dPassSuporte = parseBrDate(data_passagem_suporte);

    return {
      cliente,
      implantador,
      concluido,

      data_inicio,
      previsao_start,
      start_real,
      passado_suporte,
      data_passagem_suporte,

      dInicio,
      dStartReal,
      dPrevComercial,
      dPassSuporte,
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

  const monthBase = ui.fMonthBase.value; // start_real | data_inicio
  const ym = ui.fMonth.value; // YYYY-MM

  const useInicio = ui.useInicio.checked;
  const useStartReal = ui.useStartReal.checked;

  const inicioDe = ui.inicioDe.value ? new Date(ui.inicioDe.value + "T00:00:00") : null;
  const inicioAte = ui.inicioAte.value ? new Date(ui.inicioAte.value + "T23:59:59") : null;

  const srDe = ui.startRealDe.value ? new Date(ui.startRealDe.value + "T00:00:00") : null;
  const srAte = ui.startRealAte.value ? new Date(ui.startRealAte.value + "T23:59:59") : null;

  filtered = rawData.filter((r) => {
    if (imp && r.implantador !== imp) return false;
    if (st && r.concluido !== st) return false;

    if (search) {
      const hay = `${r.cliente} ${r.implantador}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    if (ym) {
      const baseDate = (monthBase === "data_inicio") ? r.dInicio : r.dStartReal;
      if (!sameMonthYear(baseDate, ym)) return false;
    }

    if (useInicio) {
      const d = r.dInicio;
      if (!d) return false;
      if (inicioDe && d < inicioDe) return false;
      if (inicioAte && d > inicioAte) return false;
    }

    if (useStartReal) {
      const d = r.dStartReal;
      if (!d) return false;
      if (srDe && d < srDe) return false;
      if (srAte && d > srAte) return false;
    }

    return true;
  });

  renderAll();
}

// ===============================
// RENDER
// ===============================
function renderAll() {
  const total = filtered.length;
  const done = filtered.filter((r) => isConcluidoSim(r.concluido)).length;
  const open = total - done;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // “Atrasadas” baseado no Start Real
  const late = filtered.filter((r) => {
    if (isConcluidoSim(r.concluido)) return false;
    if (!r.dStartReal) return false;
    return r.dStartReal < today;
  }).length;

  ui.kTotal.textContent = total;
  ui.kDone.textContent = done;
  ui.kOpen.textContent = open;
  ui.kLate.textContent = late;

  ui.countInfo.textContent = `Mostrando ${total} de ${rawData.length} registros`;

  // barras por implantador
  const map = new Map();
  for (const r of filtered) {
    const key = r.implantador || "(Sem implantador)";
    map.set(key, (map.get(key) || 0) + 1);
  }
  const arr = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const max = arr.length ? arr[0][1] : 1;

  ui.barsImplantador.innerHTML = arr.map(([name, n]) => {
    const pct = Math.round((n / max) * 100);
    return `
      <div class="barrow" title="${escapeHtml(name)}">
        <div class="name">${escapeHtml(name)}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="num">${n}</div>
      </div>
    `;
  }).join("");

  // linha do tempo
  let sorted = [...filtered];

  if (sortKey) {
    sorted.sort((a, b) => sortDir * cmp(getSortValue(a, sortKey), getSortValue(b, sortKey)));
  } else {
    // padrão: Start Real, depois início
    sorted.sort((a, b) => {
      const ap = a.dStartReal ? a.dStartReal.getTime() : Number.POSITIVE_INFINITY;
      const bp = b.dStartReal ? b.dStartReal.getTime() : Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;

      const ai = a.dInicio ? a.dInicio.getTime() : Number.POSITIVE_INFINITY;
      const bi = b.dInicio ? b.dInicio.getTime() : Number.POSITIVE_INFINITY;
      return ai - bi;
    });
  }

  updateSortButtons();

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
        <td>${escapeHtml(r.start_real || "-")}</td>
        <td>${escapeHtml(r.passado_suporte || "-")}</td>
        <td>${escapeHtml(r.data_passagem_suporte || "-")}</td>
      </tr>
    `;
  }).join("");
}

// ===============================
// INIT
// ===============================
async function init() {
  ui.lastUpdate.textContent = "Carregando dados…";
  setError("");

  try {
    const payload = await fetchData();
    rawData = normalizeRows(payload);

    ui.lastUpdate.textContent = `Atualizado: ${new Date().toLocaleString("pt-BR")}`;

    const imps = [...new Set(rawData.map(r => r.implantador).filter(Boolean))].sort();
    ui.fImplantador.innerHTML =
      `<option value="">Todos</option>` +
      imps.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");

    // ✅ ativa os botões de ordenação
    hookSortButtons();
    updateSortButtons();

    applyFilters();
  } catch (e) {
    ui.lastUpdate.textContent = "Erro ao carregar";
    setError(e.message || String(e));
  }
}

function clearFilters() {
  ui.fImplantador.value = "";
  ui.fStatus.value = "";
  ui.fMonthBase.value = "start_real";
  ui.fMonth.value = "";

  ui.useInicio.checked = true;
  ui.useStartReal.checked = true;

  ui.inicioDe.value = "";
  ui.inicioAte.value = "";
  ui.startRealDe.value = "";
  ui.startRealAte.value = "";

  ui.fSearch.value = "";

  // (opcional) resetar ordenação ao limpar filtros
  sortKey = null;
  sortDir = 1;

  applyFilters();
}

[
  ui.fImplantador, ui.fStatus, ui.fMonthBase, ui.fMonth,
  ui.useInicio, ui.useStartReal,
  ui.inicioDe, ui.inicioAte, ui.startRealDe, ui.startRealAte,
  ui.fSearch
].forEach((x) => x.addEventListener("input", applyFilters));

ui.btnRefresh.addEventListener("click", init);
ui.btnClear.addEventListener("click", clearFilters);

init();
