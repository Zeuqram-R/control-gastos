import { createSync } from './sync.js';
import { GitHubError } from './github.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};

const crc = (v) => '₡' + Math.round(Number(v) || 0).toLocaleString('en-US');
const todayCR = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const ago = (iso) => {
  if (!iso) return 'nunca';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 45) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------- Estado ----------
const sync = createSync({ onChange: () => render(), onStatus: (s) => renderStatus(s) });
let page = 'resumen';
const TITLES = { resumen: 'Resumen', lista: 'Lista', productos: 'Productos', recurrentes: 'Recurrentes', deudas: 'Deudas', ajustes: 'Ajustes', setup: 'Control de gastos' };

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
  if (s.state === 'syncing') text = 'Sincronizando…';
  else if (s.state === 'offline') text = s.pending ? `Sin conexión · ${s.pending} por subir` : 'Sin conexión';
  else if (s.state === 'error') text = 'Error al sincronizar';
  else if (s.pending) { state = 'pending'; text = `${s.pending} por subir`; }
  else text = `Al día · ${ago(s.lastSync)}`;
  pill.dataset.state = state;
  $('#sync-text').textContent = text;
  pill.title = s.message || '';
  if (page === 'ajustes') render();
}

// ---------- Navegación ----------
function go(p) {
  page = p;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.page === p));
  if (p !== 'ajustes' && p !== 'setup') history.replaceState(null, '', '#' + p);
  window.scrollTo({ top: 0 });
  render();
}
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => go(t.dataset.page));
$('#btn-ajustes').addEventListener('click', () => go(page === 'ajustes' ? 'resumen' : 'ajustes'));
$('#sync-pill').addEventListener('click', () => {
  const s = sync.status;
  if (s.state === 'error' && s.message) toast(s.message);
  sync.sync();
});

// ---------- Páginas ----------
function render() {
  const main = $('#main');
  const connected = !!sync.config;
  $('#bottom-nav').hidden = !connected;
  $('#btn-ajustes').hidden = !connected;
  if (!connected) page = 'setup';
  $('#page-title').textContent = TITLES[page] || 'Control de gastos';
  const view = { setup: viewSetup, resumen: viewResumen, ajustes: viewAjustes }[page] || viewProximamente;
  // Conserva lo que se está escribiendo si la página se vuelve a dibujar.
  const active = document.activeElement;
  const keep = active && active.id && main.contains(active) ? { id: active.id, value: active.value, pos: active.selectionStart } : null;
  main.replaceChildren(...[].concat(view()));
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

function viewResumen() {
  if (!sync.hasData()) {
    return h('div', { class: 'card' }, h('h2', {}, 'Bajando los datos…'), h('p', { class: 'note' }, sync.status.state === 'offline' ? 'Sin conexión. Cuando vuelva el internet se bajan solos.' : 'Esto pasa solo la primera vez.'));
  }
  const gastos = sync.data('gastos');
  const compras = sync.data('compras');
  const productos = sync.data('productos');
  const deudas = sync.data('deudas');
  const pagadas = new Set(sync.data('pagos_deudas').map((p) => p.id));
  const mes = gastos.map((g) => String(g.fecha).slice(0, 7)).sort().pop() || todayCR().slice(0, 7);
  const delMes = gastos.filter((g) => String(g.fecha).slice(0, 7) === mes);
  const pendientes = deudas.filter((d) => !pagadas.has(d.id));
  const mesLabel = `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

  return [
    h('section', { class: 'tiles' },
      tile(`Gastos de ${mesLabel}`, crc(delMes.reduce((s, g) => s + Number(g.monto), 0)), `${delMes.length} gasto(s)`),
      tile('Compras registradas', String(compras.length), 'artículos de facturas'),
      tile('Productos', String(productos.length), 'en el catálogo'),
      tile('Deudas pendientes', String(pendientes.length), `${deudas.length - pendientes.length} pagada(s)`)),
    viewNotas(),
    h('div', { class: 'card' },
      h('h2', {}, 'Fase 1: la base'),
      h('p', { class: 'note' }, 'Lo demás del control llega en las próximas fases. Por ahora, esto sirve para probar que la app abre sin internet y que lo que hacés en un dispositivo aparece en los otros.')),
  ];
}

function tile(lbl, num, sub) {
  return h('div', { class: 'card tile' }, h('div', { class: 'lbl' }, lbl), h('div', { class: 'num' }, num), h('div', { class: 'sub' }, sub));
}

function viewNotas() {
  const notas = sync.data('notas').slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const pend = new Set(sync.pendingFor('notas').map((o) => o.kind === 'delete' ? o.id : o.record.id));
  const input = h('input', { class: 'input', id: 'in-nota', type: 'text', placeholder: 'Escribí algo y agregalo', maxlength: '140' });
  const add = async () => {
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    const id = `N${Date.now().toString(36)}`;
    await sync.mutate('notas', { kind: 'upsert', record: { id, texto, autor: sync.config.persona, dispositivo: sync.config.dispositivo, fecha: new Date().toISOString() } }, `nota "${texto.slice(0, 40)}"`);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  return h('section', { class: 'card' },
    h('h2', {}, 'Prueba de sincronización'),
    h('p', { class: 'note' }, 'Agregá una nota aquí y abrí la app en otro dispositivo: debería aparecer. Probá también en modo avión: queda "por subir" y se sube sola al volver el internet.'),
    h('div', { class: 'row-add' }, input, h('button', { class: 'btn', type: 'button', onclick: add }, 'Agregar')),
    notas.length ? notas.map((n) => h('div', { class: 'list-item' + (pend.has(n.id) ? ' pending' : '') },
      h('div', { class: 'main' }, n.texto, h('span', { class: 'sub' }, `${n.autor} · ${n.dispositivo} · ${new Date(n.fecha).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`)),
      h('button', { class: 'x-btn', type: 'button', 'aria-label': 'Borrar nota', onclick: () => sync.mutate('notas', { kind: 'delete', id: n.id }, 'borra una nota') }, '✕')))
      : h('div', { class: 'empty' }, 'Todavía no hay notas.'));
}

function viewProximamente() {
  const fase = { lista: 2, productos: 3, recurrentes: 4, deudas: 4 }[page];
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
        h('dt', {}, 'Estado'), h('dd', {}, { idle: 'Al día', syncing: 'Sincronizando', offline: 'Sin conexión', error: 'Error' }[s.state] || s.state)),
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
    h('p', { class: 'note', style: 'text-align:center' }, 'Versión fase 1'),
  ];
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
  window.addEventListener('online', () => sync.sync());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.sync(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync.sync(); }, 60000);
  setInterval(() => renderStatus(sync.status), 30000);
}
start();
