// ============================================================
//  Corte Dú Amigo — admin.js  (Painel do Duin)
//  Login por e-mail/senha (Supabase Auth). Autenticado, o mesmo
//  client passa a agir como "admin" nas policies (authenticated).
// ============================================================
import { supabase } from "../../assets/js/supabase.js";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const el = (id) => document.getElementById(id);
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const state = { agenda: [], servicos: [], bloqueios: [], avaliacoes: [], editandoAg: null, editandoServ: null };

// ---------- datas em America/Sao_Paulo ----------
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const spDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const fmtHora = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtDH = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const inicioDoDiaSP = () => new Date(`${hojeSP()}T00:00:00-03:00`).toISOString();
const toISOLocal = (v) => (v ? `${v}:00-03:00` : null); // v = "YYYY-MM-DDTHH:MM"

function labelDia(key) {
  if (key === hojeSP()) return "Hoje";
  if (key === spDate(new Date(Date.now() + 86400000))) return "Amanhã";
  const [y, m, d] = key.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
function whatsLink(num) {
  const d = String(num).replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("55") ? d : "55" + d}`;
}

// ---------- toast ----------
let toastT;
function toast(msg) {
  const t = el("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 4000);
}

// ============================================================
//  AUTH
// ============================================================
async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) mostrarPainel(); else mostrarLogin();
}
async function login() {
  const email = el("login-email").value.trim();
  const senha = el("login-senha").value;
  el("login-erro").textContent = "";
  if (!email || !senha) { el("login-erro").textContent = "Preencha e-mail e senha."; return; }
  const btn = el("btn-login"); btn.disabled = true; btn.textContent = "Entrando…";
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  btn.disabled = false; btn.textContent = "Entrar";
  if (error) { el("login-erro").textContent = "E-mail ou senha inválidos."; return; }
  mostrarPainel();
}
async function sair() { await supabase.auth.signOut(); mostrarLogin(); }
function mostrarLogin() { el("login").style.display = ""; el("painel").style.display = "none"; }
function mostrarPainel() { el("login").style.display = "none"; el("painel").style.display = ""; abrirTab("dashboard"); carregarTudo(); }

// ============================================================
//  TABS
// ============================================================
function abrirTab(nome) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === nome));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("show", p.id === `tab-${nome}`));
}

// ============================================================
//  CARREGAR DADOS
// ============================================================
async function carregarTudo() { await Promise.all([carregarAgenda(), carregarServicos(), carregarBloqueios(), carregarAvaliacoes()]); }

async function carregarAgenda() {
  const { data, error } = await supabase.from("agendamentos")
    .select("id, cliente_nome, cliente_whatsapp, inicio, fim, status, servico_id, servicos(nome, preco, duracao_min)")
    .gte("inicio", inicioDoDiaSP()).neq("status", "cancelado").order("inicio");
  if (error) { toast("Erro ao carregar a agenda."); return; }
  state.agenda = data ?? [];
  renderDashboard(); renderAgenda();
}
async function carregarServicos() {
  const { data, error } = await supabase.from("servicos").select("*").order("nome");
  if (error) { toast("Erro ao carregar serviços."); return; }
  state.servicos = data ?? []; renderServicos();
}
async function carregarBloqueios() {
  const { data } = await supabase.from("bloqueios").select("*").gte("fim", new Date().toISOString()).order("inicio");
  state.bloqueios = data ?? []; renderPausas();
}
async function carregarAvaliacoes() {
  const { data } = await supabase.from("avaliacoes").select("nota, comentario, criado_em").order("criado_em", { ascending: false }).limit(5);
  state.avaliacoes = data ?? []; renderDashboard();
}

// ============================================================
//  DASHBOARD
// ============================================================
function renderDashboard() {
  const hoje = state.agenda.filter((a) => spDate(a.inicio) === hojeSP()).length;
  const semana = state.agenda.filter((a) => +new Date(a.inicio) < Date.now() + 7 * 86400000).length;
  const prox = state.agenda.find((a) => a.status !== "concluido" && +new Date(a.inicio) > Date.now());
  el("m-hoje").textContent = hoje;
  el("m-semana").textContent = semana;
  el("m-proximo").textContent = prox ? `${prox.cliente_nome} · ${fmtDH(prox.inicio)}` : "Nenhum agendado";

  const prox5 = state.agenda.filter((a) => +new Date(a.inicio) > Date.now()).slice(0, 5);
  el("dash-proximos").innerHTML = prox5.length
    ? prox5.map((a) => `<div class="item"><div class="item-topo"><span class="item-cliente">${a.cliente_nome}</span><span class="item-hora" style="font-size:1rem">${fmtDH(a.inicio)}</span></div><div class="item-sub">${a.servicos?.nome ?? "—"}</div></div>`).join("")
    : `<p class="vazio">Sem próximos agendamentos.</p>`;

  el("dash-avaliacoes").innerHTML = state.avaliacoes.length
    ? state.avaliacoes.map((v) => `<div class="item"><div class="item-topo"><span>${"★".repeat(v.nota)}<span style="color:var(--line)">${"★".repeat(5 - v.nota)}</span></span></div>${v.comentario ? `<div class="item-sub">"${v.comentario}"</div>` : ""}</div>`).join("")
    : `<p class="vazio">Nenhuma avaliação ainda.</p>`;
}

// ============================================================
//  AGENDA (concluir / cancelar / reagendar)
// ============================================================
function renderAgenda() {
  const box = el("ag-lista");
  const futuros = state.agenda;
  if (!futuros.length) { box.innerHTML = `<p class="vazio">Nenhum agendamento a partir de hoje.</p>`; return; }

  const grupos = {};
  futuros.forEach((a) => { (grupos[spDate(a.inicio)] ||= []).push(a); });

  box.innerHTML = "";
  Object.keys(grupos).sort().forEach((dia) => {
    const g = document.createElement("div");
    g.className = "dia-grupo";
    g.innerHTML = `<h3>${labelDia(dia)}</h3>`;
    grupos[dia].forEach((a) => g.appendChild(itemAgenda(a)));
    box.appendChild(g);
  });
}
function itemAgenda(a) {
  const div = document.createElement("div");
  div.className = "item";
  const badge = `<span class="badge ${a.status}">${a.status === "concluido" ? "concluído" : "confirmado"}</span>`;
  div.innerHTML = `
    <div class="item-topo">
      <span class="item-hora">${fmtHora(a.inicio)}</span>${badge}
    </div>
    <div class="item-cliente">${a.cliente_nome}</div>
    <div class="item-sub">${a.servicos?.nome ?? "—"} · ${brl(a.servicos?.preco ?? 0)}</div>`;

  if (state.editandoAg === a.id) {
    const box = document.createElement("div");
    box.className = "reagendar";
    const input = document.createElement("input");
    input.type = "datetime-local";
    const salvar = botao("Salvar", "mini", () => salvarReagendamento(a, input.value));
    const cancelar = botao("Voltar", "mini", () => { state.editandoAg = null; renderAgenda(); });
    box.append(input, salvar, cancelar);
    div.appendChild(box);
  } else {
    const acoes = document.createElement("div");
    acoes.className = "item-acoes";
    const zap = document.createElement("a");
    zap.className = "mini zap"; zap.href = whatsLink(a.cliente_whatsapp); zap.target = "_blank"; zap.rel = "noopener";
    zap.textContent = "WhatsApp";
    acoes.appendChild(zap);
    if (a.status !== "concluido") {
      acoes.appendChild(botao("Concluir", "mini", () => atualizarStatus(a.id, "concluido")));
      acoes.appendChild(botao("Reagendar", "mini", () => { state.editandoAg = a.id; renderAgenda(); }));
      acoes.appendChild(botao("Cancelar", "mini perigo", () => cancelar(a.id)));
    }
    div.appendChild(acoes);
  }
  return div;
}
function botao(txt, cls, onClick) { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = txt; b.addEventListener("click", onClick); return b; }

async function atualizarStatus(id, status) {
  const { error } = await supabase.from("agendamentos").update({ status }).eq("id", id);
  if (error) { toast("Não foi possível atualizar."); return; }
  toast(status === "concluido" ? "Marcado como concluído." : "Atualizado.");
  carregarAgenda();
}
async function cancelar(id) {
  if (!confirm("Cancelar este agendamento? O horário fica livre de novo.")) return;
  const { error } = await supabase.from("agendamentos").update({ status: "cancelado" }).eq("id", id);
  if (error) { toast("Não foi possível cancelar."); return; }
  toast("Agendamento cancelado."); carregarAgenda();
}
async function salvarReagendamento(a, valor) {
  const iso = toISOLocal(valor);
  if (!iso) return toast("Escolha a nova data e hora.");
  const inicio = new Date(iso);
  const fim = new Date(inicio.getTime() + (a.servicos?.duracao_min ?? 30) * 60000);
  const { error } = await supabase.from("agendamentos").update({ inicio: inicio.toISOString(), fim: fim.toISOString() }).eq("id", a.id);
  if (error) {
    if (error.code === "23P01" || /sobreposicao|exclus/i.test(error.message)) toast("Já tem alguém nesse horário.");
    else toast("Não foi possível reagendar.");
    return;
  }
  state.editandoAg = null; toast("Horário remarcado."); carregarAgenda();
}

// ============================================================
//  SERVIÇOS (CRUD + upload de foto)
// ============================================================
function renderServicos() {
  const box = el("serv-grid");
  if (!state.servicos.length) { box.innerHTML = `<p class="vazio">Nenhum serviço cadastrado. Crie o primeiro.</p>`; return; }
  box.innerHTML = "";
  state.servicos.forEach((s) => {
    const card = document.createElement("div");
    card.className = "serv-card" + (s.ativo ? "" : " off");
    const capa = s.imagem_url ? `<img src="${s.imagem_url}" alt="">` : `<div class="noimg">${s.nome.trim()[0] ?? "✂"}</div>`;
    card.innerHTML = `${capa}<div class="corpo"><h4>${s.nome}</h4><div class="item-sub">${s.duracao_min} min</div><div class="preco">${brl(s.preco)}</div></div>`;
    const acoes = document.createElement("div");
    acoes.className = "acoes"; acoes.style.padding = "0 .8rem .8rem";
    acoes.appendChild(botao("Editar", "mini", () => editarServico(s)));
    acoes.appendChild(botao(s.ativo ? "Desativar" : "Ativar", "mini", () => alternarAtivo(s)));
    acoes.appendChild(botao("Excluir", "mini perigo", () => excluirServico(s.id)));
    card.appendChild(acoes);
    box.appendChild(card);
  });
}
function abrirFormServico(editando) {
  el("serv-form").classList.add("show");
  el("serv-form-titulo").textContent = editando ? "Editar serviço" : "Novo serviço";
  el("serv-form").scrollIntoView({ behavior: "smooth", block: "center" });
}
function fecharFormServico() {
  el("serv-form").classList.remove("show");
  state.editandoServ = null;
  ["sf-nome", "sf-duracao", "sf-preco", "sf-imagem"].forEach((id) => (el(id).value = ""));
  el("sf-ativo").checked = true;
}
function editarServico(s) {
  state.editandoServ = s.id;
  el("sf-nome").value = s.nome; el("sf-duracao").value = s.duracao_min;
  el("sf-preco").value = s.preco; el("sf-ativo").checked = s.ativo; el("sf-imagem").value = "";
  abrirFormServico(true);
}
async function alternarAtivo(s) {
  const { error } = await supabase.from("servicos").update({ ativo: !s.ativo }).eq("id", s.id);
  if (error) { toast("Não foi possível atualizar."); return; }
  carregarServicos();
}
async function uploadImagem(file) {
  const path = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error } = await supabase.storage.from("servicos").upload(path, file);
  if (error) throw error;
  return supabase.storage.from("servicos").getPublicUrl(path).data.publicUrl;
}
async function salvarServico() {
  const nome = el("sf-nome").value.trim();
  const dur = parseInt(el("sf-duracao").value, 10);
  const preco = parseFloat(el("sf-preco").value);
  const ativo = el("sf-ativo").checked;
  const file = el("sf-imagem").files[0];
  if (!nome || !dur || isNaN(preco)) return toast("Preencha nome, duração e preço.");

  const btn = el("btn-salvar-servico"); btn.disabled = true; btn.textContent = "Salvando…";
  try {
    const dados = { nome, duracao_min: dur, preco, ativo };
    if (file) dados.imagem_url = await uploadImagem(file);
    const q = state.editandoServ
      ? supabase.from("servicos").update(dados).eq("id", state.editandoServ)
      : supabase.from("servicos").insert(dados);
    const { error } = await q;
    if (error) throw error;
    toast(state.editandoServ ? "Serviço atualizado." : "Serviço criado.");
    fecharFormServico(); carregarServicos();
  } catch (e) {
    toast("Não foi possível salvar o serviço.");
  } finally {
    btn.disabled = false; btn.textContent = "Salvar serviço";
  }
}
async function excluirServico(id) {
  if (!confirm("Excluir este serviço?")) return;
  const { error } = await supabase.from("servicos").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") toast("Esse serviço tem agendamentos — desative em vez de excluir.");
    else toast("Não foi possível excluir.");
    return;
  }
  toast("Serviço excluído."); carregarServicos();
}

// ============================================================
//  PAUSAS (bloqueios: pausar a agenda)
// ============================================================
function renderPausas() {
  const box = el("pausas-lista");
  if (!state.bloqueios.length) { box.innerHTML = `<p class="vazio">Nenhuma pausa agendada.</p>`; return; }
  box.innerHTML = "";
  state.bloqueios.forEach((b) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div class="item-topo"><span class="item-cliente">${b.motivo || "Bloqueio"}</span></div>
      <div class="item-sub">${fmtDH(b.inicio)} → ${fmtDH(b.fim)}</div>`;
    const acoes = document.createElement("div"); acoes.className = "item-acoes";
    acoes.appendChild(botao("Remover", "mini perigo", () => excluirBloqueio(b.id)));
    div.appendChild(acoes);
    box.appendChild(div);
  });
}
async function criarBloqueio() {
  const ini = toISOLocal(el("pausa-inicio").value);
  const fim = toISOLocal(el("pausa-fim").value);
  const motivo = el("pausa-motivo").value.trim() || null;
  if (!ini || !fim) return toast("Escolha início e fim da pausa.");
  if (new Date(fim) <= new Date(ini)) return toast("O fim tem que ser depois do início.");
  const { error } = await supabase.from("bloqueios").insert({ inicio: new Date(ini).toISOString(), fim: new Date(fim).toISOString(), motivo });
  if (error) { toast("Não foi possível criar a pausa."); return; }
  ["pausa-inicio", "pausa-fim", "pausa-motivo"].forEach((id) => (el(id).value = ""));
  toast("Pausa criada."); carregarBloqueios();
}
async function excluirBloqueio(id) {
  const { error } = await supabase.from("bloqueios").delete().eq("id", id);
  if (error) { toast("Não foi possível remover."); return; }
  toast("Pausa removida."); carregarBloqueios();
}

// ============================================================
//  BOOT
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  el("btn-login").addEventListener("click", login);
  el("login-senha").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  el("btn-sair").addEventListener("click", sair);
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => abrirTab(t.dataset.tab)));
  el("btn-novo-servico").addEventListener("click", () => { state.editandoServ = null; fecharFormServico(); abrirFormServico(false); });
  el("btn-salvar-servico").addEventListener("click", salvarServico);
  el("btn-cancelar-servico").addEventListener("click", fecharFormServico);
  el("btn-add-pausa").addEventListener("click", criarBloqueio);
  initAuth();
});
