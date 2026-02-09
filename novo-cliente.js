// AJUSTE: mesma URL do seu Apps Script
const API_URL = "https://script.google.com/macros/s/AKfycbzLY6WE_XD26ql7phJ_b4VQ7pZLl-eJehG85x7gPZeOwLbqJpUYYthzvBA4x9mMqghu/exec";

const el = (id) => document.getElementById(id);

const ui = {
  btnSalvar: el("btnSalvar"),
  spin: el("spin"),
  form: el("formCliente"),
  msgOk: el("msgOk"),
  msgErr: el("msgErr"),

  cliente: el("cliente"),
  implantador: el("implantador"),
  data_inicio: el("data_inicio"),
  previsao_start: el("previsao_start"),
  start_real: el("start_real"),
  passado_suporte: el("passado_suporte"),
  data_passagem_suporte: el("data_passagem_suporte"),
  concluido: el("concluido"),
  obs: el("obs"),
};

function showOk(text) {
  ui.msgErr.style.display = "none";
  ui.msgErr.textContent = "";
  ui.msgOk.style.display = "block";
  ui.msgOk.textContent = text;
}

function showErr(text) {
  ui.msgOk.style.display = "none";
  ui.msgOk.textContent = "";
  ui.msgErr.style.display = "block";
  ui.msgErr.textContent = text;
}

function toBrDate(iso) {
  if (!iso) return "";
  // iso: yyyy-mm-dd
  const [y,m,d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

async function postJson(data) {
  // Apps Script published web app aceita POST, mas CORS pode bloquear.
  // Então fazemos JSONP-like via querystring (GET) como fallback.
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const txt = await res.text();
    // alguns deployments devolvem text/plain
    const json = JSON.parse(txt);
    return json;
  } catch (e) {
    // fallback GET (menos bonito, mas funciona em GitHub Pages)
    const qs = new URLSearchParams();
    qs.set("action", "createClient");
    qs.set("payload", JSON.stringify(data));
    const url = `${API_URL}?${qs.toString()}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Falha no fallback GET");
    return await res.json();
  }
}

function collect() {
  return {
    action: "createClient",
    cliente: ui.cliente.value.trim(),
    implantador: ui.implantador.value.trim(),
    concluido: ui.concluido.value.trim(),

    data_inicio: toBrDate(ui.data_inicio.value),
    previsao_start: toBrDate(ui.previsao_start.value),
    start_real: toBrDate(ui.start_real.value),

    passado_suporte: ui.passado_suporte.value.trim(),
    data_passagem_suporte: toBrDate(ui.data_passagem_suporte.value),

    obs: ui.obs.value.trim(),
  };
}

async function onSave(ev) {
  ev?.preventDefault?.();

  ui.msgOk.style.display = "none";
  ui.msgErr.style.display = "none";

  const data = collect();

  if (!data.cliente) return showErr("Informe o nome do cliente.");
  if (!data.implantador) return showErr("Selecione o implantador.");

  ui.btnSalvar.disabled = true;
  ui.spin.style.display = "inline";

  try {
    const resp = await postJson(data);

    if (!resp || resp.ok !== true) {
      throw new Error(resp?.error || "Erro inesperado ao salvar.");
    }

    let msg = "Cliente salvo com sucesso!\n";
    if (resp.pasta_url) msg += `Pasta: ${resp.pasta_url}\n`;
    if (resp.linha) msg += `Linha/ID: ${resp.linha}\n`;

    showOk(msg);

    // opcional: limpar form
    // ui.form.reset();
  } catch (err) {
    showErr(String(err.message || err));
  } finally {
    ui.btnSalvar.disabled = false;
    ui.spin.style.display = "none";
  }
}

ui.btnSalvar.addEventListener("click", onSave);
ui.form.addEventListener("submit", onSave);
