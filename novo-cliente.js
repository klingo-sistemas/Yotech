const API_URL = "https://script.google.com/macros/s/AKfycbzLY6WE_XD26ql7phJ_b4VQ7pZLl-eJehG85x7gPZeOwLbqJpUYYthzvBA4x9mMqghu/exec";

const el = (id) => document.getElementById(id);

const ui = {
  form: el("formCliente"),
  spin: el("spin"),
  msgOk: el("msgOk"),
  msgErr: el("msgErr"),
  cliente: el("cliente"),
  implantador: el("implantador"),
  comercial: el("comercial"),
  tamanho_cliente: el("tamanho_cliente"),
};

function showOk(html) {
  ui.msgErr.style.display = "none";
  ui.msgErr.textContent = "";
  ui.msgOk.style.display = "block";
  ui.msgOk.innerHTML = html;
}

function showErr(text) {
  ui.msgOk.style.display = "none";
  ui.msgOk.textContent = "";
  ui.msgErr.style.display = "block";
  ui.msgErr.textContent = text;
}

async function postJson(data) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const txt = await res.text();
    return JSON.parse(txt);
  } catch (_) {
    const qs = new URLSearchParams();
    qs.set("action", "createClient");
    qs.set("payload", JSON.stringify(data));
    const url = `${API_URL}?${qs.toString()}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Falha ao chamar API (GET fallback).");
    return await res.json();
  }
}

function collect() {
  return {
    action: "createClient",
    cliente: (ui.cliente.value || "").trim(),
    implantador: (ui.implantador.value || "").trim(),
    comercial: (ui.comercial.value || "").trim(),
    tamanho_cliente: (ui.tamanho_cliente.value || "").trim(),
    concluido: "Não",
    data_inicio: "",
    previsao_start: "",
    start_real: "",
    passado_suporte: "",
    data_passagem_suporte: "",
    obs: "",
  };
}

async function onSubmit(ev) {
  ev.preventDefault();

  ui.msgOk.style.display = "none";
  ui.msgErr.style.display = "none";

  const data = collect();

  if (!data.cliente) return showErr("Informe o nome do cliente.");
  if (!data.implantador) return showErr("Selecione o implantador.");

  ui.spin.style.display = "inline";

  try {
    const resp = await postJson(data);

    if (!resp || resp.ok !== true) {
      throw new Error(resp?.error || "Erro inesperado ao criar cliente.");
    }

    showOk(`
      ✅ <b>Cliente criado com sucesso!</b><br>
      📁 <a href="${resp.pasta_url}" target="_blank" style="color:#22c55e;font-weight:700;text-decoration:none">
        Abrir pasta no Drive
      </a><br>
      <span style="opacity:.85">Linha na planilha: ${resp.linha ?? "-"}</span>
    `);
  } catch (err) {
    showErr(String(err.message || err));
  } finally {
    ui.spin.style.display = "none";
  }
}

if (ui.btnSalvar) {
  ui.btnSalvar.addEventListener("click", onSubmit);
} else {
  console.error("btnSalvar não encontrado no HTML");
}
