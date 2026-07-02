# DUIM Barber — site + agendamento + painel

Projeto modernizado mantendo a estrutura original de arquivos:

```txt
DUIM/
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
└── supabase/
    ├── schema.sql
    └── functions/criar-agendamento/index.ts
```

## O que foi adicionado

- Design novo, moderno e mobile-first.
- Página inicial com chamadas diretas para agendar, loja, localização, WhatsApp e avaliação no Google.
- Agendamento com horários disponíveis, ocupados e bloqueados com visual diferente.
- Mensagem correta para folgas/bloqueios, sem mostrar “agenda cheia” quando o dia foi bloqueado.
- Pagamento de serviços apenas presencial.
- Loja em formato de catálogo, sem checkout e sem pagamento online ativo.
- Produtos com nome, foto, descrição, preço, categoria, estoque/disponibilidade e botão de WhatsApp.
- Painel administrativo com dashboard, financeiro manual, agenda, loja, horários de funcionamento, folgas e configurações.
- Segurança planejada no Supabase com `admin_users`, função `is_admin()` e RLS.
- Edge Function `criar-agendamento` para criar agendamentos com validação no servidor.

## Como configurar o Supabase

1. Abra o Supabase do projeto.
2. Vá em **SQL Editor**.
3. Rode o arquivo:

```txt
supabase/schema.sql
```

4. Cadastre o e-mail autorizado do dono/painel:

```sql
insert into public.admin_users (email, name)
values ('email-do-duim@exemplo.com', 'Duim');
```

5. Abra o arquivo:

```txt
assets/js/supabase.js
```

6. Preencha:

```js
export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY';
```

7. Ajuste também no mesmo arquivo:

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

## Modo demonstração

Se o Supabase ainda não estiver configurado, o site e o painel exibem dados de exemplo usando `localStorage`. Isso é apenas para visualizar o design e testar o fluxo. Para produção, configure o Supabase e rode o schema.

## Observação sobre o arquivo RAR original

O pacote enviado estava em RAR5 comprimido. O ambiente atual não tinha extrator RAR disponível, então esta entrega foi reconstruída na mesma estrutura detectada no pacote original, preservando os caminhos esperados do projeto.
