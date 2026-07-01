// ============================================================
//  Configuração do Supabase
//  A anon key é pública (pode ir pro front), mas mantenha o
//  padrão COLE_AQUI no repositório e preencha só no deploy.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL      = "https://qqzqhbditohkccgzprsl.supabase.co";     
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxenFoYmRpdG9oa2NjZ3pwcnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTYzOTIsImV4cCI6MjA5ODQ5MjM5Mn0.dvSvDH7Qp-JXS6mIGcsHsgnfv2Iv9Mhff8euaqWsztI";

// ---- Ajustes da agenda ----
export const TZ_OFFSET     = "-03:00";  // America/Sao_Paulo (sem horário de verão)
export const SLOT_STEP_MIN = 30;        // de quanto em quanto tempo os horários aparecem
export const DIAS_A_FRENTE = 14;        // quantos dias abertos o cliente pode agendar à frente
export const POLL_MS       = 15000;     // recarrega a disponibilidade a cada X ms

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const EF_CRIAR_AGENDAMENTO = `${SUPABASE_URL}/functions/v1/criar-agendamento`;
