import {
  APP_CONFIG,
  MOCK_PRODUCTS,
  MOCK_SERVICES,
  MOCK_WORKING_HOURS,
  formatCurrency,
  getSupabaseClient,
  isSupabaseReady,
  whatsappLink
} from './supabase.js';

const db = getSupabaseClient();
const state = {
  services: [],
  products: [],
  workingHours: [],
  busySlots: [],
  blocks: [],
  selectedDate: new Date(),
  selectedSlot: '',
  selectedCategory: 'Todos'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  servicesGrid: $('#servicesGrid'),
  serviceSelect: $('#serviceSelect'),
  productsGrid: $('#productsGrid'),
  categoryTabs: $('#categoryTabs'),
  dateInput: $('#dateInput'),
  selectedTime: $('#selectedTime'),
  slotsGrid: $('#slotsGrid'),
  dayMessage: $('#dayMessage'),
  slotDateTitle: $('#slotDateTitle'),
  slotDateSubtitle: $('#slotDateSubtitle'),
  bookingForm: $('#bookingForm'),
  toast: $('#toast'),
  menuToggle: $('#menuToggle'),
  mobileDrawer: $('#mobileDrawer'),
  prevDay: $('#prevDay'),
  nextDay: $('#nextDay')
};

init();

async function init() {
  setupMenu();
  setupReveal();
  setupBottomNav();
  setupDateInput();
  setupListeners();
  await loadInitialData();
  setupStaticLinks();
  renderAll();
}

function setupStaticLinks() {
  const defaultWhatsapp = whatsappLink('Olá, vim pelo site e gostaria de atendimento.');
  ['headerWhats', 'drawerWhats', 'floatWhats', 'locationWhats'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.href = defaultWhatsapp;
  });

  const address = APP_CONFIG.address;
  const mapUrl = APP_CONFIG.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const mapFrame = document.getElementById('mapFrame');
  const mapsButton = document.getElementById('mapsButton');
  const reviewButton = document.getElementById('reviewButton');
  const addressEl = document.getElementById('businessAddress');

  if (addressEl) addressEl.textContent = address;
  if (mapsButton) mapsButton.href = mapUrl;
  if (reviewButton) reviewButton.href = APP_CONFIG.googleReviewUrl;
  if (mapFrame) {
    const query = encodeURIComponent(address || 'barbearia');
    mapFrame.src = `https://www.google.com/maps?q=${query}&output=embed`;
  }
}

function setupMenu() {
  els.menuToggle?.addEventListener('click', () => {
    const open = !els.mobileDrawer.classList.contains('open');
    els.mobileDrawer.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    els.menuToggle.setAttribute('aria-expanded', String(open));
  });

  els.mobileDrawer?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      els.mobileDrawer.classList.remove('open');
      document.body.classList.remove('menu-open');
      els.menuToggle?.setAttribute('aria-expanded', 'false');
    });
  });
}

function setupReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach((el) => observer.observe(el));
}

function setupBottomNav() {
  const navLinks = $$('.bottom-nav a, .nav-desktop a');
  const sections = ['topo', 'servicos', 'agenda', 'loja', 'localizacao'].map((id) => document.getElementById(id)).filter(Boolean);
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
  }, { threshold: [0.25, 0.45, 0.65] });
  sections.forEach((section) => observer.observe(section));
}

function setupDateInput() {
  const today = toDateInputValue(new Date());
  els.dateInput.min = today;
  els.dateInput.value = today;
  state.selectedDate = parseDateInput(today);
}

function setupListeners() {
  els.serviceSelect?.addEventListener('change', () => {
    state.selectedSlot = '';
    els.selectedTime.value = '';
    renderSlots();
  });

  els.dateInput?.addEventListener('change', async () => {
    state.selectedDate = parseDateInput(els.dateInput.value);
    state.selectedSlot = '';
    els.selectedTime.value = '';
    await loadDayData();
    renderSlots();
  });

  els.prevDay?.addEventListener('click', () => shiftDay(-1));
  els.nextDay?.addEventListener('click', () => shiftDay(1));
  els.bookingForm?.addEventListener('submit', submitBooking);
}

