// ============================================================
//  Corte Dú Amigo — agenda.js
//  Fluxo do cliente: serviço → dia/horário → confirmar.
//  Disponibilidade vem da RPC horarios_ocupados (sem PII);
//  o insert vai pela Edge Function criar-agendamento.
// ============================================================
import {
  supabase, SUPABASE_ANON_KEY, EF_CRIAR_AGENDAMENTO,
  TZ_OFFSET, SLOT_STEP_MIN, DIAS_A_FRENTE, POLL_MS,
} from "./supabase.js";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const state = {
  servicos: [],
  horarios: {},     // dia_semana -> { abre:"09:00:00", fecha:"19:30:00" }
  servico: null,
  dia: null,        // "YYYY-MM-DD"
  slot: null,       // { hm, inicioISO }
  ocupados: [],     // [{ inicio:ms, fim:ms }]
  agendamento: null,
};

// ---------- helpers de data (math por data pura, estável) ----------
const el = (id) => document.getElementById(id);
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hmToMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const minToHM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function addDias(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function dowOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function ddmm(iso) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }

// ---------- toast ----------
let toastT;
function toast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 4200);
}

// ---------- stepper / navegação ----------
function setStep(n) {
  ["s1", "s2", "s3"].forEach((id, i) => el(id).classList.toggle("show", i + 1 <= n));
  [1, 2, 3].forEach((i) => {
    const li = el(`step-${i}`);
    li.classList.toggle("active", i === n);
    li.classList.toggle("done", i < n);
  });
  if (n > 1) el(`s${n}`).scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- carregar dados ----------
async function carregar() {
  const [serv, hora] = await Promise.all([
    supabase.from("servicos").select("*").eq("ativo", true).order("preco"),
    supabase.from("horarios_funcionamento").select("*").eq("ativo", true),
  ]);
  if (serv.error || hora.error) { toast("Não consegui carregar a barbearia. Recarregue a página."); return; }

  state.servicos = serv.data ?? [];
  (hora.data ?? []).forEach((h) => { state.horarios[h.dia_semana] = { abre: h.abre, fecha: h.fecha }; });

  renderServicos();
  renderDias();
}

// ---------- serviços ----------
function renderServicos() {
  const box = el("servicos");
  if (!state.servicos.length) { box.innerHTML = `<p class="slots-vazio">Nenhum serviço disponível no momento.</p>`; return; }
  box.innerHTML = "";
  state.servicos.forEach((s) => {
    const b = document.createElement("button");
    b.className = "servico";
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    const img = s.imagem_url
      ? `<img class="servico-img" src="${s.imagem_url}" alt="">`
      : `<span class="servico-img" aria-hidden="true">${s.nome.trim()[0] ?? "✂"}</span>`;
    b.innerHTML = `
      ${img}
      <span class="servico-info">
        <strong>${s.nome}</strong>
        <span class="servico-meta">${s.duracao_min} min</span>
      </span>
      <span class="servico-preco">${brl(Number(s.preco))}</span>`;
    b.addEventListener("click", () => escolherServico(s, b));
    box.appendChild(b);
  });
}
function escolherServico(s, btn) {
  state.servico = s;
  state.slot = null;
  document.querySelectorAll(".servico").forEach((x) => x.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
  setStep(2);
  if (!state.dia) { const d = el("dias").querySelector(".dia"); if (d) d.click(); }
  else loadSlots();
}

// ---------- dias ----------
function renderDias() {
  const box = el("dias");
  box.innerHTML = "";
  let iso = hojeSP(), mostrados = 0, tentativas = 0;
  while (mostrados < DIAS_A_FRENTE && tentativas < 40) {
    if (state.horarios[dowOf(iso)]) {
      const cur = iso;
      const b = document.createElement("button");
      b.className = "dia";
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = `<small>${DOW[dowOf(cur)]}</small><b>${cur.split("-")[2]}</b>`;
      b.addEventListener("click", () => escolherDia(cur, b));
      box.appendChild(b);
      mostrados++;
    }
    iso = addDias(iso, 1); tentativas++;
  }
  if (!mostrados) box.innerHTML = `<p class="slots-vazio">Sem horário de funcionamento cadastrado.</p>`;
}
function escolherDia(iso, btn) {
  state.dia = iso;
  state.slot = null;
  document.querySelectorAll(".dia").forEach((x) => x.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
  loadSlots();
}

// ---------- horários ----------
async function loadSlots() {
  if (!state.servico || !state.dia) return;
  const vazio = el("slots-vazio");
  vazio.textContent = "Carregando horários…";
  el("slots").innerHTML = "";

  const { data, error } = await supabase.rpc("horarios_ocupados", { dia: state.dia });
  if (error) { vazio.textContent = "Não consegui carregar os horários. Tente de novo."; return; }
  state.ocupados = (data ?? []).map((o) => ({ inicio: +new Date(o.inicio), fim: +new Date(o.fim) }));
  renderSlots();
}
function gerarSlots() {
  const janela = state.horarios[dowOf(state.dia)];
  if (!janela) return [];
  const dur = state.servico.duracao_min;
  const abre = hmToMin(janela.abre), fecha = hmToMin(janela.fecha);
  const agora = Date.now();
  const out = [];
  for (let t = abre; t + dur <= fecha; t += SLOT_STEP_MIN) {
    const hm = minToHM(t);
    const inicioISO = `${state.dia}T${hm}:00${TZ_OFFSET}`;
    const ini = +new Date(inicioISO), fim = ini + dur * 60000;
    const ocupado = state.ocupados.some((o) => ini < o.fim && fim > o.inicio);
    out.push({ hm, inicioISO, disponivel: ini > agora && !ocupado });
  }
  return out;
}
function renderSlots() {
  const box = el("slots");
  const vazio = el("slots-vazio");
  const slots = gerarSlots();
  const livres = slots.filter((s) => s.disponivel).length;
  box.innerHTML = "";
  if (!slots.length) { vazio.textContent = "A barbearia está fechada nesse dia."; return; }
  if (!livres) { vazio.textContent = "Esse dia está cheio — escolha outro."; }
  else { vazio.textContent = ""; }

  slots.forEach((s) => {
    const b = document.createElement("button");
    b.className = "slot";
    b.type = "button";
    b.textContent = s.hm;
    b.disabled = !s.disponivel;
    if (s.disponivel) {
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => escolherSlot(s, b));
    } else {
      b.setAttribute("aria-label", `${s.hm} — ocupado`);
    }
    box.appendChild(b);
  });
}
function escolherSlot(s, btn) {
  state.slot = s;
  document.querySelectorAll(".slot").forEach((x) => x.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
  el("r-servico").textContent = state.servico.nome;
  el("r-preco").textContent = `${brl(Number(state.servico.preco))} · pago na barbearia`;
  el("r-horario").textContent = `${DOW[dowOf(state.dia)]}, ${ddmm(state.dia)} às ${s.hm}`;
  setStep(3);
}

// ---------- confirmar (via Edge Function) ----------
async function confirmar() {
  const nome = el("f-nome").value.trim();
  const whats = el("f-whats").value.replace(/\D/g, "");
  if (nome.length < 2) return toast("Escreva seu nome para confirmar.");
  if (whats.length < 10 || whats.length > 13) return toast("Confira o número de WhatsApp (com DDD).");
  if (!state.servico || !state.slot) return toast("Escolha o serviço e o horário.");

  const btn = el("btn-confirmar");
  btn.disabled = true; btn.textContent = "Confirmando…";
  try {
    const res = await fetch(EF_CRIAR_AGENDAMENTO, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        servico_id: state.servico.id,
        cliente_nome: nome,
        cliente_whatsapp: whats,
        inicio: state.slot.inicioISO,
      }),
    });
    const out = await res.json().catch(() => ({ ok: false }));
    if (!out.ok) {
      toast(out.message || "Não foi possível confirmar. Tente de novo.");
      if (out.code === "slot_ocupado" || out.code === "fora_horario") { await loadSlots(); setStep(2); }
      return;
    }
    state.agendamento = out.agendamento;
    mostrarSucesso(nome);
  } catch {
    toast("Sem conexão com o servidor. Tente de novo.");
  } finally {
    btn.disabled = false; btn.textContent = "Confirmar horário";
  }
}

