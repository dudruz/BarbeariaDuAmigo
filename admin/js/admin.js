import {
  APP_CONFIG,
  MOCK_PRODUCTS,
  MOCK_SERVICES,
  MOCK_WORKING_HOURS,
  formatCurrency,
  getSupabaseClient,
  isSupabaseReady
} from '../../assets/js/supabase.js';

const db = getSupabaseClient();
const state = {
  demo: false,
  session: null,
  admin: null,
  selectedDate: new Date(),
  periodType: 'day',
  services: [],
  products: [],
  appointments: [],
  sales: [],
  hours: [],
  blocks: [],
  settings: { ...APP_CONFIG }
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const els = {
  loginScreen: $('#loginScreen'),
  loginForm: $('#loginForm'),
  loginError: $('#loginError'),
  configWarning: $('#configWarning'),
  appShell: $('#appShell'),
  sidebar: $('#sidebar'),
  openSidebar: $('#openSidebar'),
  closeSidebar: $('#closeSidebar'),
  logoutButton: $('#logoutButton'),
  todayLabel: $('#todayLabel'),
  adminName: $('#adminName'),
  periodType: $('#periodType'),
  prevPeriod: $('#prevPeriod'),
  todayPeriod: $('#todayPeriod'),
  nextPeriod: $('#nextPeriod'),
  refreshData: $('#refreshData'),
  metricCards: $('#metricCards'),
  weekPreview: $('#weekPreview'),
  appointmentList: $('#appointmentList'),
  serviceRanking: $('#serviceRanking'),
  saleForm: $('#saleForm'),
  saleProduct: $('#saleProduct'),
  productForm: $('#productForm'),
  adminProducts: $('#adminProducts'),
  hoursTable: $('#hoursTable'),
  blockForm: $('#blockForm'),
  blocksList: $('#blocksList'),
  settingsForm: $('#settingsForm'),
  toast: $('#toast')
};

init();

async function init() {
  setupLayout();
  setupAuth();
  setupActions();

  if (!isSupabaseReady() || !db) {
    els.configWarning.hidden = false;
    showLoginError('O login seguro exige Supabase configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY antes de usar o painel.', true);
    return;
  }

  const { data } = await db.auth.getSession();
  if (data?.session) {
    const ok = await checkAdmin(data.session.user.email);
    if (ok) {
      await enterApp(data.session);
    } else {
      await db.auth.signOut();
      showLoginError('Acesso negado. Este e-mail não está liberado como administrador.');
    }
  }
}

function setupLayout() {
  els.todayLabel.textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  els.openSidebar?.addEventListener('click', () => els.sidebar.classList.add('open'));
  els.closeSidebar?.addEventListener('click', () => els.sidebar.classList.remove('open'));
  $$('.nav-link').forEach((link) => link.addEventListener('click', () => {
    $$('.nav-link').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
    els.sidebar.classList.remove('open');
  }));
}

function setupAuth() {
  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('#email').value.trim().toLowerCase();
    const password = $('#password').value;
    hideLoginError();

    if (!isSupabaseReady() || !db) {
      showLoginError('Configure o Supabase antes de usar o login por e-mail e senha.');
      return;
    }

    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      showLoginError('E-mail ou senha inválidos. Confira também se o usuário foi criado no Supabase Auth.');
      return;
    }

    const ok = await checkAdmin(data.user.email);
    if (!ok) {
      await db.auth.signOut();
      showLoginError('Acesso negado. Este e-mail entrou no Auth, mas não está liberado na tabela admin_users.');
      return;
    }

    await enterApp(data.session);
  });

  els.logoutButton.addEventListener('click', async () => {
    if (db) await db.auth.signOut();
    location.reload();
  });
}

async function checkAdmin(email) {
  if (!db) return false;
  const { data, error } = await db.from('admin_users').select('email, name, active').eq('email', email).eq('active', true).maybeSingle();
  if (error || !data) return false;
  state.admin = data;
  return true;
}

async function enterApp(session) {
  state.session = session;
  els.loginScreen.classList.add('hidden');
  els.appShell.classList.remove('hidden');
  els.adminName.textContent = state.admin?.name || session.user?.email || 'Administrador';
  await loadAll();
  renderAll();
}

function showLoginError(message, isError = true) {
  els.loginError.hidden = false;
  els.loginError.textContent = message;
  els.loginError.className = isError ? 'error' : 'warning';
}
function hideLoginError() { els.loginError.hidden = true; }

