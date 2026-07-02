# Acesso ao painel com e-mail e senha

O painel administrativo foi removido do menu do site principal. O cliente comum não verá link para o painel.

## URL do painel

Acesse diretamente:

```txt
/admin/
```

## Como liberar um administrador

No Supabase:

1. Vá em **Authentication > Users**.
2. Clique em **Add user**.
3. Crie o usuário com e-mail e senha.
4. Vá em **SQL Editor**.
5. Rode:

```sql
insert into public.admin_users (email, name, active)
values ('email-do-duim@exemplo.com', 'Duim', true)
on conflict (email) do update set active = true, name = excluded.name;
```

O mesmo e-mail precisa estar no Supabase Auth e na tabela `admin_users`.

## Como bloquear um administrador

```sql
update public.admin_users
set active = false
where email = 'email-do-admin@exemplo.com';
```

## Observação

Não basta esconder o link do painel. A proteção real está no login do Supabase Auth + tabela `admin_users` + políticas RLS do `schema.sql`.
