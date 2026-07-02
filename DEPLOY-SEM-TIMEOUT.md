# Deploy sem timeout — DUIM Barber

Este pacote é estático. Não precisa rodar build pesado, npm install, banco local, Supabase CLI ou Edge Function durante o deploy do site.

## Estrutura correta

Neste ZIP, o `index.html` está direto na raiz. Isso evita erro comum em Vercel, Netlify e GitHub Pages quando o site fica dentro de uma pasta extra como `DUIM/`.

## Vercel

Configuração recomendada:

- Framework Preset: Other
- Build Command: deixar vazio ou usar `npm run build`
- Output Directory: `.`
- Install Command: deixar vazio, se possível

Se o Vercel insistir em build, o `package.json` já possui um build leve que só imprime uma mensagem.

## Netlify

Configuração recomendada:

- Base directory: vazio
- Build command: vazio
- Publish directory: `.`

Também pode arrastar este ZIP no deploy manual do Netlify.

## GitHub Pages

Suba o conteúdo deste pacote direto na raiz do repositório, não dentro de outra pasta, ou configure o Pages para publicar a pasta onde está o `index.html`.

## Supabase

O site público e o painel podem ser publicados sem rodar Supabase CLI.

Depois do site no ar:

1. Rode `supabase/schema.sql` no SQL Editor do Supabase.
2. Configure `assets/js/supabase.js` com `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
3. Cadastre o e-mail autorizado em `admin_users`.
4. Só depois publique a Edge Function, se for usar a criação segura de agendamento pelo servidor.

## Edge Function

Não publique a Edge Function junto com Vercel/Netlify/GitHub Pages. Ela é do Supabase.

Com Supabase CLI, dentro do projeto Supabase:

```bash
supabase functions deploy criar-agendamento
```

Se a Edge Function der timeout, publique o site primeiro e deixe a função para depois.
