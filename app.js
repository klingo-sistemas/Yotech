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

// ===============================
// FETCH
// ===============================
async function fetchData() {
  const res = await fetch(API_URL);
  return await res.json();
}

// ===============================
// UI
// ===============================
const el = (id) => document.getElementById(id);

const ui = {
  fImplantador: el("fImplantador"),
  fStatus: el("fStatus"),
  inicioDe: el("inicioDe"),
  inicioAte: el("inicioAte"),
  startRealDe: el("startRealDe"),
  startRealAte: el("startRealAte"),
  fSearch: el("fSearch"),
  onlyNoStartReal: el("onlyNoStartReal"),
  showSuspensos: el("showSuspensos"),

  kTotal: el("kTotal"),
  kDone: el("kDone"),
  kOpen: el("kOpen"),
  kSupport: el("kSupport"),
  kLate: el("kLate"),
  countInfo: el("countInfo"),

  barsImplantador: el("barsImplantador"),
  tblBody: el("tblBody"),
};

// ===============================
// NORMALIZE
// ===============================
function normalizeRows(rows) {
  return rows.map(r => {

    const dInicio = parseBrDate(r.data_inicio);
    const dStartReal = parseBrDate(r.start_real);

    let status_label = "Em andamento";

    if (isSuspenso(r.concluido)) {
      status_label = "Suspenso";
    } else if (isSim(r.passado_suporte)) {
      status_label = "Passado para suporte";
    } else if (isSim(r.concluido)) {
      status_label = "Concluído";
    }

    return {
      ...r,
      dInicio,
      dStartReal,
      status_label,
    };
  });
}

// ===============================
// FILTERS
// ===============================
function applyFilters() {

  const imp = ui.fImplantador.value;
  const status = ui.fStatus.value;
  const search = ui.fSearch.value.toLowerCase();
  const onlyNoStartReal = ui.onlyNoStartReal.checked;
  const showSuspensos = ui.showSuspensos.checked;

  filtered = rawData.filter(r => {

    if (!showSuspensos && isSuspenso(r.concluido)) return false;

    if (imp && r.implantador !== imp) return false;

    if (status) {
      if (status === "suporte" && r.status_label !== "Passado para suporte") return false;
      if (status === "concluido" && r.status_label !== "Concluído") return false;
      if (status === "andamento" && r.status_label !== "Em andamento") return false;
      if (status === "suspenso" && r.status_label !== "Suspenso") return false;
    }

    if (onlyNoStartReal && r.dStartReal) return false;

    if (search && !r.cliente.toLowerCase().includes(search)) return false;

    return true;
  });

  renderAll();
}

// ===============================
// RENDER
// ===============================
function renderAll() {

  ui.kTotal.textContent = filtered.length;
  ui.kDone.textContent = filtered.filter(r => r.status_label === "Concluído").length;
  ui.kOpen.textContent = filtered.filter(r => r.status_label === "Em andamento").length;
  ui.kSupport.textContent = filtered.filter(r => r.status_label === "Passado para suporte").length;

  ui.tblBody.innerHTML = filtered.map(r => {

    const termoIcon = isSim(r.termo_encerramento) ? "✅" : "⬜";
    const emailIcon = isSim(r.email_enviado) ? "📧✅" : "📧⬜";

    const linkBtn = r.link_base
      ? `<a href="${escapeHtml(r.link_base)}" target="_blank" title="${escapeHtml(r.link_base)}">🔗</a>`
      : "-";

    return `
      <tr>
        <td>${escapeHtml(r.cliente)}</td>
        <td>${escapeHtml(r.implantador)}</td>
        <td>${escapeHtml(r.status_label)}</td>
        <td>${escapeHtml(r.data_inicio)}</td>
        <td>${escapeHtml(r.previsao_start)}</td>
        <td>${escapeHtml(r.start_real)}</td>
        <td style="text-align:center">${termoIcon}</td>
        <td>${escapeHtml(r.passado_suporte)}</td>
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
  const payload = await fetchData();
  rawData = normalizeRows(payload.data || payload);
  applyFilters();
}

[
  ui.fImplantador,
  ui.fStatus,
  ui.fSearch,
  ui.onlyNoStartReal,
  ui.showSuspensos
].forEach(x => x.addEventListener("input", applyFilters));

init();
