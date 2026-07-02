import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const body = await req.json();
    const clientName = String(body.client_name || '').trim();
    const clientPhone = String(body.client_phone || '').trim();
    const serviceId = String(body.service_id || '').trim();
    const appointmentDate = String(body.appointment_date || '').trim();
    const appointmentTime = String(body.appointment_time || '').trim().slice(0, 5);
    const notes = String(body.notes || '').trim();

    if (!clientName || !clientPhone || !serviceId || !appointmentDate || !appointmentTime) {
      return json({ error: 'Preencha nome, WhatsApp, serviço, data e horário.' }, 400);
    }

    const today = new Date();
    const selected = new Date(`${appointmentDate}T00:00:00`);
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (selected < todayOnly) return json({ error: 'Não é possível agendar em uma data passada.' }, 400);

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('id, name, price, duration_minutes, active')
      .eq('id', serviceId)
      .eq('active', true)
      .maybeSingle();

    if (serviceError || !service) return json({ error: 'Serviço indisponível.' }, 400);

    const weekday = selected.getDay();
    const { data: hours } = await supabase
      .from('working_hours')
      .select('*')
      .eq('weekday', weekday)
      .maybeSingle();

    if (!hours || hours.is_open === false) return json({ error: 'A barbearia não atenderá neste dia.' }, 400);

    const start = toMinutes(appointmentTime);
    const duration = Number(service.duration_minutes || 30);
    const end = start + duration;
    const open = toMinutes(hours.open_time);
    const close = toMinutes(hours.close_time);

    if (start < open || end > close) return json({ error: 'Horário fora do funcionamento da barbearia.' }, 400);

    if (hours.break_start && hours.break_end) {
      const breakStart = toMinutes(hours.break_start);
      const breakEnd = toMinutes(hours.break_end);
      if (start < breakEnd && end > breakStart) return json({ error: 'Horário dentro do intervalo de pausa.' }, 400);
    }

    const { data: blocks } = await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('block_date', appointmentDate)
      .eq('active', true);

    const blocked = (blocks || []).find((block) => {
      if (!block.start_time || !block.end_time) return true;
      return start < toMinutes(block.end_time) && end > toMinutes(block.start_time);
    });

    if (blocked) {
      return json({ error: blocked.message || 'Esse dia foi bloqueado pelo barbeiro.' }, 400);
    }

    const { data: appointments } = await supabase
      .from('appointments')
      .select('appointment_time, duration_minutes, status')
      .eq('appointment_date', appointmentDate)
      .in('status', ['scheduled', 'confirmed', 'completed', 'blocked']);

    const conflict = (appointments || []).find((item) => {
      const busyStart = toMinutes(String(item.appointment_time).slice(0, 5));
      const busyEnd = busyStart + Number(item.duration_minutes || 30);
      return start < busyEnd && end > busyStart;
    });

    if (conflict) return json({ error: 'Esse horário acabou de ser ocupado. Escolha outro horário.' }, 409);

    const { data: inserted, error: insertError } = await supabase
      .from('appointments')
      .insert({
        client_name: clientName,
        client_phone: clientPhone,
        service_id: service.id,
        service_name: service.name,
        price: service.price,
        duration_minutes: service.duration_minutes,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        status: 'scheduled',
        payment_status: 'pending',
        notes
      })
      .select('id')
      .single();

    if (insertError) return json({ error: insertError.message }, 400);

    return json({ ok: true, appointment_id: inserted.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado ao criar agendamento.' }, 500);
  }
});

function toMinutes(time: string) {
  const [h, m] = String(time).slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
}
