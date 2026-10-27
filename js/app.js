import { createSync } from './sync.js';
import { GitHubError } from './github.js';

import { $, h, ago, tile } from './ui.js';
import { viewResumen } from './views/resumen.js';
import { viewLista } from './views/lista.js';

const APP_VERSION = '2.1';

// ---------- Estado ----------
const sync = createSync({ onChange: () => render(), onStatus: (s) => renderStatus(s), onLog: () => { if (page === 'historial') render(); } });
let page = 'resumen';
const TITLES = { resumen: 'Resumen', lista: 'Lista', productos: 'Productos', recurrentes: 'Recurrentes', deudas: 'Deudas', ajustes: 'Ajustes', historial: 'Historial', setup: 'Control de gastos' };

function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(msg);
  if (action) t.append(h('button', { type: 'button', onclick: () => { t.hidden = true; action.fn(); } }, action.label));
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, action ? 12000 : 3500);
}

function renderStatus(s) {
  const pill = $('#sync-pill');
  if (!sync.config) { pill.hidden = true; return; }
  pill.hidden = false;
  let state = s.state, text;
  if (s.state === 'checking') {
    if (s.message === 'reintento') { state = 'offline'; text = s.pending ? `Sin conexión · ${s.pending} por subir` : 'Sin conexión · reintentando'; }
    else { state = 'syncing'; text = 'Revisando cambios…'; }
  } else if (s.state === 'uploading' || s.state === 'downloading') { state = 'syncing'; text = `${s.message}…`; }
  else if (s.state === 'offline') text = s.pending ? `Sin conexión · ${s.pending} por subir` : 'Sin conexión';
  else if (s.state === 'error') text = 'Error al sincronizar';
  else if (s.pending) { state = 'pending'; text = `${s.pending} por subir`; }
  else text = `Al día · ${ago(s.lastSync)}`;
  pill.dataset.state = state;
  pill.dataset.dir = s.state === 'uploading' ? 'up' : s.state === 'downloading' ? 'down' : '';
  $('#sync-text').textContent = text;
  pill.setAttribute('aria-label', `${text}. Ver historial`);
  if (page === 'ajustes' || page === 'historial') render();
}

// ---------- Navegación ----------
const SUB = new Set(['historial', 'ajustes']);
let back = 'resumen';
function go(p) {
  if (SUB.has(p) && !SUB.has(page) && page !== 'setup') back = page;
  page = p;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.page === p));
  if (p !== 'setup') history.replaceState(null, '', '#' + p);
  window.scrollTo({ top: 0 });
  render();
}
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => go(t.dataset.page));
// Ajustes e Historial se abren encima de la página donde estabas; la flecha o el mismo botón te regresan.
$('#btn-ajustes').addEventListener('click', () => go(page === 'ajustes' ? back : 'ajustes'));
$('#sync-pill').addEventListener('click', () => go(page === 'historial' ? back : 'historial'));
$('#btn-back').addEventListener('click', () => go(back));

// ---------- Páginas ----------
function render() {
  const main = $('#main');
  const connected = !!sync.config;
  $('#bottom-nav').hidden = !connected;
  $('#btn-ajustes').hidden = !connected;
  if (!connected) page = 'setup';
  $('#page-title').textContent = TITLES[page] || 'Control de gastos';
  $('#btn-back').hidden = !SUB.has(page) || !connected;
  $('#btn-back').setAttribute('aria-label', `Regresar a ${TITLES[back] || 'Resumen'}`);
  const view = { setup: viewSetup, resumen: needData(viewResumen), lista: needData(viewLista), ajustes: viewAjustes, historial: viewHistorial }[page] || viewProximamente;
  // Conserva lo que se está escribiendo si la página se vuelve a dibujar.
  const active = document.activeElement;
  const keep = active && active.id && main.contains(active) ? { id: active.id, value: active.value, pos: active.selectionStart } : null;
  main.replaceChildren(...[].concat(view()).filter((x) => x != null && x !== false));
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.value = keep.value; el.focus(); try { el.setSelectionRange(keep.pos, keep.pos); } catch (e) { /* select */ } }
  }
}