function setupActions() {
  els.periodType.addEventListener('change', async () => {
    state.periodType = els.periodType.value;
    await loadDynamicData();
    renderAll();
  });
  els.prevPeriod.addEventListener('click', async () => shiftPeriod(-1));
  els.nextPeriod.addEventListener('click', async () => shiftPeriod(1));
  els.todayPeriod.addEventListener('click', async () => {
    state.selectedDate = new Date();
    await loadDynamicData();
    renderAll();
  });
  els.refreshData.addEventListener('click', async () => {
    await loadAll();
    renderAll();
    toast('Dados atualizados.', 'success');
  });
  els.saleForm.addEventListener('submit', saveSale);
  els.productForm.addEventListener('submit', saveProduct);
  $('#clearProductForm').addEventListener('click', clearProductForm);
  els.blockForm.addEventListener('submit', saveBlock);
  els.settingsForm.addEventListener('submit', saveSettings);
}

async function shiftPeriod(direction) {
  const d = new Date(state.selectedDate);
  if (state.periodType === 'day') d.setDate(d.getDate() + direction);
  if (state.periodType === 'week') d.setDate(d.getDate() + direction * 7);
  if (state.periodType === 'month') d.setMonth(d.getMonth() + direction);
  state.selectedDate = d;
  await loadDynamicData();
  renderAll();
}

async function loadAll() {
  await Promise.all([loadServices(), loadProducts(), loadHours(), loadSettings()]);
  await loadDynamicData();
}
async function loadDynamicData() {
  await Promise.all([loadAppointments(), loadSales(), loadBlocks()]);
}

async function loadServices() {
  if (state.demo) { state.services = readLocal('duim_services', MOCK_SERVICES); return; }
  const { data, error } = await db.from('services').select('*').order('position', { ascending: true });
  state.services = error || !data?.length ? MOCK_SERVICES : data;
}
async function loadProducts() {
  if (state.demo) { state.products = readLocal('duim_admin_products', MOCK_PRODUCTS); return; }
  const { data, error } = await db.from('products').select('*').order('created_at', { ascending: false });
  state.products = error ? [] : data;
}
async function loadHours() {
  if (state.demo) { state.hours = readLocal('duim_hours', MOCK_WORKING_HOURS); return; }
  const { data, error } = await db.from('working_hours').select('*').order('weekday', { ascending: true });
  state.hours = error || !data?.length ? MOCK_WORKING_HOURS : data;
}
async function loadSettings() {
  if (state.demo) { state.settings = readLocal('duim_settings', { ...APP_CONFIG }); return; }
  const { data, error } = await db.from('business_settings').select('*').eq('id', 1).maybeSingle();
  if (!error && data) state.settings = { ...state.settings, ...data };
}
async function loadAppointments() {
  const { start, end } = getPeriodRange();
  if (state.demo) {
    state.appointments = readLocal('duim_appointments', makeDemoAppointments()).filter((a) => between(a.appointment_date, start, end));
    return;
  }
  const { data, error } = await db.from('appointments').select('*, services(name, price, duration_minutes)').gte('appointment_date', start).lte('appointment_date', end).order('appointment_date').order('appointment_time');
  state.appointments = error ? [] : data;
}
async function loadSales() {
  const { start, end } = getPeriodRange();
  if (state.demo) {
    state.sales = readLocal('duim_product_sales', []).filter((s) => between(s.sale_date, start, end));
    return;
  }
  const { data, error } = await db.from('product_sales').select('*, products(name, price)').gte('sale_date', start).lte('sale_date', end).order('created_at', { ascending: false });
  state.sales = error ? [] : data;
}
async function loadBlocks() {
  const { start, end } = getPeriodRange();
  if (state.demo) {
    state.blocks = readLocal('duim_blocks_admin', []).filter((b) => between(b.block_date || b.date, start, end));
    return;
  }
  const { data, error } = await db.from('schedule_blocks').select('*').gte('block_date', start).lte('block_date', end).order('block_date');
  state.blocks = error ? [] : data;
}

function renderAll() {
  renderMetrics();
  renderWeekPreview();
  renderAppointments();
  renderSaleForm();
  renderServiceRanking();
  renderProducts();
  renderHours();
  renderBlocks();
  renderSettings();
  els.todayLabel.textContent = periodLabel();
}

