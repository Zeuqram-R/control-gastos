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

export function abrirFuente({ titulo, nota, grupos = [], total, totalLbl }) {
  document.querySelector('.sheet-bg')?.remove();
  const cerrar = () => { bg.classList.add('out'); setTimeout(() => bg.remove(), 180); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') cerrar(); };
  const bg = h('div', { class: 'sheet-bg no-ptr', onclick: (e) => { if (e.target === bg) cerrar(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `De dónde sale: ${titulo}` },
      h('div', { class: 'sheet-h' },
        h('div', {}, h('span', { class: 'sheet-k' }, '¿De dónde sale?'), h('b', {}, titulo)),
        h('button', { type: 'button', class: 'x-btn', 'aria-label': 'Cerrar', onclick: cerrar }, '✕')),
      h('div', { class: 'sheet-body' },
        nota ? h('p', { class: 'note' }, nota) : null,
        grupos.filter(Boolean).map((g) => h('div', { class: 'fx-g' },
          h('div', { class: 'fx-gh' },
            h('span', {}, g.signo ? h('span', { class: `fx-s ${g.signo === '−' ? 'minus' : 'plus'}` }, g.signo) : null, g.titulo),
            g.total != null ? h('b', {}, money(g.total)) : null),
          g.lineas?.length ? h('ul', { class: 'rows fx-rows' }, g.lineas.map((l) => h('li', {},
            h('div', { class: 'main' }, l.nombre, l.sub ? h('span', { class: 'sub' }, l.sub) : null),
            h('span', { class: 'amt' }, money(l.monto, l.signo)))))
            : g.vacio ? h('p', { class: 'note fx-empty' }, g.vacio) : null)),
        total != null ? h('div', { class: `fx-total${total < 0 ? ' bad' : ''}` }, h('span', {}, `= ${totalLbl || titulo}`), h('b', {}, money(total))) : null)));
  document.body.append(bg);
  document.addEventListener('keydown', esc);
}