const setupState = { token: '', persona: 'Jose', dev: null };
function viewSetup() {
  if (setupState.dev == null) setupState.dev = guessDevice();
  const err = h('p', { class: 'error-msg', hidden: true });
  const tokenIn = h('input', { class: 'input', id: 'in-token', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'github_pat_…', oninput: (e) => { setupState.token = e.target.value; } });
  tokenIn.value = setupState.token;
  const devIn = h('input', { class: 'input', id: 'in-dev', type: 'text', placeholder: 'iPhone, iPad, MacBook…', oninput: (e) => { setupState.dev = e.target.value; } });
  devIn.value = setupState.dev;
  const seg = h('div', { class: 'seg' },
    ['Jose', 'Ali'].map((p) => h('button', { type: 'button', 'aria-pressed': String(p === setupState.persona), onclick: (e) => {
      setupState.persona = p;
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    } }, p)));
  const btn = h('button', { class: 'btn block', type: 'button', onclick: async () => {
    err.hidden = true;
    const token = tokenIn.value.trim();
    if (!token) { err.textContent = 'Pegá el token primero.'; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Revisando…';
    try {
      await sync.connect(token, setupState.persona, devIn.value.trim() || 'Dispositivo');
      setupState.token = '';
      try { await navigator.storage?.persist?.(); } catch (e) { /* opcional */ }
      page = 'resumen';
      render();
      toast('Conectado. Bajando los datos…');
      await sync.sync();
    } catch (e) {
      err.textContent = e instanceof GitHubError && e.status === 401 ? 'Ese token no es válido. Revisá que lo copiaste completo.'
        : e instanceof GitHubError && e.status === 404 ? 'Ese token no tiene acceso al repo control-gastos-datos.'
        : e instanceof GitHubError && e.status === 0 ? 'No hay conexión. Para conectar la primera vez se necesita internet.'
        : e.message;
      err.hidden = false;
      btn.disabled = false; btn.textContent = 'Conectar';
    }
  } }, 'Conectar');
  return h('div', { class: 'setup' },
    h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), h('h2', {}, 'Control de gastos')),
    h('div', { class: 'card' },
      h('h2', {}, 'Conectá este dispositivo'),
      h('p', { class: 'note' }, 'Se hace una sola vez por dispositivo. El token se queda guardado solo aquí.'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Entrá a ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'crear un token de GitHub'), '.'),
        h('li', {}, 'En ', h('b', {}, 'Repository access'), ' elegí ', h('b', {}, 'Only select repositories'), ' → ', h('code', {}, 'control-gastos-datos'), '.'),
        h('li', {}, 'En ', h('b', {}, 'Permissions → Contents'), ' elegí ', h('b', {}, 'Read and write'), '.'),
        h('li', {}, 'Generalo, copialo y pegalo aquí.')),
      h('div', { class: 'field' }, h('label', { for: 'in-token' }, 'Token de GitHub'), tokenIn),
      h('div', { class: 'field' }, h('label', {}, '¿Quién usa este dispositivo?'), seg),
      h('div', { class: 'field' }, h('label', { for: 'in-dev' }, 'Nombre del dispositivo'), devIn, h('span', { class: 'hint' }, 'Sale en el historial de cambios, para saber desde dónde se hizo cada cosa.')),
      err, btn));
}

function guessDevice() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Macintosh/.test(ua)) return 'MacBook';
  if (/Android/.test(ua)) return 'Android';
  return '';
}

function needData(fn) {
  return () => {
    if (!sync.hasData()) {
      return h('div', { class: 'card' }, h('h2', {}, 'Bajando los datos…'), h('p', { class: 'note' }, sync.status.state === 'offline' ? 'Sin conexión. Cuando vuelva el internet se bajan solos.' : 'Esto pasa solo la primera vez.'));
    }
    return fn({ sync, toast, go, rerender: render });
  };
}

function viewProximamente() {
  const fase = { productos: 3, recurrentes: 4, deudas: 4 }[page];
  const icon = document.querySelector(`.tab[data-page="${page}"] svg`)?.cloneNode(true);
  return h('div', { class: 'card coming' }, icon, h('h2', {}, TITLES[page]), h('p', { class: 'note' }, `Llega en la fase ${fase}. Los datos ya están guardados en el dispositivo.`));
}

