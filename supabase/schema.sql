-- DUIM Barber — Supabase schema completo
-- Rode este arquivo no SQL Editor do Supabase.
-- Depois cadastre pelo menos um e-mail na tabela admin_users.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  id int primary key default 1,
  business_name text not null default 'DUIM Barber',
  whatsapp text,
  address text,
  google_maps_url text,
  google_review_url text,
  instagram_url text,
  updated_at timestamptz not null default now(),
  constraint business_settings_single_row check (id = 1)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  duration_minutes int not null default 30 check (duration_minutes > 0),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.working_hours (
  id uuid primary key default gen_random_uuid(),
  weekday int not null unique check (weekday between 0 and 6),
  is_open boolean not null default true,
  open_time time not null default '09:00',
  close_time time not null default '19:00',
  break_start time,
  break_end time,
  updated_at timestamptz not null default now(),
  constraint working_hours_valid_close check (close_time > open_time),
  constraint working_hours_break_pair check ((break_start is null and break_end is null) or (break_start is not null and break_end is not null and break_end > break_start))
);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  start_time time,
  end_time time,
  block_type text not null default 'bloqueio' check (block_type in ('folga','feriado','bloqueio')),
  message text not null default 'A barbearia não atenderá neste dia.',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint schedule_blocks_time_pair check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time))
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_phone text not null,
  service_id uuid references public.services(id) on delete set null,
  service_name text,
  price numeric(10,2) not null default 0,
  duration_minutes int not null default 30,
  appointment_date date not null,
  appointment_time time not null,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','cancelled','blocked')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','refunded','not_charged')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists appointments_date_time_idx on public.appointments (appointment_date, appointment_time);
create index if not exists appointments_status_idx on public.appointments (status);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  image_url text,
  category text,
  stock int not null default 0,
  available boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  quantity int not null default 1 check (quantity > 0),
  unit_price numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  sale_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.active = true
  );
$$;

-- View pública sem dados pessoais, usada só para bloquear horários no site.
drop view if exists public.public_agenda_ocupada;
create view public.public_agenda_ocupada as
select
  appointment_date,
  appointment_time,
  duration_minutes,
  status
from public.appointments
where status in ('scheduled','confirmed','completed','blocked');

grant select on public.public_agenda_ocupada to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.business_settings enable row level security;
alter table public.services enable row level security;
alter table public.working_hours enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.appointments enable row level security;
alter table public.products enable row level security;
alter table public.product_sales enable row level security;

-- Admin users: somente admins podem listar/gerenciar.
drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users" on public.admin_users for select using (public.is_admin());
drop policy if exists "Admins can manage admin users" on public.admin_users;
create policy "Admins can manage admin users" on public.admin_users for all using (public.is_admin()) with check (public.is_admin());

-- Settings: público lê; admin altera.
drop policy if exists "Public can read business settings" on public.business_settings;
create policy "Public can read business settings" on public.business_settings for select using (true);
drop policy if exists "Admins can manage business settings" on public.business_settings;
create policy "Admins can manage business settings" on public.business_settings for all using (public.is_admin()) with check (public.is_admin());

-- Serviços: público lê ativos; admin gerencia tudo.
drop policy if exists "Public can read active services" on public.services;
create policy "Public can read active services" on public.services for select using (active = true or public.is_admin());
drop policy if exists "Admins can manage services" on public.services;
create policy "Admins can manage services" on public.services for all using (public.is_admin()) with check (public.is_admin());

-- Horários e bloqueios: público lê para montar agenda; admin gerencia.
drop policy if exists "Public can read working hours" on public.working_hours;
create policy "Public can read working hours" on public.working_hours for select using (true);
drop policy if exists "Admins can manage working hours" on public.working_hours;
create policy "Admins can manage working hours" on public.working_hours for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public can read active schedule blocks" on public.schedule_blocks;
create policy "Public can read active schedule blocks" on public.schedule_blocks for select using (active = true or public.is_admin());
drop policy if exists "Admins can manage schedule blocks" on public.schedule_blocks;
create policy "Admins can manage schedule blocks" on public.schedule_blocks for all using (public.is_admin()) with check (public.is_admin());

-- Agendamentos: público NÃO lê dados pessoais. Insert direto também fica bloqueado.
-- A criação pública deve passar pela Edge Function criar-agendamento com service role.
drop policy if exists "Admins can manage appointments" on public.appointments;
create policy "Admins can manage appointments" on public.appointments for all using (public.is_admin()) with check (public.is_admin());

-- Produtos: público lê ativos; admin gerencia tudo.
drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products" on public.products for select using (active = true or public.is_admin());
drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products" on public.products for all using (public.is_admin()) with check (public.is_admin());

-- Vendas: somente admin.
drop policy if exists "Admins can manage product sales" on public.product_sales;
create policy "Admins can manage product sales" on public.product_sales for all using (public.is_admin()) with check (public.is_admin());

-- Dados iniciais seguros.
insert into public.business_settings (id, business_name, whatsapp, address, google_maps_url, google_review_url)
values (1, 'DUIM Barber', '5531999999999', 'Configure o endereço da barbearia', 'https://www.google.com/maps/search/?api=1&query=barbearia', 'https://www.google.com/search?q=DUIM+Barber+avaliar+no+Google')
on conflict (id) do nothing;

insert into public.services (name, description, price, duration_minutes, position)
values
  ('Corte masculino', 'Corte completo com acabamento alinhado.', 35, 30, 1),
  ('Barba completa', 'Toalha quente, desenho e finalização.', 30, 30, 2),
  ('Corte + barba', 'Combo completo para sair pronto.', 60, 60, 3)
on conflict do nothing;

insert into public.working_hours (weekday, is_open, open_time, close_time, break_start, break_end)
values
  (0, false, '09:00', '18:00', null, null),
  (1, true, '09:00', '19:00', '12:00', '13:00'),
  (2, true, '09:00', '19:00', '12:00', '13:00'),
  (3, true, '09:00', '19:00', '12:00', '13:00'),
  (4, true, '09:00', '19:00', '12:00', '13:00'),
  (5, true, '09:00', '19:00', '12:00', '13:00'),
  (6, true, '08:00', '16:00', null, null)
on conflict (weekday) do nothing;

-- Após rodar o schema, libere o dono do painel:
-- insert into public.admin_users (email, name) values ('email-do-duim@exemplo.com', 'Duim');
