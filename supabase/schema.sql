-- ============================================================
--  BARBEARIA CORTE DÚ AMIGO — Schema Supabase (Fase 1)
--  Barbeiro: Duin (operação solo)
--  Endereço: R. Santa Clara de Assis, 20 - Minaslândia, BH - MG
-- ============================================================
--  Rode este arquivo inteiro no SQL Editor do Supabase.
--  Ele é idempotente o suficiente pra rodar em banco novo.
-- ============================================================

-- Extensão pra combinar igualdade + range no EXCLUDE (útil quando
-- virar multi-barbeiro: barbeiro_id WITH =, periodo WITH &&).
-- Pra operação solo não é obrigatória, mas deixo pronto e é inofensiva.
create extension if not exists btree_gist;

-- ------------------------------------------------------------
--  TIPOS
-- ------------------------------------------------------------
do $$ begin
  create type status_agendamento as enum ('confirmado','concluido','cancelado','no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_pagamento as enum ('pendente','pago','estornado','falhou');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
--  SERVIÇOS
--  Criados pelo Duin no painel, COM imagem (upload direto pro
--  Storage), igual criação de ensaio no Parallel Vision.
-- ------------------------------------------------------------
create table if not exists servicos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  duracao_min int  not null check (duracao_min > 0),
  preco       numeric(10,2) not null check (preco >= 0),
  imagem_url  text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_servicos_ativo on servicos(ativo);

-- ------------------------------------------------------------
--  HORÁRIO DE FUNCIONAMENTO
--  Grade base a partir da qual os slots são gerados no front.
--  dia_semana: 0=domingo ... 6=sábado
-- ------------------------------------------------------------
create table if not exists horarios_funcionamento (
  id          uuid primary key default gen_random_uuid(),
  dia_semana  int  not null check (dia_semana between 0 and 6),
  abre        time not null,
  fecha       time not null,
  ativo       boolean not null default true,
  check (fecha > abre)
);

-- ------------------------------------------------------------
--  BLOQUEIOS
--  É o que "pausa a agenda": almoço, folga, feriado, imprevisto.
-- ------------------------------------------------------------
create table if not exists bloqueios (
  id       uuid primary key default gen_random_uuid(),
  inicio   timestamptz not null,
  fim      timestamptz not null,
  motivo   text,
  check (fim > inicio)
);
create index if not exists idx_bloqueios_inicio on bloqueios(inicio);

-- ------------------------------------------------------------
--  AGENDAMENTOS
--  `periodo` é gerado a partir de inicio/fim. A constraint EXCLUDE
--  garante que dois agendamentos NÃO-cancelados nunca se sobreponham
--  => resolve a corrida de dois clientes marcando o mesmo horário.
--  Se dois inserts colidem, o segundo estoura erro 23P01
--  (exclusion_violation) e o front mostra "horário acabou de ser
--  preenchido". Cancelar libera o slot (pelo WHERE da constraint).
-- ------------------------------------------------------------
create table if not exists agendamentos (
  id               uuid primary key default gen_random_uuid(),
  servico_id       uuid not null references servicos(id),
  cliente_nome     text not null,
  cliente_whatsapp text not null,
  inicio           timestamptz not null,
  fim              timestamptz not null,
  status           status_agendamento not null default 'confirmado',
  observacao       text,
  criado_em        timestamptz not null default now(),
  periodo          tstzrange generated always as (tstzrange(inicio, fim, '[)')) stored,
  check (fim > inicio),
  constraint sem_sobreposicao
    exclude using gist (periodo with &&) where (status <> 'cancelado')
);
create index if not exists idx_agendamentos_inicio on agendamentos(inicio);

-- ------------------------------------------------------------
--  PAGAMENTOS
--  Conciliação da cobrança InfinitePay via webhook (mecânica do
--  Parallel). O agendamento nasce sem pagamento; após o corte a
--  EF gera a cobrança e o webhook marca 'pago' aqui.
-- ------------------------------------------------------------
create table if not exists pagamentos (
  id             uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  valor          numeric(10,2) not null,
  metodo         text,                     -- pix / credito / debito
  infinitepay_id text,                     -- id da transação p/ conciliar no webhook
  status         status_pagamento not null default 'pendente',
  criado_em      timestamptz not null default now(),
  pago_em        timestamptz
);
create index if not exists idx_pagamentos_agendamento on pagamentos(agendamento_id);
create index if not exists idx_pagamentos_infinitepay on pagamentos(infinitepay_id);

-- ------------------------------------------------------------
--  AVALIAÇÕES
--  Feedback interno (de TODOS os clientes). O botão "Avaliar no
--  Google" é oferecido a todo mundo — sem review gating.
-- ------------------------------------------------------------
create table if not exists avaliacoes (
  id             uuid primary key default gen_random_uuid(),
  agendamento_id uuid references agendamentos(id) on delete set null,
  nota           int not null check (nota between 1 and 5),
  comentario     text,
  criado_em      timestamptz not null default now()
);

-- ============================================================
--  RPC: horarios_ocupados(dia)
--  Retorna só as faixas OCUPADAS do dia (agendamentos ativos +
--  bloqueios), SEM expor nome/WhatsApp de ninguém. SECURITY DEFINER
--  pra ler as tabelas sem precisar dar SELECT público nelas.
--  O front pega a grade do dia e subtrai essas faixas.
-- ============================================================
create or replace function horarios_ocupados(dia date)
returns table (inicio timestamptz, fim timestamptz)
language sql
security definer
set search_path = public
as $$
  select a.inicio, a.fim
    from agendamentos a
   where a.status <> 'cancelado'
     and a.inicio >= dia::timestamptz
     and a.inicio <  (dia + 1)::timestamptz
  union all
  select b.inicio, b.fim
    from bloqueios b
   where b.inicio >= dia::timestamptz
     and b.inicio <  (dia + 1)::timestamptz;
$$;

grant execute on function horarios_ocupados(date) to anon, authenticated;

-- ============================================================
--  ROW LEVEL SECURITY
--  Público (anon): lê só serviços ativos + horário de funcionamento,
--  e pode deixar avaliação. NÃO lê agendamentos/bloqueios direto
--  (usa a RPC) e NÃO insere agendamento direto (vai por Edge
--  Function com service role — Fase 2).
--  Admin (Duin) = usuário autenticado: gerencia tudo.
-- ============================================================
alter table servicos                enable row level security;
alter table horarios_funcionamento  enable row level security;
alter table bloqueios               enable row level security;
alter table agendamentos            enable row level security;
alter table pagamentos              enable row level security;
alter table avaliacoes              enable row level security;

-- Idempotência: remove policies antigas antes de recriar. O comando
-- create policy NÃO tem "if not exists"; sem estes drops, rodar o
-- schema de novo estoura 42710 ("policy ... already exists").
drop policy if exists "publico le servicos ativos"       on servicos;
drop policy if exists "publico le horario funcionamento" on horarios_funcionamento;
drop policy if exists "publico cria avaliacao"           on avaliacoes;
drop policy if exists "admin gerencia servicos"          on servicos;
drop policy if exists "admin gerencia horarios"          on horarios_funcionamento;
drop policy if exists "admin gerencia bloqueios"         on bloqueios;
drop policy if exists "admin gerencia agendamentos"      on agendamentos;
drop policy if exists "admin le pagamentos"              on pagamentos;
drop policy if exists "admin le avaliacoes"              on avaliacoes;

-- PÚBLICO ----------------------------------------------------
create policy "publico le servicos ativos"
  on servicos for select to anon, authenticated
  using (ativo = true);

create policy "publico le horario funcionamento"
  on horarios_funcionamento for select to anon, authenticated
  using (ativo = true);

create policy "publico cria avaliacao"
  on avaliacoes for insert to anon, authenticated
  with check (nota between 1 and 5);

-- ADMIN (autenticado = só o Duin tem login) ------------------
create policy "admin gerencia servicos"
  on servicos for all to authenticated using (true) with check (true);

create policy "admin gerencia horarios"
  on horarios_funcionamento for all to authenticated using (true) with check (true);

create policy "admin gerencia bloqueios"
  on bloqueios for all to authenticated using (true) with check (true);

create policy "admin gerencia agendamentos"
  on agendamentos for all to authenticated using (true) with check (true);

create policy "admin le pagamentos"
  on pagamentos for select to authenticated using (true);

create policy "admin le avaliacoes"
  on avaliacoes for select to authenticated using (true);

-- ============================================================
--  STORAGE: bucket das imagens de serviço
--  Leitura pública; escrita só autenticado (Duin sobe no painel,
--  igual foto de ensaio no Parallel).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('servicos', 'servicos', true)
on conflict (id) do nothing;

drop policy if exists "imagens de servico publicas (leitura)" on storage.objects;
drop policy if exists "admin sobe imagem de servico"          on storage.objects;
drop policy if exists "admin atualiza imagem de servico"      on storage.objects;
drop policy if exists "admin apaga imagem de servico"         on storage.objects;

create policy "imagens de servico publicas (leitura)"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'servicos');