async function loadInitialData() {
  await Promise.all([loadSettings(), loadServices(), loadProducts(), loadWorkingHours()]);
  await loadDayData();
}


async function loadSettings() {
  if (!db) return;
  const { data, error } = await db.from('business_settings').select('*').eq('id', 1).maybeSingle();
  if (error || !data) return;
  APP_CONFIG.businessName = data.business_name || APP_CONFIG.businessName;
  APP_CONFIG.whatsapp = data.whatsapp || APP_CONFIG.whatsapp;
  APP_CONFIG.address = data.address || APP_CONFIG.address;
  APP_CONFIG.googleMapsUrl = data.google_maps_url || APP_CONFIG.googleMapsUrl;
  APP_CONFIG.googleReviewUrl = data.google_review_url || APP_CONFIG.googleReviewUrl;
}

async function loadServices() {
  if (!db) {
    state.services = MOCK_SERVICES;
    return;
  }
  const { data, error } = await db.from('services').select('*').eq('active', true).order('position', { ascending: true });
  state.services = error || !data?.length ? MOCK_SERVICES : data;
}

async function loadProducts() {
  if (!db) {
    state.products = MOCK_PRODUCTS;
    return;
  }
  const { data, error } = await db.from('products').select('*').eq('active', true).order('created_at', { ascending: false });
  state.products = error || !data?.length ? MOCK_PRODUCTS : data;
}

async function loadWorkingHours() {
  if (!db) {
    state.workingHours = MOCK_WORKING_HOURS;
    return;
  }
  const { data, error } = await db.from('working_hours').select('*').order('weekday', { ascending: true });
  state.workingHours = error || !data?.length ? MOCK_WORKING_HOURS : data;
}

async function loadDayData() {
  const date = toDateInputValue(state.selectedDate);
  if (!db) {
    state.busySlots = JSON.parse(localStorage.getItem('duim_busy_slots') || '[]').filter((item) => item.date === date);
    state.blocks = JSON.parse(localStorage.getItem('duim_blocks') || '[]').filter((item) => item.date === date && item.active !== false);
    return;
  }

  const [busyRes, blocksRes] = await Promise.all([
    db.from('public_agenda_ocupada').select('*').eq('appointment_date', date),
    db.from('schedule_blocks').select('*').eq('block_date', date).eq('active', true)
  ]);

  state.busySlots = busyRes.error ? [] : (busyRes.data || []);
  state.blocks = blocksRes.error ? [] : (blocksRes.data || []);
}

function renderAll() {
  renderServices();
  renderProducts();
  renderSlots();
}

function renderServices() {
  els.servicesGrid.innerHTML = state.services.map((service) => `
    <article class="card service-card reveal visible">
      <div class="service-top">
        <div>
          <h3>${escapeHtml(service.name)}</h3>
          <p>${escapeHtml(service.description || 'Atendimento profissional com acabamento de qualidade.')}</p>
        </div>
        <strong class="price">${formatCurrency(service.price)}</strong>
      </div>
      <div class="chip-row">
        <span class="chip ok">${Number(service.duration_minutes || 30)} min</span>
        <span class="chip warn">Pagamento presencial</span>
      </div>
      <a class="btn btn-secondary" href="#agenda" data-service-id="${service.id}">Agendar este serviço</a>
    </article>
  `).join('');

  els.serviceSelect.innerHTML = state.services.map((service) => `
    <option value="${service.id}">${escapeHtml(service.name)} • ${formatCurrency(service.price)} • ${Number(service.duration_minutes || 30)}min</option>
  `).join('');

  els.servicesGrid.querySelectorAll('[data-service-id]').forEach((button) => {
    button.addEventListener('click', () => {
      els.serviceSelect.value = button.dataset.serviceId;
      renderSlots();
    });
  });
}