function renderMetrics() {
  const paidServices = state.appointments.filter((a) => a.payment_status === 'paid' && a.status !== 'cancelled');
  const scheduledServices = state.appointments.filter((a) => a.status !== 'cancelled');
  const servicePaidTotal = paidServices.reduce((sum, item) => sum + Number(item.price || item.services?.price || 0), 0);
  const serviceExpected = scheduledServices.reduce((sum, item) => sum + Number(item.price || item.services?.price || 0), 0);
  const productTotal = state.sales.reduce((sum, item) => sum + Number(item.total_amount || Number(item.quantity || 1) * Number(item.unit_price || item.products?.price || 0)), 0);
  const selectedDate = toDateInputValue(state.selectedDate);
  const dayAppointments = state.appointments.filter((a) => a.appointment_date === selectedDate && a.status !== 'cancelled').length;
  const freeBusy = countFreeBusyForDate(selectedDate);

  const metrics = [
    { label: 'Recebido no período', value: formatCurrency(servicePaidTotal + productTotal), hint: 'Serviços pagos + produtos', cls: 'ok' },
    { label: 'Previsto em serviços', value: formatCurrency(serviceExpected), hint: 'Agendamentos não cancelados', cls: 'warn' },
    { label: 'Agendamentos', value: scheduledServices.length, hint: `${dayAppointments} no dia selecionado`, cls: 'info' },
    { label: 'Horários livres/ocupados', value: `${freeBusy.free}/${freeBusy.busy}`, hint: 'Dia selecionado', cls: '' },
    { label: 'Produtos vendidos', value: formatCurrency(productTotal), hint: `${state.sales.length} venda(s)`, cls: 'ok' },
    { label: 'Cancelamentos', value: state.appointments.filter((a) => a.status === 'cancelled').length, hint: 'No período', cls: '' },
    { label: 'Produtos ativos', value: state.products.filter((p) => p.active !== false).length, hint: 'Catálogo público', cls: 'info' },
    { label: 'Bloqueios/folgas', value: state.blocks.filter((b) => b.active !== false).length, hint: 'No período', cls: 'warn' }
  ];

  els.metricCards.innerHTML = metrics.map((m) => `<article class="card metric ${m.cls}"><span>${m.label}</span><strong>${m.value}</strong><small>${m.hint}</small></article>`).join('');
}

function renderWeekPreview() {
  const week = getWeekDays(state.selectedDate);
  els.weekPreview.innerHTML = week.map((date) => {
    const value = toDateInputValue(date);
    const total = state.appointments.filter((a) => a.appointment_date === value && a.status !== 'cancelled').length;
    const blocks = state.blocks.filter((b) => (b.block_date || b.date) === value && b.active !== false).length;
    const active = value === toDateInputValue(state.selectedDate);
    return `<button class="day-pill ${active ? 'active' : ''}" data-date="${value}"><strong>${date.toLocaleDateString('pt-BR', { weekday: 'short' })}</strong><small>${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small><span class="chip ${blocks ? 'danger' : total ? 'info' : 'ok'}">${blocks ? 'Bloq.' : `${total} ag.`}</span></button>`;
  }).join('');
  els.weekPreview.querySelectorAll('.day-pill').forEach((btn) => btn.addEventListener('click', async () => {
    state.selectedDate = parseDateInput(btn.dataset.date);
    state.periodType = 'day';
    els.periodType.value = 'day';
    await loadDynamicData();
    renderAll();
  }));
}

