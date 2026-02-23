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
  return strNorm(v).toLowerCase() === "sim";
}

function isSuspenso(v) {
  return strNorm(v).toLowerCase() === "suspenso";
}

function isNoStartRealText(v) {
  const x = strNorm(v).toLowerCase();
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
  onlyTermoSim: el("onlyTermoSim"),
  showSuspensos: el("showSuspensos"),

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
  if (!ui.errBox) return;
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

    const concluido = strNorm(r.concluido); // Sim / Não / Suspenso

    const data_inicio = strNorm(r.data_inicio);
    const previsao_start = strNorm(r.previsao_start);
    const start_real = strNorm(r.start_real);
    const passado_suporte = strNorm(r.passado_suporte);

    const termo_encerramento = strNorm(r.termo_encerramento);
    const comercial = strNorm(r.comercial);
    const tamanho_cliente = strNorm(r.tamanho_cliente);
    const link_base = strNorm(r.link_base);
    const email_enviado = strNorm(r.email_enviado);

    const dInicio = parseBrDate(data_inicio);
    const dStartReal = parseBrDate(start_real);

    let status_label = "Em andamento";
    if (isSuspenso(concluido)) status_label = "Suspenso";
    else if (isSim(passado_suporte)) status_label = "Passado para suporte";
    else if (isSim(concluido)) status_label = "Concluído";

    return {
      cliente,
      implantador,
      concluido,
      data_inicio,
      previsao_start,
      start_real,
      passado_suporte,

      termo_encerramento,
      comercial,
      tamanho_cliente,
      link_base,
      email_enviado,

      dInicio,
      dStartReal,
      status_label,
      noStartReal: !dStartReal || isNoStartRealText(start_real),
    };
  });
}

// ===============================
// FILTERS
// ===============================
function applyFilters() {
  const imp = ui.fImplantador.value;
  const status = ui.fStatus.value;
  const search = ui.fSearch.value.trim().toLowerCase();

  const onlyNoStartReal = ui.onlyNoStartReal.checked;
  const onlyTermoSim = ui.onlyTermoSim.checked;
  const showSuspensos = ui.showSuspensos.checked;

  const inicioDe = ui.inicioDe.value ? new Date(ui.inicioDe.value + "T00:00:00") : null;
  const inicioAte = ui.inicioAte.value ? new Date(ui.inicioAte.value + "T23:59:59") : null;

  const srDe = ui.startRealDe.value ? new Date(ui.startRealDe.value + "T00:00:00") : null;
  const srAte = ui.startRealAte.value ? new Date(ui.startRealAte.value + "T23:59:59") : null;

  filtered = rawData.filter((r) => {
    // Suspensos: só mostra se checkbox estiver ligado
    if (!showSuspensos && isSuspenso(r.concluido)) return false;

    if (imp && r.implantador !== imp) return false;

    if (status) {
      if (status === "suporte" && r.status_label !== "Passado para suporte") return false;
      if (status === "concluido" && r.status_label !== "Concluído") return false;
      if (status === "andamento" && r.status_label !== "Em andamento") return false;
      if (status === "suspenso" && r.status_label !== "Suspenso") return false;
    }

    if (onlyNoStartReal && !r.noStartReal) return false;
    if (onlyTermoSim && !isSim(r.termo_encerramento)) return false;

    if (search) {
      const hay = `${r.cliente} ${r.implantador}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

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

  const done = filtered.filter((r) => r.status_label === "Concluído").length;
  const support = filtered.filter((r) => r.status_label === "Passado para suporte").length;
  const open = filtered.filter((r) => r.status_label === "Em andamento").length;

  ui.kTotal.textContent = total;
  ui.kDone.textContent = done;
  ui.kOpen.textContent = open;
  ui.kSupport.textContent = support;

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

  // tabela
  ui.tblBody.innerHTML = filtered.map((r) => {
    const termoIcon = isSim(r.termo_encerramento) ? "✅" : "⬜";
    const emailIcon = isSim(r.email_enviado) ? "📧✅" : "📧⬜";

    const linkBtn = r.link_base
      ? `<a href="${escapeHtml(r.link_base)}" target="_blank" title="${escapeHtml(r.link_base)}">🔗</a>`
      : "-";

    const passed = isSim(r.passado_suporte) ? "Sim" : (r.passado_suporte || "Não");

    return `
      <tr>
        <td>${escapeHtml(r.cliente || "-")}</td>
        <td>${escapeHtml(r.implantador || "-")}</td>
        <td>${escapeHtml(r.status_label || "-")}</td>
        <td>${escapeHtml(r.data_inicio || "-")}</td>
        <td>${escapeHtml(r.previsao_start || "-")}</td>
        <td>${escapeHtml(r.start_real || "-")}</td>

        <td style="text-align:center">${termoIcon}</td>
        <td>${escapeHtml(passed || "-")}</td>
        <td>${escapeHtml(r.comercial || "-")}</td>
        <td style="text-align:center">${escapeHtml(r.tamanho_cliente || "-")}</td>
        <td style="text-align:center">${linkBtn}</td>
        <td style="text-align:center">${emailIcon}</td>
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

    // ✅ POPULA IMPLANTADORES (corrige "só Todos")
    const imps = [...new Set(rawData.map(r => (r.implantador || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

    ui.fImplantador.innerHTML =
      `<option value="">Todos</option>` +
      imps.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");

    applyFilters();
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
  ui.onlyTermoSim.checked = false;
  ui.showSuspensos.checked = false; // ✅ padrão OFF

  applyFilters();
}

// listeners
[
  ui.fImplantador, ui.fStatus,
  ui.inicioDe, ui.inicioAte,
  ui.startRealDe, ui.startRealAte,
  ui.fSearch, ui.onlyNoStartReal,
  ui.onlyTermoSim, ui.showSuspensos
].forEach((x) => x.addEventListener("input", applyFilters));

ui.btnRefresh.addEventListener("click", init);
ui.btnClear.addEventListener("click", clearFilters);

init();