function renderProducts() {
  const categories = ['Todos', ...new Set(state.products.map((p) => p.category).filter(Boolean))];
  els.categoryTabs.innerHTML = categories.map((cat) => `
    <button class="tab-btn ${cat === state.selectedCategory ? 'active' : ''}" type="button" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>
  `).join('');

  els.categoryTabs.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.dataset.category;
      renderProducts();
    });
  });

  const visible = state.products.filter((product) => state.selectedCategory === 'Todos' || product.category === state.selectedCategory);

  els.productsGrid.innerHTML = visible.map((product) => {
    const available = product.available !== false && Number(product.stock ?? 1) !== 0;
    const message = `Olá, tenho interesse nesse produto: ${product.name}`;
    const image = product.image_url || `https://placehold.co/900x650/15100a/f1cc7b?text=${encodeURIComponent(product.name)}`;
    return `
      <article class="card product-card reveal visible">
        <img class="product-image" src="${escapeAttr(image)}" alt="${escapeAttr(product.name)}" loading="lazy" />
        <div class="product-body">
          <div class="product-meta">
            <div>
              <h3>${escapeHtml(product.name)}</h3>
              <p>${escapeHtml(product.description || 'Produto disponível no catálogo da barbearia.')}</p>
            </div>
            <span class="product-status ${available ? 'available' : 'unavailable'}">${available ? 'Disponível' : 'Indisponível'}</span>
          </div>
          <div class="service-top">
            <strong class="price">${formatCurrency(product.price)}</strong>
            ${product.category ? `<span class="chip">${escapeHtml(product.category)}</span>` : ''}
          </div>
          <a class="btn ${available ? 'btn-whats' : 'btn-secondary'}" ${available ? `href="${whatsappLink(message)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${available ? 'Tenho interesse' : 'Produto indisponível'}</a>
        </div>
      </article>
    `;
  }).join('') || `<div class="card"><h3>Nenhum produto nesta categoria</h3><p>Cadastre produtos no painel administrativo.</p></div>`;
}

function renderSlots() {
  const service = getSelectedService();
  const date = state.selectedDate;
  const dateValue = toDateInputValue(date);
  const weekday = date.getDay();
  const hours = state.workingHours.find((item) => Number(item.weekday) === weekday);
  const fullDayBlock = getFullDayBlock(dateValue);

  els.slotDateTitle.textContent = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  els.slotDateSubtitle.textContent = service ? `${service.name} • ${Number(service.duration_minutes || 30)} min` : 'Escolha um serviço';
  els.dayMessage.hidden = true;
  els.dayMessage.className = 'day-message';
  els.slotsGrid.innerHTML = '';

  if (fullDayBlock) {
    showDayMessage(fullDayBlock.message || 'A barbearia não atenderá neste dia.', 'blocked');
    return;
  }

  if (!hours || hours.is_open === false) {
    showDayMessage('A barbearia não atenderá neste dia.', 'blocked');
    return;
  }

  const slots = buildSlots(hours, Number(service?.duration_minutes || 30));
  const now = new Date();
  const isToday = dateValue === toDateInputValue(now);
  const rendered = slots.map((slot) => {
    const status = getSlotStatus(slot, service, isToday, now);
    const selected = state.selectedSlot === slot;
    const label = status === 'available' ? 'Livre' : status === 'blocked' ? 'Bloqueado' : 'Ocupado';
    return `<button type="button" class="slot ${status} ${selected ? 'selected' : ''}" ${status !== 'available' ? 'disabled' : ''} data-time="${slot}"><span>${slot}</span><small>${label}</small></button>`;
  }).join('');

  els.slotsGrid.innerHTML = rendered;
  els.slotsGrid.querySelectorAll('.slot.available').forEach((button) => {
    button.addEventListener('click', () => selectSlot(button.dataset.time));
  });

  if (!slots.length) {
    showDayMessage('Não há horários configurados para este dia.', 'blocked');
  } else if (!els.slotsGrid.querySelector('.slot.available')) {
    showDayMessage('Agenda cheia para esta data. Escolha outro dia.', 'full');
  }
}

function buildSlots(hours, duration) {
  const step = Number(APP_CONFIG.slotStepMinutes || 30);
  const open = timeToMinutes(hours.open_time);
  const close = timeToMinutes(hours.close_time);
  const breakStart = hours.break_start ? timeToMinutes(hours.break_start) : null;
  const breakEnd = hours.break_end ? timeToMinutes(hours.break_end) : null;
  const slots = [];

  for (let current = open; current + duration <= close; current += step) {
    const end = current + duration;
    const inBreak = breakStart !== null && breakEnd !== null && current < breakEnd && end > breakStart;
    if (!inBreak) slots.push(minutesToTime(current));
  }

  return slots;
}

function getSlotStatus(slot, service, isToday, now) {
  const duration = Number(service?.duration_minutes || 30);
  const start = timeToMinutes(slot);
  const end = start + duration;

  if (isToday) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (start <= nowMinutes) return 'occupied';
  }

  const partialBlock = state.blocks.find((block) => {
    if (!block.start_time || !block.end_time) return false;
    return start < timeToMinutes(block.end_time) && end > timeToMinutes(block.start_time);
  });
  if (partialBlock) return 'blocked';

  const busy = state.busySlots.find((busySlot) => {
    const busyStartTime = busySlot.appointment_time || busySlot.time || busySlot.start_time;
    const busyDuration = Number(busySlot.duration_minutes || 30);
    if (!busyStartTime) return false;
    const busyStart = timeToMinutes(busyStartTime.slice(0, 5));
    const busyEnd = busyStart + busyDuration;
    const busyStatus = busySlot.status || 'scheduled';
    return !['cancelled', 'canceled'].includes(busyStatus) && start < busyEnd && end > busyStart;
  });

  return busy ? 'occupied' : 'available';
}

function getFullDayBlock(dateValue) {
  return state.blocks.find((block) => {
    const blockDate = block.block_date || block.date;
    return blockDate === dateValue && (!block.start_time || !block.end_time) && block.active !== false;
  });
}

function showDayMessage(message, type) {
  els.dayMessage.hidden = false;
  els.dayMessage.textContent = message;
  els.dayMessage.classList.add(type);
}

function selectSlot(slot) {
  state.selectedSlot = slot;
  els.selectedTime.value = slot;
  renderSlots();
}

async function shiftDay(days) {
  const next = new Date(state.selectedDate);
  next.setDate(next.getDate() + days);
  const today = parseDateInput(toDateInputValue(new Date()));
  if (next < today) return;
  state.selectedDate = next;
  els.dateInput.value = toDateInputValue(next);
  state.selectedSlot = '';
  els.selectedTime.value = '';
  await loadDayData();
  renderSlots();
}

async function submitBooking(event) {
  event.preventDefault();
  const service = getSelectedService();
  const payload = {
    client_name: $('#clientName').value.trim(),
    client_phone: $('#clientPhone').value.trim(),
    service_id: service?.id,
    appointment_date: els.dateInput.value,
    appointment_time: els.selectedTime.value,
    notes: $('#notes').value.trim()
  };

  if (!payload.appointment_time) {
    toast('Escolha um horário disponível antes de confirmar.', 'error');
    return;
  }

  if (!isSupabaseReady()) {
    saveMockBooking(payload, service);
    toast('Agendamento salvo em modo demonstração. Configure o Supabase para salvar no banco.', 'success');
    els.bookingForm.reset();
    setupDateInput();
    await loadDayData();
    renderSlots();
    return;
  }

  const button = els.bookingForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Confirmando...';

  try {
    const { data, error } = await db.functions.invoke('criar-agendamento', { body: payload });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Não foi possível agendar.');
    toast('Agendamento confirmado! Aguardamos você na barbearia.', 'success');
    els.bookingForm.reset();
    setupDateInput();
    await loadDayData();
    renderSlots();
  } catch (err) {
    toast(err.message || 'Erro ao confirmar agendamento.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Confirmar agendamento';
  }
}

function saveMockBooking(payload, service) {
  const current = JSON.parse(localStorage.getItem('duim_busy_slots') || '[]');
  current.push({
    date: payload.appointment_date,
    appointment_date: payload.appointment_date,
    appointment_time: payload.appointment_time,
    duration_minutes: service?.duration_minutes || 30,
    status: 'scheduled'
  });
  localStorage.setItem('duim_busy_slots', JSON.stringify(current));
}

function getSelectedService() {
  return state.services.find((service) => String(service.id) === String(els.serviceSelect?.value)) || state.services[0];
}

function toast(message, type = 'success') {
  els.toast.textContent = message;
  els.toast.className = `toast ${type} show`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 4200);
}

function timeToMinutes(time) {
  const [h, m] = String(time).slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function toDateInputValue(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}
function escapeAttr(value = '') { return escapeHtml(value); }