function viewAjustes() {
  const s = sync.status;
  const c = sync.config;
  return [
    h('section', { class: 'card' },
      h('h2', {}, 'Este dispositivo'),
      h('dl', { class: 'kv' },
        h('dt', {}, 'Persona'), h('dd', {}, c.persona),
        h('dt', {}, 'Dispositivo'), h('dd', {}, c.dispositivo),
        h('dt', {}, 'Última sincronización'), h('dd', {}, s.lastSync ? new Date(s.lastSync).toLocaleString('es-CR') : 'nunca'),
        h('dt', {}, 'Cambios por subir'), h('dd', {}, String(s.pending)),
        h('dt', {}, 'Estado'), h('dd', {}, { idle: 'Al día', checking: 'Revisando', uploading: 'Subiendo', downloading: 'Bajando', offline: 'Sin conexión', error: 'Error' }[s.state] || s.state)),
      s.message ? h('p', { class: 'error-msg' }, s.message) : null,
      h('button', { class: 'btn block', type: 'button', onclick: () => sync.sync() }, 'Sincronizar ahora')),
    h('section', { class: 'card' },
      h('h2', {}, 'Desconectar'),
      h('p', { class: 'note' }, 'Borra el token y los datos guardados en este dispositivo. Lo que está en GitHub no se toca.' + (s.pending ? ` Ojo: hay ${s.pending} cambio(s) sin subir que se perderían.` : '')),
      h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
        if (!confirm('¿Desconectar este dispositivo? Vas a tener que pegar el token otra vez.')) return;
        await sync.disconnect();
        go('setup');
      } }, 'Desconectar este dispositivo')),
    h('p', { class: 'note', style: 'text-align:center' }, `Versión ${APP_VERSION}`),
    h('p', { class: 'note diag' }, diagText()),
  ];
}