function renderAppointments() {
  const list = [...state.appointments].sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`));
  if (!list.length) {
    els.appointmentList.innerHTML = `<div class="empty">Nenhum agendamento neste período.</div>`;
    return;
  }
  els.appointmentList.innerHTML = list.map((a) => {
    const serviceName = a.services?.name || a.service_name || serviceNameById(a.service_id) || 'Serviço';
    const price = Number(a.price || a.services?.price || 0);
    const paid = a.payment_status === 'paid';
    const cancelled = a.status === 'cancelled';
    return `<article class="appointment-card ${paid ? 'paid' : ''} ${cancelled ? 'cancelled' : ''}">
      <div class="appointment-main">
        <div><strong class="appointment-time">${safe(a.appointment_time).slice(0,5)}</strong><h3>${safe(a.client_name || 'Cliente')}</h3><p>${formatDate(a.appointment_date)} • ${safe(serviceName)} • ${formatCurrency(price)}</p></div>
        <span class="chip ${cancelled ? 'danger' : paid ? 'ok' : 'warn'}">${cancelled ? 'Cancelado' : paid ? 'Pago' : 'A receber'}</span>
      </div>
      <p>${safe(a.client_phone || '')}${a.notes ? ` • ${safe(a.notes)}` : ''}</p>
      <div class="appointment-actions">
        <button class="btn btn-ok btn-sm" data-pay="${a.id}">Marcar pago</button>
        <button class="btn btn-secondary btn-sm" data-pending="${a.id}">A receber</button>
        <button class="btn btn-danger btn-sm" data-cancel="${a.id}">Cancelar</button>
      </div>
    </article>`;
  }).join('');
  els.appointmentList.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => updateAppointment(b.dataset.pay, { payment_status: 'paid', paid_at: new Date().toISOString() })));
  els.appointmentList.querySelectorAll('[data-pending]').forEach((b) => b.addEventListener('click', () => updateAppointment(b.dataset.pending, { payment_status: 'pending', paid_at: null })));
  els.appointmentList.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => updateAppointment(b.dataset.cancel, { status: 'cancelled' })));
}

function renderSaleForm() {
  const activeProducts = state.products.filter((p) => p.active !== false);
  els.saleProduct.innerHTML = activeProducts.map((p) => `<option value="${p.id}">${safe(p.name)} • ${formatCurrency(p.price)}</option>`).join('');
}

function renderServiceRanking() {
  const map = new Map();
  state.appointments.filter((a) => a.status !== 'cancelled').forEach((a) => {
    const name = a.services?.name || serviceNameById(a.service_id) || 'Serviço';
    map.set(name, (map.get(name) || 0) + 1);
  });
  const rows = [...map.entries()].sort((a,b) => b[1] - a[1]).slice(0, 5);
  els.serviceRanking.innerHTML = rows.length ? rows.map(([name, qty]) => `<div class="appointment-card"><div class="appointment-main"><strong>${safe(name)}</strong><span class="chip info">${qty} venda(s)</span></div></div>`).join('') : `<div class="empty">Sem dados suficientes.</div>`;
}

function renderProducts() {
  if (!state.products.length) {
    els.adminProducts.innerHTML = `<div class="empty">Nenhum produto cadastrado.</div>`;
    return;
  }
  els.adminProducts.innerHTML = state.products.map((p) => `<article class="product-item">
    <img src="${safeAttr(p.image_url || `https://placehold.co/160x160/15100a/f1cc7b?text=${encodeURIComponent(p.name || 'Produto')}`)}" alt="${safeAttr(p.name)}" />
    <div><h3>${safe(p.name)}</h3><p>${safe(p.category || 'Sem categoria')} • ${formatCurrency(p.price)} • Estoque: ${Number(p.stock || 0)}</p><div class="status-row"><span class="chip ${p.active !== false ? 'ok' : 'danger'}">${p.active !== false ? 'Ativo' : 'Inativo'}</span><span class="chip ${p.available !== false ? 'ok' : 'danger'}">${p.available !== false ? 'Disponível' : 'Indisponível'}</span></div></div>
    <div class="product-item-actions"><button class="btn btn-secondary btn-sm" data-edit-product="${p.id}">Editar</button><button class="btn btn-secondary btn-sm" data-toggle-available="${p.id}">${p.available !== false ? 'Indisponibilizar' : 'Disponibilizar'}</button><button class="btn btn-secondary btn-sm" data-toggle-active="${p.id}">${p.active !== false ? 'Desativar' : 'Ativar'}</button><button class="btn btn-danger btn-sm" data-delete-product="${p.id}">Excluir</button></div>
  </article>`).join('');

  els.adminProducts.querySelectorAll('[data-edit-product]').forEach((btn) => btn.addEventListener('click', () => editProduct(btn.dataset.editProduct)));
  els.adminProducts.querySelectorAll('[data-toggle-available]').forEach((btn) => btn.addEventListener('click', () => toggleProduct(btn.dataset.toggleAvailable, 'available')));
  els.adminProducts.querySelectorAll('[data-toggle-active]').forEach((btn) => btn.addEventListener('click', () => toggleProduct(btn.dataset.toggleActive, 'active')));
  els.adminProducts.querySelectorAll('[data-delete-product]').forEach((btn) => btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProduct)));
}

function renderHours() {
  const dayNames = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  els.hoursTable.innerHTML = dayNames.map((name, weekday) => {
    const item = state.hours.find((h) => Number(h.weekday) === weekday) || { weekday, is_open: false, open_time: '09:00', close_time: '18:00', break_start: '', break_end: '' };
    return `<tr data-weekday="${weekday}">
      <td><strong>${name}</strong></td>
      <td><select class="select" data-hour="is_open"><option value="true" ${item.is_open !== false ? 'selected' : ''}>Sim</option><option value="false" ${item.is_open === false ? 'selected' : ''}>Não</option></select></td>
      <td><input class="input" type="time" data-hour="open_time" value="${safeAttr(item.open_time || '09:00')}"></td>
      <td><input class="input" type="time" data-hour="close_time" value="${safeAttr(item.close_time || '18:00')}"></td>
      <td><input class="input" type="time" data-hour="break_start" value="${safeAttr(item.break_start || '')}"></td>
      <td><input class="input" type="time" data-hour="break_end" value="${safeAttr(item.break_end || '')}"></td>
      <td><button class="btn btn-primary btn-sm" data-save-hour="${weekday}">Salvar</button></td>
    </tr>`;
  }).join('');
  els.hoursTable.querySelectorAll('[data-save-hour]').forEach((btn) => btn.addEventListener('click', () => saveHour(Number(btn.dataset.saveHour))));
}

function renderBlocks() {
  els.blocksList.innerHTML = state.blocks.length ? state.blocks.map((b) => `<article class="appointment-card">
    <div class="appointment-main"><div><h3>${formatDate(b.block_date || b.date)}</h3><p>${safe(b.start_time ? `${b.start_time.slice(0,5)} às ${b.end_time?.slice(0,5)}` : 'Dia inteiro')} • ${safe(b.block_type || b.type || 'bloqueio')}</p></div><span class="chip danger">${b.active !== false ? 'Ativo' : 'Inativo'}</span></div>
    <p>${safe(b.message || 'A barbearia não atenderá neste dia.')}</p>
    <div class="appointment-actions"><button class="btn btn-danger btn-sm" data-remove-block="${b.id}">Remover</button></div>
  </article>`).join('') : `<div class="empty">Nenhum bloqueio no período.</div>`;
  els.blocksList.querySelectorAll('[data-remove-block]').forEach((btn) => btn.addEventListener('click', () => removeBlock(btn.dataset.removeBlock)));
}

function renderSettings() {
  $('#settingName').value = state.settings.business_name || state.settings.businessName || '';
  $('#settingWhatsapp').value = state.settings.whatsapp || '';
  $('#settingAddress').value = state.settings.address || '';
  $('#settingReview').value = state.settings.google_review_url || state.settings.googleReviewUrl || '';
}

async function updateAppointment(id, patch) {
  if (state.demo) {
    const all = readLocal('duim_appointments', makeDemoAppointments()).map((a) => String(a.id) === String(id) ? { ...a, ...patch } : a);
    writeLocal('duim_appointments', all);
  } else {
    const { error } = await db.from('appointments').update(patch).eq('id', id);
    if (error) return toast(error.message, 'error');
  }
  await loadDynamicData(); renderAll(); toast('Agendamento atualizado.', 'success');
}

async function saveSale(event) {
  event.preventDefault();
  const product = state.products.find((p) => String(p.id) === String(els.saleProduct.value));
  if (!product) return toast('Selecione um produto.', 'error');
  const qty = Number($('#saleQty').value || 1);
  const sale = { id: crypto.randomUUID(), product_id: product.id, product_name: product.name, quantity: qty, unit_price: Number(product.price || 0), total_amount: qty * Number(product.price || 0), sale_date: toDateInputValue(new Date()), notes: $('#saleNote').value.trim(), created_at: new Date().toISOString() };
  if (state.demo) {
    writeLocal('duim_product_sales', [sale, ...readLocal('duim_product_sales', [])]);
  } else {
    const { error } = await db.from('product_sales').insert(sale);
    if (error) return toast(error.message, 'error');
  }
  els.saleForm.reset(); $('#saleQty').value = 1; await loadDynamicData(); renderAll(); toast('Venda registrada.', 'success');
}

async function saveProduct(event) {
  event.preventDefault();
  const id = $('#productId').value || crypto.randomUUID();
  const product = {
    id,
    name: $('#productName').value.trim(),
    description: $('#productDescription').value.trim(),
    price: Number($('#productPrice').value || 0),
    category: $('#productCategory').value.trim() || null,
    image_url: $('#productImage').value.trim() || null,
    stock: Number($('#productStock').value || 0),
    available: $('#productAvailable').value === 'true',
    active: $('#productActive').value === 'true'
  };
  if (state.demo) {
    const all = readLocal('duim_admin_products', MOCK_PRODUCTS);
    const exists = all.some((p) => String(p.id) === String(id));
    writeLocal('duim_admin_products', exists ? all.map((p) => String(p.id) === String(id) ? product : p) : [product, ...all]);
  } else {
    const { error } = await db.from('products').upsert(product);
    if (error) return toast(error.message, 'error');
  }
  clearProductForm(); await loadProducts(); renderAll(); toast('Produto salvo.', 'success');
}
function editProduct(id) {
  const p = state.products.find((item) => String(item.id) === String(id));
  if (!p) return;
  $('#productId').value = p.id; $('#productName').value = p.name || ''; $('#productDescription').value = p.description || ''; $('#productPrice').value = p.price || 0; $('#productCategory').value = p.category || ''; $('#productImage').value = p.image_url || ''; $('#productStock').value = p.stock ?? 0; $('#productAvailable').value = String(p.available !== false); $('#productActive').value = String(p.active !== false);
  location.hash = '#lojaAdmin';
}
function clearProductForm() { els.productForm.reset(); $('#productId').value = ''; $('#productStock').value = 1; $('#productAvailable').value = 'true'; $('#productActive').value = 'true'; }
async function toggleProduct(id, field) {
  const p = state.products.find((item) => String(item.id) === String(id));
  if (!p) return;
  const patch = { [field]: !(p[field] !== false) };
  if (state.demo) writeLocal('duim_admin_products', readLocal('duim_admin_products', MOCK_PRODUCTS).map((item) => String(item.id) === String(id) ? { ...item, ...patch } : item));
  else { const { error } = await db.from('products').update(patch).eq('id', id); if (error) return toast(error.message, 'error'); }
  await loadProducts(); renderAll(); toast('Produto atualizado.', 'success');
}
async function deleteProduct(id) {
  if (!confirm('Excluir este produto?')) return;
  if (state.demo) writeLocal('duim_admin_products', readLocal('duim_admin_products', MOCK_PRODUCTS).filter((p) => String(p.id) !== String(id)));
  else { const { error } = await db.from('products').delete().eq('id', id); if (error) return toast(error.message, 'error'); }
  await loadProducts(); renderAll(); toast('Produto excluído.', 'success');
}

async function saveHour(weekday) {
  const row = els.hoursTable.querySelector(`[data-weekday="${weekday}"]`);
  const get = (name) => row.querySelector(`[data-hour="${name}"]`).value;
  const payload = { weekday, is_open: get('is_open') === 'true', open_time: get('open_time') || '09:00', close_time: get('close_time') || '18:00', break_start: get('break_start') || null, break_end: get('break_end') || null };
  if (state.demo) writeLocal('duim_hours', upsertByKey(readLocal('duim_hours', MOCK_WORKING_HOURS), payload, 'weekday'));
  else { const { error } = await db.from('working_hours').upsert(payload, { onConflict: 'weekday' }); if (error) return toast(error.message, 'error'); }
  await loadHours(); renderAll(); toast('Horário salvo.', 'success');
}

async function saveBlock(event) {
  event.preventDefault();
  const payload = { id: crypto.randomUUID(), block_date: $('#blockDate').value, start_time: $('#blockStart').value || null, end_time: $('#blockEnd').value || null, block_type: $('#blockType').value, message: $('#blockMessage').value.trim() || 'A barbearia não atenderá neste dia.', active: true };
  if (Boolean(payload.start_time) !== Boolean(payload.end_time)) return toast('Preencha início e fim, ou deixe os dois vazios para bloquear o dia inteiro.', 'error');
  if (state.demo) writeLocal('duim_blocks_admin', [payload, ...readLocal('duim_blocks_admin', [])]);
  else { const { error } = await db.from('schedule_blocks').insert(payload); if (error) return toast(error.message, 'error'); }
  els.blockForm.reset(); $('#blockMessage').value = 'A barbearia não atenderá neste dia.'; await loadDynamicData(); renderAll(); toast('Bloqueio cadastrado.', 'success');
}
async function removeBlock(id) {
  if (state.demo) writeLocal('duim_blocks_admin', readLocal('duim_blocks_admin', []).filter((b) => String(b.id) !== String(id)));
  else { const { error } = await db.from('schedule_blocks').update({ active: false }).eq('id', id); if (error) return toast(error.message, 'error'); }
  await loadDynamicData(); renderAll(); toast('Bloqueio removido.', 'success');
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = { id: 1, business_name: $('#settingName').value.trim(), whatsapp: $('#settingWhatsapp').value.trim(), address: $('#settingAddress').value.trim(), google_review_url: $('#settingReview').value.trim(), updated_at: new Date().toISOString() };
  if (state.demo) writeLocal('duim_settings', payload);
  else { const { error } = await db.from('business_settings').upsert(payload); if (error) return toast(error.message, 'error'); }
  await loadSettings(); renderAll(); toast('Configurações salvas.', 'success');
}

function countFreeBusyForDate(dateValue) {
  const weekday = parseDateInput(dateValue).getDay();
  const hours = state.hours.find((h) => Number(h.weekday) === weekday);
  const fullBlock = state.blocks.some((b) => (b.block_date || b.date) === dateValue && !b.start_time && !b.end_time && b.active !== false);
  if (!hours || hours.is_open === false || fullBlock) return { free: 0, busy: 0 };
  const slots = buildSlots(hours, 30);
  const busy = state.appointments.filter((a) => a.appointment_date === dateValue && a.status !== 'cancelled').length;
  return { free: Math.max(slots.length - busy, 0), busy };
}
function buildSlots(hours, duration) {
  const open = timeToMinutes(hours.open_time); const close = timeToMinutes(hours.close_time); const slots=[];
  for(let t=open; t+duration<=close; t+=30) slots.push(t);
  return slots;
}
function getPeriodRange() {
  const d = new Date(state.selectedDate);
  if (state.periodType === 'day') return { start: toDateInputValue(d), end: toDateInputValue(d) };
  if (state.periodType === 'week') { const week = getWeekDays(d); return { start: toDateInputValue(week[0]), end: toDateInputValue(week[6]) }; }
  const first = new Date(d.getFullYear(), d.getMonth(), 1); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); return { start: toDateInputValue(first), end: toDateInputValue(last) };
}
function periodLabel() { const { start, end } = getPeriodRange(); return start === end ? formatDate(start) : `${formatDate(start)} até ${formatDate(end)}`; }
function getWeekDays(date) { const d = new Date(date); const day = d.getDay(); const mondayOffset = day === 0 ? -6 : 1 - day; const monday = new Date(d); monday.setDate(d.getDate() + mondayOffset); return Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(monday.getDate() + i); return x; }); }
function between(date, start, end) { return date >= start && date <= end; }
function serviceNameById(id) { return state.services.find((s) => String(s.id) === String(id))?.name; }
function timeToMinutes(time) { const [h,m] = String(time || '00:00').slice(0,5).split(':').map(Number); return h*60+(m||0); }
function toDateInputValue(date) { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseDateInput(value) { const [y,m,d] = value.split('-').map(Number); return new Date(y, m-1, d); }
function formatDate(value) { return parseDateInput(value).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }); }
function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function writeLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function upsertByKey(list, item, key) { const exists = list.some((x) => String(x[key]) === String(item[key])); return exists ? list.map((x) => String(x[key]) === String(item[key]) ? item : x) : [...list, item]; }
function safe(v='') { return String(v).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function safeAttr(v='') { return safe(v); }
function toast(message, type='success') { els.toast.textContent = message; els.toast.className = `toast ${type} show`; clearTimeout(toast.timer); toast.timer = setTimeout(() => els.toast.classList.remove('show'), 3500); }
function makeDemoAppointments() {
  const today = toDateInputValue(new Date());
  return [
    { id: 'demo-1', appointment_date: today, appointment_time: '09:00', client_name: 'Cliente exemplo', client_phone: '(31) 99999-0000', service_id: 'mock-corte', service_name: 'Corte masculino', price: 35, status: 'scheduled', payment_status: 'pending' },
    { id: 'demo-2', appointment_date: today, appointment_time: '10:30', client_name: 'João', client_phone: '(31) 98888-0000', service_id: 'mock-combo', service_name: 'Corte + barba', price: 60, status: 'scheduled', payment_status: 'paid' }
  ];
}
