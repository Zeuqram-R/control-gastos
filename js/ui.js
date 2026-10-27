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
export function thumb(sync, clave, cls = 'thumb') {
  const path = `fotos/mini/${clave}.webp`;
  const box = h('span', { class: `${cls} empty` });
  if (!clave || !sync.photoExists(path)) return box;
  const put = (url) => { box.className = cls; box.replaceChildren(h('img', { src: url, alt: '', loading: 'lazy' })); };
  if (photoUrls.has(path)) { put(photoUrls.get(path)); return box; }
  sync.photo(path).then((blob) => {
    if (!blob) return;
    if (!photoUrls.has(path)) photoUrls.set(path, URL.createObjectURL(blob));
    put(photoUrls.get(path));
  });
  return box;
}

export const empty = (text) => h('div', { class: 'empty' }, text);
