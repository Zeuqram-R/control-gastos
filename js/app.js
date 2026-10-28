import { createSync } from './sync.js';
import { GitHubError } from './github.js';

import { $, h, ago, privacy, preloadPhotos } from './ui.js';
import { prefs } from './prefs.js';
import { lock, iniciarCandado } from './lock.js';
import { push } from './push.js';
let lockDisponible = false;
import { viewResumen, viewCategoria } from './views/resumen.js';
import { viewLista } from './views/lista.js';
import { viewProductos, viewProducto } from './views/productos.js';
import { viewRecurrentes, viewDeudas } from './views/pagos.js';
import { viewFacturas } from './views/facturas.js';

const APP_VERSION = '5.5';

// ---------- Estado ----------
const warmPhotos = () => { if (sync.config && sync.hasData()) setTimeout(() => preloadPhotos(sync, sync.photoPaths('fotos/mini/')), 300); };
const sync = createSync({ onChange: () => { render(); warmPhotos(); }, onStatus: (s) => renderStatus(s), onLog: () => { if (page === 'historial') render(); } });
let page = 'resumen';
const TITLES = { resumen: 'Resumen', lista: 'Lista', productos: 'Productos', recurrentes: 'Recurrentes', deudas: 'Deudas', ajustes: 'Ajustes', historial: 'Historial', producto: 'Producto', categoria: 'Gastos', facturas: 'Facturas', setup: 'Control de gastos' };

// Aviso abajo: aparece y se desvanece suave.
function toast(msg, action, ms) {
  const t = $('#toast');
  const hide = () => { t.classList.add('out'); clearTimeout(toast.fade); toast.fade = setTimeout(() => { t.hidden = true; }, 450); };
  t.replaceChildren(msg);
  if (action) t.append(h('button', { type: 'button', onclick: () => { hide(); action.fn(); } }, action.label));
  clearTimeout(toast.timer); clearTimeout(toast.fade);
  t.classList.remove('out');
  t.hidden = false;
  toast.timer = setTimeout(hide, ms || (action ? 12000 : 3500));
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
  if (page === 'historial') render();
  else if (page === 'ajustes') $('#aj-sync')?.replaceWith(syncCard());
}

// ---------- Navegación ----------
const SUB = new Set(['historial', 'ajustes', 'producto', 'categoria', 'facturas']);
let catActual = null;
function openCategoria(cat) { catActual = cat; go('categoria'); }
let productoActual = null;
function openProduct(clave) { productoActual = clave; go('producto'); }
let back = 'resumen';
// Al regresar de una página de detalle (o de Ajustes/Historial) se vuelve a donde estabas en la página.
const scrolls = {};
function go(p) {
  const volviendo = SUB.has(page) && !SUB.has(p) && p === back;
  if (!SUB.has(page)) scrolls[page] = window.scrollY;
  if (SUB.has(p) && !SUB.has(page) && page !== 'setup') back = page;
  page = p;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.page === p));
  if (p !== 'setup') history.replaceState(null, '', '#' + p + (p === 'producto' && productoActual ? `/${productoActual}` : p === 'categoria' && catActual ? `/${encodeURIComponent(catActual)}` : ''));
  render();
  window.scrollTo({ top: volviendo ? (scrolls[p] || 0) : 0 });
}
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => go(t.dataset.page));
// Ajustes e Historial se abren encima de la página donde estabas; la flecha o el mismo botón te regresan.
$('#btn-ajustes').addEventListener('click', () => go(page === 'ajustes' ? back : 'ajustes'));
$('#sync-pill').addEventListener('click', () => go(page === 'historial' ? back : 'historial'));
$('#btn-back').addEventListener('click', () => go(back));

