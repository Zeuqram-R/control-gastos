// Ayudas de interfaz compartidas por todas las páginas.
export const $ = (sel, root = document) => root.querySelector(sel);

export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};

export const crc = (v) => '₡' + Math.round(Number(v) || 0).toLocaleString('en-US');
export const usd = (v) => '$' + (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
export const todayCR = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
export const ago = (iso) => {
  if (!iso) return 'nunca';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 45) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const dayShort = (s) => (s ? DAY.format(new Date(String(s).slice(0, 10))).replace('.', '') : '—');
export const daysBetween = (a, b) => Math.round((new Date(String(b).slice(0, 10)) - new Date(String(a).slice(0, 10))) / 864e5);
export const addDays = (d, n) => { const v = new Date(String(d).slice(0, 10)); v.setUTCDate(v.getUTCDate() + n); return v.toISOString().slice(0, 10); };

export function tile(lbl, num, sub, opts = {}) {
  return h('div', { class: 'card tile' + (opts.cls ? ` ${opts.cls}` : '') },
    h('div', { class: 'lbl' }, lbl),
    h('div', { class: 'num', style: opts.color ? { color: opts.color } : null }, num),
    sub ? h('div', { class: 'sub' }, sub) : null);
}

export function stat(lbl, num, sub, color) {
  return h('div', { class: 'stat' },
    h('div', { class: 'lbl' }, lbl),
    h('div', { class: 'num', style: color ? { color } : null }, num),
    sub ? h('div', { class: 'sub' }, sub) : null);
}

// Barras horizontales simples (etiqueta, barra, monto).
export function bars(rows, { label = 'label', value = 'total', color = 'var(--accent)', fmt = crc } = {}) {
  const max = Math.max(...rows.map((r) => r[value]), 1);
  return h('div', { class: 'bars' }, rows.map((r) => h('div', { class: 'bar-row' },
    h('div', { class: 'bar-lbl' }, r[label]),
    h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${(r[value] / max) * 100}%`, background: color } })),
    h('div', { class: 'bar-val' }, fmt(r[value])))));
}

// Foto de un producto: cuadrito vacío mientras carga (o si no hay foto), luego la imagen guardada.
const photoUrls = new Map();
export function thumb(sync, clave, opts = {}) {
  const cls = opts.cls || 'thumb';
  const path = `fotos/mini/${clave}.webp`;
  const box = h('span', { class: `${cls} empty` });
  if (!clave || !sync.photoExists(path)) return box;
  if (opts.open) {
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', `Ver foto de ${opts.title || 'producto'}`);
    box.addEventListener('click', (e) => { e.stopPropagation(); openPhoto(sync, clave, opts.title); });
  }
  const put = (url) => { box.className = cls + (opts.open ? ' can-open' : ''); box.replaceChildren(h('img', { src: url, alt: '', loading: 'lazy' })); };
  if (photoUrls.has(path)) { put(photoUrls.get(path)); return box; }
  sync.photo(path).then((blob) => {
    if (!blob) return;
    if (!photoUrls.has(path)) photoUrls.set(path, URL.createObjectURL(blob));
    put(photoUrls.get(path));
  });
  return box;
}

export const empty = (text) => h('div', { class: 'empty' }, text);

// Visor de foto a pantalla completa: pellizcar para acercar, doble toque para acercar/alejar, arrastrar para mover.
export function openPhoto(sync, clave, title) {
  const big = `fotos/grande/${clave}.webp`, mini = `fotos/mini/${clave}.webp`;
  const img = h('img', { alt: title || '', draggable: 'false' });
  const stage = h('div', { class: 'viewer-stage' }, img);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const ov = h('div', { class: 'viewer', role: 'dialog', 'aria-label': title || 'Foto' },
    h('div', { class: 'viewer-top' },
      h('span', { class: 'viewer-title' }, title || ''),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, '✕')),
    stage,
    h('div', { class: 'viewer-hint' }, 'Pellizcá o tocá dos veces para acercar'));
  document.body.append(ov);
  document.addEventListener('keydown', onKey);
  (async () => {
    const src = sync.photoExists(big) ? big : mini;
    const blob = await sync.photo(src);
    if (blob) img.src = URL.createObjectURL(blob);
  })();

  let scale = 1, x = 0, y = 0, start = null, lastTap = 0, moved = false, lastTouch = 0;
  const apply = (anim) => { img.style.transition = anim ? 'transform .2s' : 'none'; img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  stage.addEventListener('touchstart', (e) => {
    moved = false;
    if (e.touches.length === 2) start = { d: dist(e.touches), s: scale };
    else if (e.touches.length === 1) start = { px: e.touches[0].clientX - x, py: e.touches[0].clientY - y, s: scale };
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    e.preventDefault();
    moved = true;
    if (e.touches.length === 2 && start && start.d) { scale = Math.min(5, Math.max(1, start.s * dist(e.touches) / start.d)); if (scale === 1) { x = 0; y = 0; } }
    else if (e.touches.length === 1 && start && start.px != null && scale > 1) { x = e.touches[0].clientX - start.px; y = e.touches[0].clientY - start.py; }
    apply(false);
  }, { passive: false });
  stage.addEventListener('touchend', (e) => {
    lastTouch = Date.now();
    if (e.touches.length) return;
    const now = Date.now();
    if (!moved && now - lastTap < 300) { scale = scale > 1 ? 1 : 2.5; x = 0; y = 0; apply(true); lastTap = 0; }
    else lastTap = now;
    if (scale <= 1) { x = 0; y = 0; apply(true); }
  });
  stage.addEventListener('dblclick', () => {
    if (Date.now() - lastTouch < 800) return; scale = scale > 1 ? 1 : 2.5; x = 0; y = 0; apply(true); });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.min(5, Math.max(1, scale * (e.deltaY < 0 ? 1.1 : 0.9))); if (scale === 1) { x = 0; y = 0; } apply(false); }, { passive: false });
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target === stage) { if (scale === 1) close(); } });
}
