# DUIM Barber — site + agendamento + painel

Projeto modernizado em versão pronta para deploy estático. Neste pacote, o `index.html` fica direto na raiz para evitar erro de publish directory.

```txt
/
├── index.html
├── assets/
│   ├── css/px.css
│   └── js/
│       ├── supabase.js
│       └── agenda.js
├── admin/
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js
├── supabase/
│   ├── schema.sql
│   └── functions/criar-agendamento/index.ts
├── package.json
├── vercel.json
├── netlify.toml
└── DEPLOY-SEM-TIMEOUT.md
```

## O que foi adicionado

- Design novo, moderno e mobile-first.
- Página inicial mais limpa, com foco em agendamento, WhatsApp, serviços, loja, localização e avaliação no Google.
- Agendamento com horários disponíveis, ocupados e bloqueados com visual diferente.
- Mensagem correta para folgas/bloqueios, sem mostrar “agenda cheia” quando o dia foi bloqueado.
- Pagamento de serviços apenas presencial.
- Loja em formato de catálogo, sem checkout e sem pagamento online ativo.
- Produtos com nome, foto, descrição, preço, categoria, estoque/disponibilidade e botão de WhatsApp.
- Painel administrativo com dashboard, financeiro manual, agenda, loja, horários de funcionamento, folgas e configurações.
- Login do painel com e-mail e senha pelo Supabase Auth.
- Segurança planejada no Supabase com `admin_users`, função `is_admin()` e RLS.
- Edge Function `criar-agendamento` para criar agendamentos com validação no servidor.
- Link do painel removido do site principal. O acesso é direto por `/admin/`.

## Como configurar o Supabase

1. Abra o Supabase do projeto.
2. Vá em **SQL Editor**.
3. Rode o arquivo:

```txt
supabase/schema.sql
```

4. Crie o usuário do painel em **Authentication > Users > Add user** no Supabase.

Use o e-mail do Duim e defina uma senha. Esse será o login real do painel.

5. Cadastre o mesmo e-mail autorizado do dono/painel:

```sql
insert into public.admin_users (email, name)
values ('email-do-duim@exemplo.com', 'Duim');
```

O e-mail precisa existir nos dois lugares:

- Supabase Auth, com senha;
- tabela `admin_users`, com `active = true`.

6. Abra o arquivo:

```txt
assets/js/supabase.js
```

7. Preencha:

```js
export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY';
```

8. Ajuste também no mesmo arquivo:

```js
whatsapp: '5531999999999',
address: 'Endereço real da barbearia',
googleMapsUrl: 'link do Google Maps',
googleReviewUrl: 'link de avaliação do Google'
```

## Como publicar a Edge Function

Pelo Supabase CLI:

```bash
supabase functions deploy criar-agendamento
```

A função usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que normalmente já existem no ambiente das Edge Functions do Supabase.

## Importante sobre segurança

O painel não deve depender apenas do frontend. O arquivo `schema.sql` cria:

- tabela `admin_users`;
- função `public.is_admin()`;
- políticas RLS para limitar dados administrativos;
- bloqueio de leitura pública dos dados pessoais dos agendamentos;
- view pública `public_agenda_ocupada`, que mostra somente data, horário, duração e status para o site bloquear horários.

## Acesso ao painel

O painel não aparece mais no menu do site principal. Para acessar, digite manualmente:

```txt
/admin/
```

O login exige e-mail e senha pelo Supabase Auth. Depois do login, o sistema confere se o e-mail está ativo na tabela `admin_users`. Se não estiver, o acesso é negado e a sessão é encerrada.

## Demonstração pública

Se o Supabase ainda não estiver configurado, o site público pode mostrar dados de exemplo para visualização. O painel administrativo, porém, não entra em modo demonstração: ele exige Supabase configurado, Auth e e-mail autorizado.

## Observação sobre o arquivo RAR original

O pacote enviado estava em RAR5 comprimido. O ambiente atual não tinha extrator RAR disponível, então esta entrega foi reconstruída na mesma estrutura detectada no pacote original, preservando os caminhos esperados do projeto.


## Deploy sem timeout

Use o pacote `DUIM_deploy_limpo.zip`. Ele é estático e não precisa de build pesado. O `index.html` está direto na raiz. Em Vercel/Netlify, use publish/output directory `.` e deixe o build command vazio, ou use `npm run build`, que é apenas um comando leve.
