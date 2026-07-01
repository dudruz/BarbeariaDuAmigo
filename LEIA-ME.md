# Corte Dú Amigo — Sistema de Agendamento

Frontend estático (GitHub Pages) + Supabase + Edge Function pra criar o agendamento.
Pagamento é presencial (InfinitePay) depois do corte — isso entra na Fase 4.

## Estrutura
```
index.html ............................ página do cliente (agendar)
assets/css/px.css ..................... estilos (identidade da barbearia)
assets/js/supabase.js ................. config — COLE suas chaves aqui
assets/js/agenda.js ................... lógica do agendamento
admin/index.html ...................... painel do Duin (login + abas)
admin/css/admin.css ................... estilos do painel
admin/js/admin.js ..................... lógica do painel
supabase/schema.sql ................... banco (rode no SQL Editor) — Fase 1
supabase/functions/criar-agendamento/ . Edge Function que grava o horário
```

## Passo a passo
1. **Banco:** Supabase → SQL Editor → cole e rode `supabase/schema.sql`.
2. **Login do Duin:** Authentication → Users → Add user. É ele quem vai entrar no painel (Fase 3).
3. **Function:** `supabase functions deploy criar-agendamento`
   (as secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm injetadas).
4. **Chaves no front:** em `assets/js/supabase.js`, troque `COLE_AQUI_URL` e `COLE_AQUI_ANON`
   (Settings → API). A anon key é pública, pode ir pro Pages.
5. **Deploy:** suba a pasta no GitHub Pages.
6. **Produção:** troque o `"*"` do CORS na Function pelo domínio do Pages.

## Testes rápidos
- Marca um horário e recarrega → o slot tem que aparecer riscado (ocupado).
- Abre duas abas e tenta marcar o mesmo horário junto → só **uma** confirma; a outra recebe
  "esse horário acabou de ser preenchido" (é a constraint `EXCLUDE` fazendo o trabalho).
- Deixa a aba aberta → a disponibilidade recarrega sozinha a cada 15s.

## Painel do Duin (Fase 3)
Abra **`/admin/`** (ex.: `https://.../admin/`) e entre com o e-mail/senha criado no Auth (passo 2).
Abas: **Dashboard** (nº de hoje/semana, próximo cliente, avaliações), **Agenda**
(concluir / reagendar / cancelar + WhatsApp do cliente), **Serviços** (criar/editar/excluir
com foto) e **Pausas** (bloquear almoço/folga/feriado).

## Ainda vem
- **Fase 4 — Pagamento:** cobrança InfinitePay pós-corte + webhook marcando `pago`.
