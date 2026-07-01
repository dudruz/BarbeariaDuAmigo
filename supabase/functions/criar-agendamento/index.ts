// ============================================================
//  Edge Function: criar-agendamento
//  Recebe { servico_id, cliente_nome, cliente_whatsapp, inicio }
//  Valida, calcula o fim pela duração do serviço e insere.
//  A constraint EXCLUDE (sem_sobreposicao) é o juiz final da
//  corrida: se dois pedidos batem no mesmo horário, um grava e
//  o outro estoura 23P01 -> devolvemos "slot_ocupado".
//
//  Deploy:  supabase functions deploy criar-agendamento
//  Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm
//           injetados pelo Supabase; não precisa COLE_AQUI aqui.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  // Em produção, troque "*" pelo domínio do GitHub Pages.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// weekday (0=Dom..6=Sáb) e HH:MM no fuso da barbearia
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const dowSP = (d: Date) =>
  DOW[new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(d)];
const hhmmSP = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "Método não permitido." }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, message: "Requisição inválida." }, 400); }

  const nome = String(body?.cliente_nome ?? "").trim();
  const whats = String(body?.cliente_whatsapp ?? "").replace(/\D/g, "");
  const servicoId = String(body?.servico_id ?? "");
  const inicio = new Date(String(body?.inicio ?? ""));

  if (nome.length < 2) return json({ ok: false, code: "nome", message: "Informe seu nome." }, 400);
  if (whats.length < 10 || whats.length > 13) return json({ ok: false, code: "whatsapp", message: "WhatsApp inválido." }, 400);
  if (!servicoId) return json({ ok: false, code: "servico", message: "Escolha um serviço." }, 400);
  if (isNaN(inicio.getTime())) return json({ ok: false, code: "horario", message: "Horário inválido." }, 400);
  if (inicio.getTime() <= Date.now()) return json({ ok: false, code: "passado", message: "Esse horário já passou." }, 409);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // serviço ativo?
  const { data: servico, error: eS } = await admin
    .from("servicos").select("id, duracao_min, ativo").eq("id", servicoId).single();
  if (eS || !servico || !servico.ativo)
    return json({ ok: false, code: "servico", message: "Serviço indisponível." }, 409);

  const fim = new Date(inicio.getTime() + servico.duracao_min * 60000);

  // dentro do horário de funcionamento? (rede de segurança; o front já filtra)
  const { data: exp } = await admin
    .from("horarios_funcionamento").select("abre, fecha").eq("dia_semana", dowSP(inicio)).eq("ativo", true);
  const dentro = (exp ?? []).some((h) => hhmmSP(inicio) >= h.abre.slice(0, 5) && hhmmSP(fim) <= h.fecha.slice(0, 5));
  if (!dentro) return json({ ok: false, code: "fora_horario", message: "Fora do horário de atendimento." }, 409);

  // bloqueio (almoço/folga/feriado) sobreposto?
  const { data: blk } = await admin
    .from("bloqueios").select("id")
    .lt("inicio", fim.toISOString()).gt("fim", inicio.toISOString()).limit(1);
  if (blk && blk.length) return json({ ok: false, code: "fora_horario", message: "Esse horário está bloqueado." }, 409);

  // insere — a EXCLUDE decide a corrida
  const { data: ag, error: eI } = await admin.from("agendamentos").insert({
    servico_id: servicoId,
    cliente_nome: nome,
    cliente_whatsapp: whats,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    status: "confirmado",
  }).select("id, inicio, fim").single();

  if (eI) {
    if (eI.code === "23P01" || /sobreposicao|exclus/i.test(eI.message))
      return json({ ok: false, code: "slot_ocupado", message: "Esse horário acabou de ser preenchido." }, 409);
    return json({ ok: false, code: "erro", message: "Não foi possível confirmar. Tente de novo." }, 500);
  }

  return json({ ok: true, agendamento: ag });
});
