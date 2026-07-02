// Configuração pública do front-end.
// A anon key é pública por design e deve ser protegida por RLS no Supabase.
// Preencha com os dados reais em Supabase → Project Settings → API.

export const SUPABASE_URL = 'https://qqzqhbditohkccgzprsl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxenFoYmRpdG9oa2NjZ3pwcnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTYzOTIsImV4cCI6MjA5ODQ5MjM5Mn0.dvSvDH7Qp-JXS6mIGcsHsgnfv2Iv9Mhff8euaqWsztI';

export const APP_CONFIG = {
  businessName: 'DUIM Barber',
  whatsapp: '5531999999999',
  address: 'Configure o endereço real da barbearia',
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=barbearia',
  googleReviewUrl: 'https://www.google.com/search?q=DUIM+Barber+avaliar+no+Google',
  currency: 'BRL',
  slotStepMinutes: 30,
  catalogOnly: true,
  servicePaymentMode: 'presencial'
};

export function isSupabaseReady() {
  return Boolean(
    window.supabase &&
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('COLE_AQUI') &&
    !SUPABASE_ANON_KEY.includes('COLE_AQUI')
  );
}

export function getSupabaseClient() {
  if (!isSupabaseReady()) return null;
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: APP_CONFIG.currency }).format(Number(value || 0));
}

export function whatsappLink(message = '') {
  const phone = String(APP_CONFIG.whatsapp || '').replace(/\D/g, '');
  const text = encodeURIComponent(message);
  return `https://wa.me/${phone}${text ? `?text=${text}` : ''}`;
}

export const MOCK_SERVICES = [
  { id: 'mock-corte', name: 'Corte masculino', description: 'Corte completo com acabamento alinhado.', price: 35, duration_minutes: 30, active: true },
  { id: 'mock-barba', name: 'Barba completa', description: 'Toalha quente, desenho e finalização.', price: 30, duration_minutes: 30, active: true },
  { id: 'mock-combo', name: 'Corte + barba', description: 'Combo completo para sair pronto.', price: 60, duration_minutes: 60, active: true }
];

export const MOCK_PRODUCTS = [
  { id: 'gel-modelador', name: 'Gel modelador', description: 'Fixação prática para o dia a dia.', price: 24.9, category: 'Finalizadores', image_url: 'https://images.unsplash.com/photo-1621607512214-68297480165e?q=80&w=900&auto=format&fit=crop', active: true, available: true, stock: 8 },
  { id: 'pomada', name: 'Pomada efeito matte', description: 'Acabamento natural, sem brilho exagerado.', price: 39.9, category: 'Finalizadores', image_url: 'https://images.unsplash.com/photo-1621607505833-616916c46a25?q=80&w=900&auto=format&fit=crop', active: true, available: true, stock: 5 },
  { id: 'oleo-barba', name: 'Óleo para barba', description: 'Hidratação e perfume para a barba.', price: 34.9, category: 'Barba', image_url: 'https://images.unsplash.com/photo-1585751119414-ef2636f8aede?q=80&w=900&auto=format&fit=crop', active: true, available: true, stock: 3 }
];

export const MOCK_WORKING_HOURS = [
  { weekday: 0, is_open: false, open_time: '09:00', close_time: '18:00', break_start: null, break_end: null },
  { weekday: 1, is_open: true, open_time: '09:00', close_time: '19:00', break_start: '12:00', break_end: '13:00' },
  { weekday: 2, is_open: true, open_time: '09:00', close_time: '19:00', break_start: '12:00', break_end: '13:00' },
  { weekday: 3, is_open: true, open_time: '09:00', close_time: '19:00', break_start: '12:00', break_end: '13:00' },
  { weekday: 4, is_open: true, open_time: '09:00', close_time: '19:00', break_start: '12:00', break_end: '13:00' },
  { weekday: 5, is_open: true, open_time: '09:00', close_time: '19:00', break_start: '12:00', break_end: '13:00' },
  { weekday: 6, is_open: true, open_time: '08:00', close_time: '16:00', break_start: null, break_end: null }
];
