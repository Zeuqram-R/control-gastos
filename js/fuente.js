// "¿De dónde sale?": tocar un total abre una hoja con las cuentas que lo forman.
import { h, crc, privacy } from './ui.js';

// Hace que un número (stat o tile) se pueda tocar para ver su detalle.
// build() devuelve { titulo, nota?, grupos: [{ titulo, signo?: '+'|'−', total, lineas: [{ nombre, sub?, monto, signo? }] }], total?, totalLbl? }
export function conFuente(el, build) {
  el.classList.add('fx');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  const lbl = el.querySelector('.lbl');
  if (lbl) lbl.append(h('span', { class: 'fx-i', 'aria-hidden': 'true' }, ' ›'));
  const open = (e) => { e.stopPropagation(); abrirFuente(build()); };
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
  return el;
}

const money = (v, signo) => {
  if (privacy.hide) return crc(0);
  const neg = v < 0;
  return `${signo || (neg ? '−' : '')}${crc(Math.abs(v))}`;
};

// Hoja que sube desde abajo (sirve para el detalle de los totales y para formularios).
export function abrirHoja({ titulo, kicker, cuerpo, onClose }) {
  document.querySelector('.sheet-bg')?.remove();
  const cerrar = () => { bg.classList.add('out'); setTimeout(() => bg.remove(), 220); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') cerrar(); };
  const bg = h('div', { class: 'sheet-bg no-ptr', onclick: (e) => { if (e.target === bg) cerrar(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div', { class: 'sheet-h' },
        h('div', {}, kicker ? h('span', { class: 'sheet-k' }, kicker) : null, h('b', {}, titulo)),
        h('button', { type: 'button', class: 'x-btn', 'aria-label': 'Cerrar', onclick: cerrar }, '✕')),
      h('div', { class: 'sheet-body' }, cuerpo)));
  document.body.append(bg);
  document.addEventListener('keydown', esc);
  gestos(bg, cerrar);
  return cerrar;
}

// Gestos de la hoja (el resumen de atrás nunca se mueve mientras está abierta):
// · tocar lo de atrás → cierra
// · deslizar hacia abajo (fuera de la lista, o con la lista arriba del todo) → cierra
// · deslizar hacia arriba fuera de la lista → la hoja crece si tiene más que mostrar; si no, no pasa nada
function gestos(bg, cerrar) {
  const sheet = bg.querySelector('.sheet');
  const body = bg.querySelector('.sheet-body');
  const alto = () => sheet.getBoundingClientRect().height;
  const maxAlto = () => {
    const cabeza = sheet.querySelector('.sheet-h').offsetHeight;
    const pie = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    return Math.min(cabeza + body.scrollHeight + pie, innerHeight * 0.92);
  };
  let g = null;
  bg.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0];
    g = { y0: t.clientY, x0: t.clientX, enLista: body.contains(e.target), top0: body.scrollTop, modo: null, dy: 0, hist: [], alto0: alto() };
  }, { passive: true });
  bg.addEventListener('touchmove', (e) => {
    if (!g) return;
    const t = e.touches[0];
    const dy = t.clientY - g.y0;
    g.dy = dy;
    const now = performance.now();
    g.hist = g.hist.filter((p) => now - p.t < 100).concat({ t: now, y: dy });
    if (!g.modo) {
      // Dentro de una lista que scrollea no se frena nada todavía: si se frena el primer movimiento, el iPhone ya no deja scrollear.
      const listaScrollea = g.enLista && body.scrollHeight > body.clientHeight + 1;
      if (Math.abs(dy) < 6) { if (!listaScrollea && e.cancelable) e.preventDefault(); return; }
      const sube = dy < 0;
      const cabe = body.scrollHeight <= body.clientHeight + 1;
      if (g.enLista && !cabe) {
        const arriba = body.scrollTop <= 0;
        const abajo = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
        if (!sube && arriba) g.modo = 'bajar';
        else if (sube && abajo) g.modo = 'quieto';
        else g.modo = 'lista'; // la lista se mueve sola
      } else {
        g.modo = sube ? (maxAlto() > g.alto0 + 4 ? 'crecer' : 'quieto') : 'bajar';
      }
      if (g.modo === 'bajar' || g.modo === 'crecer') sheet.style.transition = 'none';
    }
    if (g.modo === 'lista') return;
    if (e.cancelable) e.preventDefault();
    if (g.modo === 'bajar') sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    else if (g.modo === 'crecer') sheet.style.maxHeight = `${Math.min(maxAlto(), g.alto0 - dy)}px`;
  }, { passive: false });
  const soltar = () => {
    if (!g) return;
    const { modo, dy, hist } = g;
    const h0 = hist[0], h1 = hist[hist.length - 1];
    const vel = h0 && h1 && h1.t > h0.t ? (h1.y - h0.y) / (h1.t - h0.t) : 0;
    g = null;
    sheet.style.transition = 'transform .22s ease-out, max-height .22s ease-out';
    if (modo === 'bajar') {
      if (dy > 90 || vel > 0.5) { sheet.style.transform = `translateY(${alto()}px)`; cerrar(); }
      else sheet.style.transform = '';
    } else if (modo === 'crecer') {
      sheet.style.maxHeight = (-dy > 40 || vel < -0.4) ? `${maxAlto()}px` : '';
    }
  };
  bg.addEventListener('touchend', soltar);
  bg.addEventListener('touchcancel', soltar);
}

export function abrirFuente({ titulo, nota, grupos = [], total, totalLbl }) {
  return abrirHoja({ titulo, kicker: '¿De dónde sale?', cuerpo: [
    nota ? h('p', { class: 'note' }, nota) : null,
    grupos.filter(Boolean).map((g) => h('div', { class: 'fx-g' },
      h('div', { class: 'fx-gh' },
        h('span', {}, g.signo ? h('span', { class: `fx-s ${g.signo === '−' ? 'minus' : 'plus'}` }, g.signo) : null, g.titulo),
        g.total != null ? h('b', {}, money(g.total)) : null),
      g.lineas?.length ? h('ul', { class: 'rows fx-rows' }, g.lineas.map((l) => h('li', {},
        h('div', { class: 'main' }, l.nombre, l.sub ? h('span', { class: 'sub' }, l.sub) : null),
        h('span', { class: 'amt' }, money(l.monto, l.signo)))))
        : g.vacio ? h('p', { class: 'note fx-empty' }, g.vacio) : null)),
    total != null ? h('div', { class: `fx-total${total < 0 ? ' bad' : ''}` }, h('span', {}, `= ${totalLbl || titulo}`), h('b', {}, money(total))) : null,
  ] });
}
