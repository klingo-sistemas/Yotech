// Cole aqui a URL do seu Apps Script Web App (a que termina com /exec)
const API_URL = "https://script.google.com/macros/s/SEU_ID/exec";

let chart = null;

function setDefaultDateRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  document.querySelector("#dtIni").value = `${y}-${m}-01`;
  document.querySelector("#dtFim").value = `${y}-${m}-31`;
}

async function fetchData() {
  const dtIni = document.querySelector("#dtIni").value || "";
  const dtFim = document.querySelector("#dtFim").value || "";

  const url = new URL(API_URL);
  if (dtIni) url.searchParams.set("start", dtIni);
  if (dtFim) url.searchParams.set("end", dtFim);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();

  if (!json.ok) {
    throw new Error(json.error || "Erro na API");
  }
  return json.data || [];
}

function renderTable(rows) {
  const tbody = document.querySelector("#tbody");
  tbody.innerHTML = "";

  rows
    .sort((a,b) => (a.inicio_iso || "").localeCompare(b.inicio_iso || ""))
    .forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.cliente || "")}</td>
        <td>${escapeHtml(r.data_inicio || "")}</td>
        <td>${escapeHtml(r.previsao_start || "")}</td>
      `;
      tbody.appendChild(tr);
    });
}

function renderSummary(rows) {
  document.querySelector("#resumo").textContent =
    `Total no período: ${rows.length} cliente(s).`;
}

function renderChart(rows) {
  const counts = {};
  rows.forEach(r => {
    const iso = r.inicio_iso; // yyyy-mm-dd
    if (!iso) return;
    const key = iso.slice(0, 7); // yyyy-mm
    counts[key] = (counts[key] || 0) + 1;
  });

  const labels = Object.keys(counts).sort();
  const data = labels.map(k => counts[k]);

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("chartMes"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Inícios", data }] },
    options: { responsive: true }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

async function apply() {
  try {
    const rows = await fetchData();
    renderSummary(rows);
    renderTable(rows);
    renderChart(rows);
  } catch (e) {
    console.error(e);
    alert("Erro ao carregar: " + e.message);
  }
}

document.querySelector("#btnFiltrar").addEventListener("click", apply);

setDefaultDateRange();
apply();