const DIA = new Intl.DateTimeFormat('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
const HORA = new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit' });

function viewHistorial() {
  const s = sync.status;
  const cola = sync.queue;
  const log = sync.log;
  const busy = ['checking', 'uploading', 'downloading'].includes(s.state) && s.message !== 'reintento';
  const out = [];
  out.push(h('section', { class: 'card' },
    h('div', { class: 'hist-head' },
      h('div', {},
        h('h2', {}, busy ? $('#sync-text').textContent : s.state === 'offline' ? 'Sin conexión' : s.state === 'error' ? 'Error al sincronizar' : 'Al día'),
        h('p', { class: 'note', style: 'margin:0' }, `Última sincronización: ${s.lastSync ? `${ago(s.lastSync)} (${HORA.format(new Date(s.lastSync))})` : 'nunca'}`)),
      h('button', { class: 'btn', type: 'button', disabled: busy, onclick: () => sync.sync() }, busy ? 'Sincronizando…' : 'Sincronizar')),
    s.message && s.message !== 'reintento' && s.state === 'error' ? h('p', { class: 'error-msg', style: 'margin:12px 0 0' }, s.message) : null));
  if (cola.length) {
    out.push(h('section', { class: 'card' },
      h('h2', {}, `Esperando para subir (${cola.length})`),
      h('p', { class: 'note' }, 'Ya están guardados en este dispositivo. Se suben solos cuando haya internet.'),
      h('ul', { class: 'hist' }, cola.map((o) => h('li', {},
        h('span', { class: 'hdot wait' }),
        h('div', { class: 'main' }, o.summary || 'Cambio', h('span', { class: 'sub' }, `${o.file.replace('data/', '').replace('.json', '').replace(/_/g, ' ')} · ${HORA.format(new Date(o.at))}`)))))));
  }
  if (!log.length) {
    out.push(h('section', { class: 'card' }, h('div', { class: 'empty' }, 'Todavía no hay movimientos en este dispositivo.')));
    return out;
  }
  const grupos = new Map();
  for (const e of log) {
    const k = DIA.format(new Date(e.at));
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
  }
  for (const [dia, items] of grupos) {
    out.push(h('section', { class: 'card' },
      h('h3', { class: 'hist-day' }, dia.charAt(0).toUpperCase() + dia.slice(1)),
      h('ul', { class: 'hist' }, items.map((e) => h('li', {},
        h('span', { class: 'hdot ' + (e.ok ? 'ok' : 'bad'), title: e.ok ? 'Funcionó' : 'Falló' }),
        h('div', { class: 'main' },
          h('span', { class: 'ttl' }, e.titulo, e.veces > 1 ? h('span', { class: 'veces' }, ` ×${e.veces}`) : null),
          e.detalle ? h('span', { class: 'sub' }, e.detalle) : null),
        h('span', { class: 'time' }, HORA.format(new Date(e.at))))))));
  }
  out.push(h('div', { class: 'hist-legend' },
    h('span', {}, h('span', { class: 'hdot ok' }), 'Funcionó'),
    h('span', {}, h('span', { class: 'hdot bad' }), 'Falló (reintenta solo)'),
    h('span', {}, h('span', { class: 'hdot wait' }), 'Esperando internet')));
  return out;
}

// Medidas de pantalla para diagnóstico (Ajustes). En iOS 26 la app instalada puede quedar más corta
// que la pantalla (WebKit 301108); eso se corrige en el CSS, aquí solo se mide.
function fixBottom() {
  const probe = $('#vp-probe');
  if (!probe) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const landscape = innerWidth > innerHeight;
  const sh = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
  const sw = landscape ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const bottom = probe.getBoundingClientRect().bottom;
  let gap = 0;
  if (standalone && Math.abs(innerWidth - sw) < 2) {
    gap = Math.round(sh - bottom);
  }
  fixBottom.info = { sh, bottom: Math.round(bottom), ih: innerHeight, gap, standalone: !!standalone };
}

function diagText() {
  const i = fixBottom.info || {};
  return `Pantalla ${i.sh} · visible ${i.bottom} · faltan ${i.gap}px${i.standalone ? ' · instalada' : ''}`;
}

// Jalar hacia abajo para actualizar.
function setupPullToRefresh() {
  const ind = $('#ptr');
  const main = $('#main');
  const MAX = 110, TRIGGER = 64, HOLD = 56;
  let startY = null, startX = 0, dy = 0, active = false;
  // La pantalla entera baja con el dedo y el ícono aparece en el espacio que queda arriba.
  const set = (d, anim) => {
    const tr = anim ? 'transform .3s cubic-bezier(.2,.8,.2,1), opacity .3s' : 'none';
    const top = $('.topbar').getBoundingClientRect().bottom;
    ind.style.top = `${top}px`;
    ind.style.transition = tr;
    main.style.transition = tr;
    const m = Math.min(d, MAX);
    main.style.transform = m > 0 ? `translateY(${m}px)` : '';
    ind.style.transform = `translate(-50%, ${m / 2 - 20}px) rotate(${d * 3}deg)`;
    ind.style.opacity = String(Math.min(d / TRIGGER, 1));
    ind.classList.toggle('ready', d >= TRIGGER);
  };
  addEventListener('touchstart', (e) => {
    // Desde la fila de botones (o cualquier cosa que se desliza de lado) no se jala para actualizar.
    const fromSide = e.target instanceof Element && e.target.closest('.chips, .no-ptr');
    if (!sync.config || fromSide || window.scrollY > 0 || e.touches.length !== 1 || ind.classList.contains('spin')) { startY = null; return; }
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; dy = 0; active = false;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const d = e.touches[0].clientY - startY;
    const dx = Math.abs(e.touches[0].clientX - startX);
    if (!active && (d <= 0 || dx > d)) { startY = null; return; } // gesto de lado: no es para actualizar
    if (window.scrollY > 0) { startY = null; return; }
    active = true;
    dy = Math.max(0, d * 0.55);
    if (e.cancelable) e.preventDefault();
    set(dy, false);
  }, { passive: false });
  addEventListener('touchend', async () => {
    if (startY == null || !active) { startY = null; return; }
    startY = null;
    if (dy >= TRIGGER) {
      set(HOLD, true);
      ind.classList.add('spin');
      const t0 = Date.now();
      await sync.sync();
      await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - t0))));
      ind.classList.remove('spin');
    }
    set(0, true);
  });
}

// ---------- Arranque ----------
async function start() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const offer = (w) => toast('Hay una versión nueva de la app.', { label: 'Actualizar', fn: () => w.postMessage('skipWaiting') });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      // Solo se recarga cuando una versión nueva reemplaza a otra, no en la primera instalación.
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
    } catch (e) { /* sin service worker: la app funciona igual con internet */ }
  }
  const ok = await sync.init();
  const h0 = location.hash.slice(1);
  page = ok ? (TITLES[h0] && h0 !== 'setup' ? h0 : 'resumen') : 'setup';
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.page === page));
  render();
  renderStatus(sync.status);
  if (ok) sync.sync();
  fixBottom();
  addEventListener('resize', fixBottom);
  addEventListener('orientationchange', () => setTimeout(fixBottom, 300));
  setTimeout(fixBottom, 500);
  setupPullToRefresh();
  window.addEventListener('online', () => sync.sync());
  window.addEventListener('focus', () => sync.sync());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.sync(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync.sync(); }, 30000);
  setInterval(() => renderStatus(sync.status), 30000);
}
window.__app = { sync };
start();