create policy "admin sobe imagem de servico"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'servicos');

create policy "admin atualiza imagem de servico"
  on storage.objects for update to authenticated
  using (bucket_id = 'servicos');

create policy "admin apaga imagem de servico"
  on storage.objects for delete to authenticated
  using (bucket_id = 'servicos');

-- ============================================================
--  SEED (exemplo — edite/apague à vontade)
-- ============================================================
-- Horário puxado do Google: Ter–Sáb 9:00–19:30 (Seg/Dom fechado).
-- Só insere se a tabela estiver vazia (pra não duplicar no rerun).
insert into horarios_funcionamento (dia_semana, abre, fecha)
select v.dia, v.abre, v.fecha
from (values
  (2, time '09:00', time '19:30'),
  (3, time '09:00', time '19:30'),
  (4, time '09:00', time '19:30'),
  (5, time '09:00', time '19:30'),
  (6, time '09:00', time '19:30')
) as v(dia, abre, fecha)
where not exists (select 1 from horarios_funcionamento);

-- Serviços de exemplo pra testar a Fase 2 (preços/imagens você ajusta no painel).
insert into servicos (nome, duracao_min, preco)
select v.nome, v.dur, v.preco
from (values
  ('Corte',          40, 40.00),
  ('Barba',          30, 30.00),
  ('Corte + Barba',  60, 60.00)
) as v(nome, dur, preco)
where not exists (select 1 from servicos);
