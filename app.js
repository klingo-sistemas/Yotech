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
// HELPERS
// ===============================
function parseBrDate(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return null;
  const [dd, mm, yyyy] = s.split("/").map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

function strNorm(s) {
  return (s ?? "").toString().trim();
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isSim(v) {
  const x = strNorm(v).toLowerCase();
  return x === "sim" || x === "true" || x === "1";
}

function isConcluidoSim(v) {
  return isSim(v);
}

function isNoStartRealText(v) {
  const x = strNorm(v).toLowerCase();
  // casa com: "sem start real", "sem previsão de start", etc.
  return (
    x.includes("sem start real") ||
    x.includes("sem previs") ||
    x.includes("sem previsão") ||
    x.includes("sem previsao") ||
    x === "" ||
    x === "-"
  );
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
  inicioDe: el("inicioDe"),
  inicioAte: el("inicioAte"),
  startRealDe: el("startRealDe"),
  startRealAte: el("startRealAte"),
  fSearch: el("fSearch"),
  onlyNoStartReal: el("onlyNoStartReal"),

  kTotal: el("kTotal"),
  kDone: el("kDone"),
  kOpen: el("kOpen"),
  kSupport: el("kSupport"),
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
  let rows = null;

  if (Array.isArray(payload)) rows = payload;
  else if (payload && payload.ok === true && Array.isArray(payload.data)) rows = payload.data;
  else if (payload && payload.ok === true && payload.data && Array.isArray(payload.data.data)) rows = payload.data.data;
  else {
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

    const dInicio = parseBrDate(data_inicio);
    const dStartReal = parseBrDate(start_real);

    // label de status (pra filtro e pra coluna)
    // regra:
    // - se passado_suporte == Sim => "Passado para suporte"
    // - senão se concluido == Sim => "Concluído"
    // - senão => "Em andamento"
    const status_label = isSim(passado_suporte)
      ? "Passado para suporte"
      : (isConcluidoSim(concluido) ? "Concluído" : "Em andamento");

    return {
      cliente,
      implantador,
      concluido,
      data_inicio,
      previsao_start,
      start_real,
      passado_suporte,

      dInicio,
      dStartReal,
      status_label,
      noStartReal: !dStartReal || isNoStartRealText(start_real),
    };
  });
}

// ===============================
// SORT
// ===============================
let sortState = { key: "start_real", dir: "asc" };

function compareAny(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

function applySort(list) {
  const { key, dir } = sortState;

  const getVal = (r) => {
    if (key === "data_inicio") return r.dInicio ? r.dInicio.getTime() : Number.POSITIVE_INFINITY;
    if (key === "start_real") return r.dStartReal ? r.dStartReal.getTime() : Number.POSITIVE_INFINITY;
    return r[key];
  };

  const mult = dir === "asc" ? 1 : -1;

  return [...list].sort((ra, rb) => {
    const va = getVal(ra);
    const vb = getVal(rb);

    // se for number (datas)
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
    return compareAny(va, vb) * mult;
  });
}

function bindSortButtons() {
  document.querySelectorAll(".sortBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key");
      if (!key) return;

      if (sortState.key === key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.dir = "asc";
      }

      document.querySelectorAll(".sortBtn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      renderAll();
    });
  });
}

// ===============================
// FILTERS
// ===============================
function applyFilters() {
  const imp = ui.fImplantador.value;
  const status = ui.fStatus.value; // suporte | concluido | andamento | ""
  const search = ui.fSearch.value.trim().toLowerCase();
  const onlyNoStartReal = ui.onlyNoStartReal.checked;

  // inputs date = YYYY-MM-DD
  const inicioDe = ui.inicioDe.value ? new Date(ui.inicioDe.value + "T00:00:00") : null;
  const inicioAte = ui.inicioAte.value ? new Date(ui.inicioAte.value + "T23:59:59") : null;

  const srDe = ui.startRealDe.value ? new Date(ui.startRealDe.value + "T00:00:00") : null;
  const srAte = ui.startRealAte.value ? new Date(ui.startRealAte.value + "T23:59:59") : null;

  filtered = rawData.filter((r) => {
    if (imp && r.implantador !== imp) return false;

    if (status) {
      if (status === "suporte" && !isSim(r.passado_suporte)) return false;
      if (status === "concluido" && !isConcluidoSim(r.concluido)) return false;
      if (status === "andamento") {
        // em andamento = não concluído e não passado p/ suporte
        if (isConcluidoSim(r.concluido)) return false;
        if (isSim(r.passado_suporte)) return false;
      }
    }

    if (onlyNoStartReal && !r.noStartReal) return false;

    if (search) {
      const hay = `${r.cliente} ${r.implantador}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    // se preencheu datas, filtra
    if (inicioDe || inicioAte) {
      const d = r.dInicio;
      if (!d) return false;
      if (inicioDe && d < inicioDe) return false;
      if (inicioAte && d > inicioAte) return false;
    }

    if (srDe || srAte) {
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
  const support = filtered.filter((r) => isSim(r.passado_suporte)).length;
  const open = total - done;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const late = filtered.filter((r) => {
    if (isConcluidoSim(r.concluido)) return false;
    if (!r.dStartReal) return false;
    return r.dStartReal < today;
  }).length;

  ui.kTotal.textContent = total;
  ui.kDone.textContent = done;
  ui.kOpen.textContent = open;
  ui.kSupport.textContent = support;
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

  // tabela (ordenada)
  const sorted = applySort(filtered);

  ui.tblBody.innerHTML = sorted.map((r) => {
    const pill = isConcluidoSim(r.concluido)
      ? `<span class="pill"><span class="dot good"></span>Concluído</span>`
      : `<span class="pill"><span class="dot warn"></span>Em andamento</span>`;

    const statusLabel = escapeHtml(r.status_label || "-");
    const passed = isSim(r.passado_suporte) ? "Sim" : (r.passado_suporte || "Não");

    return `
      <tr>
        <td>${escapeHtml(r.cliente || "-")}</td>
        <td>${escapeHtml(r.implantador || "-")}</td>
        <td>${statusLabel}</td>
        <td>${escapeHtml(r.data_inicio || "-")}</td>
        <td>${escapeHtml(r.previsao_start || "-")}</td>
        <td>${escapeHtml(r.start_real || "-")}</td>
        <td>${escapeHtml(passed || "-")}</td>
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

    // ✅ ao entrar, sem filtros => mostra todos
    applyFilters();

    // bind sort
    bindSortButtons();
  } catch (e) {
    ui.lastUpdate.textContent = "Erro ao carregar";
    setError(e.message || String(e));
  }
}

function clearFilters() {
  ui.fImplantador.value = "";
  ui.fStatus.value = "";
  ui.inicioDe.value = "";
  ui.inicioAte.value = "";
  ui.startRealDe.value = "";
  ui.startRealAte.value = "";
  ui.fSearch.value = "";
  ui.onlyNoStartReal.checked = false;

  applyFilters();
}

// listeners
[
  ui.fImplantador, ui.fStatus,
  ui.inicioDe, ui.inicioAte,
  ui.startRealDe, ui.startRealAte,
  ui.fSearch, ui.onlyNoStartReal
].forEach((x) => x.addEventListener("input", applyFilters));

ui.btnRefresh.addEventListener("click", init);
ui.btnClear.addEventListener("click", clearFilters);

init();