// ---------- Páginas ----------
function render() {
  const main = $('#main');
  applyPrefs();
  const connected = !!sync.config;
  $('#bottom-nav').hidden = !connected;
  $('#btn-ajustes').hidden = !connected;
  if (!connected) page = 'setup';
  $('#page-title').textContent = page === 'categoria' && catActual ? (catActual === 'General' ? 'Quincena' : catActual) : (TITLES[page] || 'Control de gastos');
  $('#btn-back').hidden = !SUB.has(page) || !connected;
  $('#btn-back').setAttribute('aria-label', `Regresar a ${TITLES[back] || 'Resumen'}`);
  const view = { setup: viewSetup, resumen: needData(viewResumen), lista: needData(viewLista), productos: needData(viewProductos), producto: needData(viewProducto), categoria: needData(viewCategoria), facturas: needData(viewFacturas), recurrentes: needData(viewRecurrentes), deudas: needData(viewDeudas), ajustes: viewAjustes, historial: viewHistorial }[page] || viewProximamente;
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
    const out = [].concat(fn({ sync, toast, go, rerender: render, openProduct, clave: productoActual, openCategoria, cat: catActual }));
    const b = page === 'resumen' ? tokenBanner() : null;
    return b ? [b, ...out] : out;
  };
}

function viewProximamente() {
  const fase = { recurrentes: 4, deudas: 4 }[page];
  const icon = document.querySelector(`.tab[data-page="${page}"] svg`)?.cloneNode(true);
  return h('div', { class: 'card coming' }, icon, h('h2', {}, TITLES[page]), h('p', { class: 'note' }, `Llega en la fase ${fase}. Los datos ya están guardados en el dispositivo.`));
}

// Tema por dispositivo: auto, claro u oscuro.
const THEME_BG = { light: '#f4f5f3', dark: '#0f1412' };
function getTheme() { try { return localStorage.getItem('tema') || 'auto'; } catch (e) { return 'auto'; } }
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = (m.getAttribute('media') || '').includes('dark') ? 'dark' : 'light';
    m.setAttribute('content', THEME_BG[t === 'auto' ? scheme : t]);
  }
}
function setTheme(t) { try { if (t === 'auto') localStorage.removeItem('tema'); else localStorage.setItem('tema', t); } catch (e) { /* solo esta vez */ } applyTheme(t); render(); }

const ICON = {
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
};

// Preferencias de este aparato.
const FONT = { normal: 1, grande: 1.12, mayor: 1.25 };
function applyPrefs() {
  const z = FONT[prefs.get('letra', 'normal')] || 1;
  $('#main').style.zoom = z === 1 ? '' : String(z);
  privacy.hide = !!prefs.get('ocultar', false);
  const eye = $('#btn-eye');
  eye.hidden = !sync.config;
  eye.setAttribute('aria-pressed', String(privacy.hide));
  eye.setAttribute('aria-label', privacy.hide ? 'Mostrar montos' : 'Ocultar montos');
  eye.innerHTML = privacy.hide ? EYE.closed : EYE.open;
}
const EYE = {
  closed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5.5 0 9 5.5 9.5 7-.3.8-1.2 2.5-2.8 4M6.6 6.6C4.4 8 3 10.2 2.5 12c.5 1.5 4 7 9.5 7 1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></svg>',
};
// El ojo de arriba oculta o muestra los montos en todas las páginas (se recuerda en este aparato).
$('#btn-eye').addEventListener('click', () => {
  prefs.set('ocultar', !prefs.get('ocultar', false));
  applyPrefs(); render();
  toast(privacy.hide ? 'Montos ocultos' : 'Montos visibles', null, 3000);
});

const MS_DIA = 864e5;
// La fecha de vencimiento del token se guarda una vez en el repo (data/config.json) y la leen todos los aparatos.
const tokenFecha = () => (sync.hasData() ? sync.data('config').find((r) => r.id === 'token')?.vence : null) || sync.config?.tokenVence || '';
function tokenVence() {
  const auto = sync.tokenExpiration();
  const v = auto ? new Date(auto.replace(' UTC', 'Z').replace(' ', 'T')) : (tokenFecha() ? new Date(`${tokenFecha()}T12:00:00`) : null);
  if (!v || Number.isNaN(+v)) return null;
  return { fecha: v, dias: Math.ceil((v - Date.now()) / MS_DIA), auto: !!auto };
}
function tokenBanner() {
  const t = tokenVence();
  if (!t || t.dias > 30) return null;
  return h('section', { class: 'card banner' + (t.dias <= 7 ? ' bad' : '') },
    h('div', { class: 'main' },
      h('b', {}, t.dias <= 0 ? 'El token de GitHub venció' : `El token de GitHub vence en ${t.dias} día${t.dias === 1 ? '' : 's'}`),
      h('span', { class: 'sub' }, 'Creá uno nuevo y pegalo en Ajustes para que la app siga sincronizando.')),
    h('button', { class: 'btn sm', type: 'button', onclick: () => go('ajustes') }, 'Ver'));
}