// ---------- sucesso + avaliação ----------
function mostrarSucesso(nome) {
  el("suc-nome").textContent = nome.split(" ")[0];
  el("suc-horario").textContent = `${DOW[dowOf(state.dia)]}, ${ddmm(state.dia)} às ${state.slot.hm}`;
  el("suc-servico").textContent = `${state.servico.nome} · ${brl(Number(state.servico.preco))} na barbearia`;
  document.querySelectorAll(".step, .stepper, .hero").forEach((x) => (x.style.display = "none"));
  el("sucesso").classList.add("show");
  el("sucesso").scrollIntoView({ behavior: "smooth", block: "start" });
}

// avaliação interna (oferecida a todos; o botão do Google também)
let notaEscolhida = 0;
function initEstrelas() {
  document.querySelectorAll(".estrela").forEach((star) => {
    star.addEventListener("click", () => {
      notaEscolhida = Number(star.dataset.n);
      document.querySelectorAll(".estrela").forEach((s) =>
        s.classList.toggle("on", Number(s.dataset.n) <= notaEscolhida));
    });
  });
}
async function enviarFeedback() {
  if (!notaEscolhida) return toast("Toque nas estrelas para dar sua nota.");
  const btn = el("btn-feedback");
  btn.disabled = true;
  const { error } = await supabase.from("avaliacoes").insert({
    nota: notaEscolhida,
    comentario: el("f-comentario").value.trim() || null,
    agendamento_id: state.agendamento?.id ?? null,
  });
  if (error) { toast("Não consegui enviar o feedback."); btn.disabled = false; return; }
  el("review-form").innerHTML = `<p class="destaque">Valeu pelo feedback! 🙌</p>`;
}

// ---------- polling: mantém a disponibilidade fresca ----------
function initPolling() {
  setInterval(() => {
    if (el("s2").classList.contains("show") && state.servico && state.dia) loadSlots();
  }, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && el("s2").classList.contains("show")) loadSlots();
  });
}

// ---------- boot ----------
window.addEventListener("DOMContentLoaded", () => {
  el("btn-confirmar").addEventListener("click", confirmar);
  el("btn-feedback").addEventListener("click", enviarFeedback);
  initEstrelas();
  initPolling();
  carregar();
});