const fmtBytes = (b) => (b == null ? '—' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
let storageCache = null;

function syncCard() {
  const s = sync.status;
  return h('section', { class: 'card', id: 'aj-sync' },
    h('h2', {}, 'Sincronización'),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Última sincronización'), h('dd', {}, s.lastSync ? new Date(s.lastSync).toLocaleString('es-CR') : 'nunca'),
      h('dt', {}, 'Cambios por subir'), h('dd', {}, String(s.pending)),
      h('dt', {}, 'Estado'), h('dd', {}, { idle: 'Al día', checking: 'Revisando', uploading: 'Subiendo', downloading: 'Bajando', offline: 'Sin conexión', error: 'Error' }[s.state] || s.state)),
    s.message && s.message !== 'reintento' ? h('p', { class: 'error-msg' }, s.message) : null,
    h('button', { class: 'btn block', type: 'button', onclick: () => sync.sync() }, 'Sincronizar ahora'));
}
const MESES_UI = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function viewAjustes() {
  const s = sync.status;
  const c = sync.config;
  const tema = getTheme();
  const seg = (items, current, onPick, cls = '') => h('div', { class: `seg ${cls}` }, items.map(([k, label, icon]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(current === k), onclick: () => onPick(k) });
    if (icon) b.innerHTML = icon;
    b.append(label);
    return b;
  }));
  const sw = (id, label, sub, checked, onChange) => h('label', { class: 'switch-row', for: id },
    h('span', { class: 'main' }, label, sub ? h('span', { class: 'sub' }, sub) : null),
    h('input', { type: 'checkbox', role: 'switch', id, class: 'switch', checked: checked || null, onchange: (e) => onChange(e.target.checked) }));

  const devIn = h('input', { class: 'input', id: 'aj-dev', type: 'text', value: c.dispositivo, autocomplete: 'off',
    onchange: async (e) => { const v = e.target.value.trim(); if (v && v !== c.dispositivo) { await sync.updateConfig({ dispositivo: v }); toast('Nombre del aparato guardado.'); } } });
  devIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  const t = tokenVence();
  // Fecha con tres listas (día, mes, año): el calendario del sistema se portaba raro en la Mac.
  const [vy, vm, vd] = tokenFecha().split('-');
  const mk = (id, label, opts, cur) => h('select', { class: 'input', id, 'aria-label': label },
    h('option', { value: '' }, label), opts.map(([v, t]) => h('option', { value: v, selected: v === cur || null }, t)));
  const pad = (n) => String(n).padStart(2, '0');
  const selD = mk('aj-vd', 'Día', Array.from({ length: 31 }, (_, i) => [pad(i + 1), String(i + 1)]), vd);
  const selM = mk('aj-vm', 'Mes', MESES_UI.map((m, i) => [pad(i + 1), m]), vm);
  const year = new Date().getFullYear();
  const selY = mk('aj-vy', 'Año', Array.from({ length: 5 }, (_, i) => [String(year + i), String(year + i)]), vy);
  const saveVence = async () => {
    if (!selD.value || !selM.value || !selY.value) return;
    const v = `${selY.value}-${selM.value}-${selD.value}`;
    if (v !== tokenFecha()) { await sync.mutate('config', { kind: 'patch', record: { id: 'token', vence: v, por: c.persona } }, `vencimiento del token: ${v}`); toast('Fecha guardada para todos los aparatos.'); render(); }
  };
  for (const sel of [selD, selM, selY]) sel.addEventListener('change', saveVence);
  const venceIn = h('div', { class: 'date3' }, selD, selM, selY);

  if (!storageCache) sync.storageInfo().then((info) => { storageCache = info; if (page === 'ajustes') render(); });
  const st = storageCache;

  return [
    h('section', { class: 'card' },
      h('h2', {}, 'Apariencia'),
      h('p', { class: 'note' }, 'Se guarda solo en este aparato. Auto sigue el modo claro u oscuro del sistema.'),
      seg([['auto', 'Auto', ICON.auto], ['light', 'Claro', ICON.light], ['dark', 'Oscuro', ICON.dark]], tema, setTheme, 'three'),
      h('div', { class: 'field', style: { marginTop: '16px', marginBottom: '0' } },
        h('label', {}, 'Tamaño de letra'),
        seg([['normal', 'Normal'], ['grande', 'Grande'], ['mayor', 'Más grande']], prefs.get('letra', 'normal'), (k) => { prefs.set('letra', k); applyPrefs(); render(); }, 'three'))),

    h('section', { class: 'card' },
      h('h2', {}, 'Seguridad'),
      lockDisponible ? [
        sw('aj-lock', 'Bloquear con Face ID', 'Pide Face ID (o el código del aparato) al abrir la app. Se activa solo en este aparato.', lock.activo, async (v) => {
          if (v) {
            try { await lock.activar(c.persona, c.dispositivo); toast('Listo: la app pide Face ID al abrir.'); }
            catch (e) { toast(e.name === 'NotAllowedError' ? 'Se canceló. No se activó el bloqueo.' : `No se pudo activar (${e.name}).`); }
          } else { lock.desactivar(); toast('Bloqueo quitado en este aparato.'); }
          render();
        }),
        lock.activo ? h('div', { class: 'field', style: { marginTop: '14px', marginBottom: '0' } }, h('label', {}, 'Volver a pedir Face ID después de'),
          seg([['0', 'Al salir'], ['1', '1 min'], ['5', '5 min'], ['30', '30 min']], String(lock.config.espera ?? 1), (k) => { lock.setEspera(Number(k)); render(); })) : null,
      ] : h('p', { class: 'note', style: { margin: 0 } }, 'Este aparato no permite Face ID / Touch ID para apps web (o no está configurado).')),

    h('section', { class: 'card' },
      h('h2', {}, 'Avisos de pagos'),
      !push.soportado() || !push.instalada()
        ? h('p', { class: 'note', style: { margin: 0 } }, push.instalada() ? 'Este aparato no permite avisos para apps web (en iPhone/iPad hace falta iOS 16.4 o más nuevo).' : 'Para recibir avisos, abrí la app desde el ícono de la pantalla de inicio (no desde Safari).')
        : [
          sw('aj-push', 'Avisarme de los pagos', 'Todos los días a las 7:35 a. m.: lo que vence hoy, mañana y en 3 días, deudas con fecha, y si a Bank of America no le alcanza. Te llegan los tuyos y los de ambos.', push.activo, async (v) => {
            try {
              if (v) { await push.activar(sync); toast('Avisos activados. En unos minutos te llega uno de prueba.'); }
              else { await push.desactivar(sync); toast('Avisos desactivados en este aparato.'); }
            } catch (e) {
              toast(e.message === 'denegado' ? 'iOS tiene los avisos bloqueados para esta app: activalos en Ajustes del iPhone → Notificaciones → Gastos.' : `No se pudieron activar (${e.message}).`);
            }
            render();
          }),
        ]),

    h('section', { class: 'card' },
      h('h2', {}, 'Este dispositivo'),
      h('div', { class: 'field' }, h('label', {}, '¿Quién lo usa?'),
        seg([['Jose', 'Jose'], ['Ali', 'Ali']], c.persona, async (k) => { await sync.updateConfig({ persona: k }); toast(`Ahora este aparato es de ${k}.`); render(); })),
      h('div', { class: 'field' }, h('label', { for: 'aj-dev' }, 'Nombre del aparato'), devIn, h('span', { class: 'hint' }, 'Sale en el historial de cambios.')),
      h('div', { class: 'field', style: { marginBottom: '0' } }, h('label', { for: 'aj-inicio' }, 'Abrir la app en'),
        h('select', { class: 'input', id: 'aj-inicio', onchange: (e) => { prefs.set('inicio', e.target.value); toast('Listo: la próxima vez abre ahí.'); } },
          ['resumen', 'lista', 'productos', 'recurrentes', 'deudas'].map((k) => h('option', { value: k, selected: prefs.get('inicio', 'resumen') === k || null }, TITLES[k]))))),

    h('section', { class: 'card' },
      h('h2', {}, 'Token de GitHub'),
      t ? h('p', { class: 'token-line' + (t.dias <= 30 ? ' warn' : '') },
        t.dias <= 0 ? 'Venció' : `Vence el ${t.fecha.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        h('span', { class: 'sub' }, t.dias > 0 ? `Faltan ${t.dias} días${t.auto ? ' · dato de GitHub' : ''}` : 'Creá uno nuevo y volvé a conectar.'))
        : h('p', { class: 'note' }, 'Poné la fecha en que vence tu token para que la app te avise un mes antes.'),
      t && t.auto ? null : h('details', { class: 'pp', open: t ? null : true }, h('summary', {}, t ? 'Cambiar la fecha' : 'Poner la fecha'),
        h('p', { class: 'note', style: { margin: '8px 0' } }, 'Vale para todos los aparatos; cuando renovés el token, cambiala aquí en uno solo.'), venceIn),
      h('p', { class: 'note', style: { marginTop: '12px', marginBottom: '0' } }, 'Para cambiarlo: Desconectar (abajo), pegar el token nuevo y Conectar.')),

    syncCard(),

    h('section', { class: 'card' },
      h('h2', {}, 'Almacenamiento'),
      h('dl', { class: 'kv' },
        h('dt', {}, 'Archivos de datos'), h('dd', {}, st ? String(st.archivos) : '…'),
        h('dt', {}, 'Fotos guardadas'), h('dd', {}, st ? `${st.fotos} (${fmtBytes(st.fotosBytes)})` : '…'),
        h('dt', {}, 'Espacio usado por la app'), h('dd', {}, st ? fmtBytes(st.usado) : '…')),
      h('div', { class: 'btn-col' },
        h('button', { class: 'btn secondary block', type: 'button', onclick: async () => {
          if (!confirm('¿Volver a bajar todos los datos y fotos? Los cambios por subir no se pierden.')) return;
          storageCache = null; toast('Bajando todo de nuevo…'); await sync.redownload(); storageCache = null; render();
        } }, 'Volver a bajar todo'),
        h('button', { class: 'btn secondary block', type: 'button', onclick: async () => {
          if (!confirm('¿Borrar el historial de sincronización de este aparato?')) return;
          await sync.clearLog(); toast('Historial borrado.');
        } }, 'Borrar historial de sincronización'))),

    h('section', { class: 'card' },
      h('h2', {}, 'Desconectar'),
      h('p', { class: 'note' }, 'Borra el token y los datos guardados en este dispositivo. Lo que está en GitHub no se toca.' + (s.pending ? ` Ojo: hay ${s.pending} cambio(s) sin subir que se perderían.` : '')),
      h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
        if (!confirm('¿Desconectar este dispositivo? Vas a tener que pegar el token otra vez.')) return;
        await sync.disconnect();
        go('setup');
      } }, 'Desconectar este dispositivo')),
    h('p', { class: 'note', style: { textAlign: 'center' } }, `Versión ${APP_VERSION}`),
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
    const fromSide = e.target instanceof Element && e.target.closest('.chips, .no-ptr, .viewer');
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
// Sin zoom en la app (solo en el visor de fotos, que tiene su propio zoom).
function blockZoom() {
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !(e.target instanceof Element && e.target.closest('.viewer-stage'))) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', (e) => { if (!(e.target instanceof Element && e.target.closest('.viewer-stage'))) e.preventDefault(); }, { passive: false });
}

async function start() {
  blockZoom();
  lock.disponible().then((v) => { lockDisponible = v; if (page === 'ajustes') render(); });
  applyTheme(getTheme());
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
  if (ok) iniciarCandado(async () => { await sync.disconnect(); go('setup'); });
  let h0 = location.hash.slice(1);
  if (h0.startsWith('producto/')) { productoActual = decodeURIComponent(h0.slice(9)); h0 = 'producto'; back = 'productos'; }
  if (h0.startsWith('categoria/')) { catActual = decodeURIComponent(h0.slice(10)); h0 = 'categoria'; back = 'resumen'; }
  const inicio = prefs.get('inicio', 'resumen');
  page = ok ? (TITLES[h0] && !['setup', 'ajustes', 'historial', 'facturas'].includes(h0) && (h0 !== 'producto' || productoActual) && (h0 !== 'categoria' || catActual) ? h0 : (TITLES[inicio] ? inicio : 'resumen')) : 'setup';
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.page === page));
  render();
  renderStatus(sync.status);
  if (ok) { warmPhotos(); sync.sync(); }
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
