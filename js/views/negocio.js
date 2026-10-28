// Página Santo Coco: ventas y gastos del negocio de Ali, separados de la plata de la casa.
import { h, crc, dayShort, todayCR, addDays, MESES, stat, bars, empty } from '../ui.js';
import * as C from '../calc.js';
import { abrirHoja } from '../fuente.js';
import { abrirGasto } from '../gasto.js';

const nst = { off: 0 };
const COBROS = ['SINPE', 'Efectivo', 'Tarjeta', 'Otro'];

function abrirVenta(ctx) {
  const { sync, toast } = ctx;
  const cfg = sync.config;
  const hoy = todayCR();
  const st = { cobro: 'SINPE', fecha: hoy, quien: cfg.persona };
  const err = h('p', { class: 'error-msg', hidden: true });
  const seg = (key, opts) => {
    const w = h('div', { class: 'seg wrap' });
    const paint = () => { for (const b of w.children) b.setAttribute('aria-pressed', String(b.dataset.v === st[key])); };
    for (const [v, t] of opts.map((o) => (Array.isArray(o) ? o : [o, o]))) w.append(h('button', { type: 'button', 'data-v': v, onclick: () => { st[key] = v; paint(); if (key === 'fecha') fechaIn.value = v; } }, t));
    paint(); w.paint = paint;
    return w;
  };
  const monto = h('input', { class: 'input big-num', id: 'v-monto', inputmode: 'numeric', placeholder: '0', autocomplete: 'off' });
  const det = h('input', { class: 'input', id: 'v-det', placeholder: 'Qué se vendió o a quién (opcional)', autocomplete: 'off' });
  const fechaIn = h('input', { class: 'input', id: 'v-fecha', type: 'date', value: hoy, max: hoy, onchange: (e) => { st.fecha = e.target.value || hoy; diaSeg.paint(); } });
  const diaSeg = seg('fecha', [[hoy, 'Hoy'], [addDays(hoy, -1), 'Ayer']]);
  const cerrar = abrirHoja({ titulo: 'Anotar una venta', kicker: 'Santo Coco 🥥', cuerpo: [
    h('div', { class: 'field' }, h('label', { for: 'v-monto' }, 'Monto (₡)'), monto),
    h('div', { class: 'field' }, h('label', { for: 'v-det' }, 'Detalle'), det),
    h('div', { class: 'field' }, h('label', {}, 'Cómo se cobró'), seg('cobro', COBROS)),
    h('div', { class: 'field' }, h('label', {}, 'Quién la anotó'), seg('quien', ['Ali', 'Jose'])),
    h('div', { class: 'field' }, h('label', { for: 'v-fecha' }, 'Cuándo'), h('div', { class: 'row-add' }, diaSeg, fechaIn)),
    err,
    h('button', { type: 'button', class: 'btn block', onclick: async () => {
      const n = Math.round(Number(String(monto.value).replace(/[^\d.]/g, '')));
      if (!n) { err.textContent = 'Poné el monto.'; err.hidden = false; monto.focus(); return; }
      const id = `V-${Date.now().toString(36)}`;
      await sync.mutate('negocio', { kind: 'upsert', record: { id, tipo: 'venta', fecha: st.fecha, monto: n, detalle: det.value.trim(), cobro: st.cobro, quien: st.quien } }, `venta Santo Coco ${crc(n)}`);
      cerrar();
      toast(`Venta anotada: ${crc(n)}`, { label: 'Deshacer', fn: () => sync.mutate('negocio', { kind: 'delete', id }, 'deshace venta') });
    } }, 'Anotar venta'),
  ] });
  setTimeout(() => monto.focus(), 250);
}

export function viewNegocio(ctx) {
  const { sync } = ctx;
  const D = { gastos: sync.data('gastos'), negocio: sync.data('negocio') };
  const hoy = todayCR();
  // Mes que se está viendo (con flechas hasta el primer mes con datos).
  const base = C.negocioInfo(D, hoy.slice(0, 7));
  const primero = base.meses[0] || hoy.slice(0, 7);
  const meses = [];
  for (let [y, m] = primero.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= hoy.slice(0, 7); m === 12 ? (y++, m = 1) : m++) meses.push(`${y}-${String(m).padStart(2, '0')}`);
  nst.off = Math.max(0, Math.min(nst.off, meses.length - 1));
  const mes = meses[meses.length - 1 - nst.off];
  const N = C.negocioInfo(D, mes);
  const nomMes = `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
  const nav = (lbl, aria, delta, off) => h('button', { type: 'button', class: 'icon-btn', 'aria-label': aria, disabled: off || null, onclick: () => { nst.off += delta; ctx.rerender(); } }, lbl);
  return [
    h('section', { class: 'sec' },
      h('p', { class: 'note' }, 'Lo del negocio va aparte de la plata de la casa. Lo que se paga con la caja de Santo Coco no toca la quincena; si se paga con plata de la casa, aparece en la quincena como "Santo Coco".'),
      h('div', { class: 'fac-btns neg-btns' },
        h('button', { type: 'button', class: 'btn', onclick: () => abrirVenta(ctx) }, 'Venta'),
        h('button', { type: 'button', class: 'btn blue', onclick: () => abrirGasto(ctx, { negocio: true }) }, 'Gasto'))),
    h('section', { class: 'card sec' },
      h('div', { class: 'per-nav' },
        nav('‹', 'Mes anterior', 1, nst.off >= meses.length - 1),
        h('div', { class: 'per-t' }, h('b', {}, nomMes.charAt(0).toUpperCase() + nomMes.slice(1)), h('span', { class: 'sub' }, `${N.nVentas} venta(s) · ${N.movs.length - N.nVentas} gasto(s)`)),
        nav('›', 'Mes siguiente', -1, nst.off <= 0)),
      h('div', { class: 'qgrid' },
        stat('Ventas', crc(N.ventasMes), N.nVentas ? `Promedio ${crc(N.ventasMes / N.nVentas)} por venta` : 'Sin ventas este mes', 'var(--ok)'),
        stat('Gastos', crc(N.gastosMes), 'Insumos, empaque, transporte…'),
        stat(N.ganancia < 0 ? 'Pérdida' : 'Ganancia', `${N.ganancia < 0 ? '−' : ''}${crc(Math.abs(N.ganancia))}`, 'Ventas − gastos del mes', N.ganancia < 0 ? 'var(--bad)' : 'var(--ok)'),
        stat('Caja del negocio', crc(N.caja), `Ventas − lo pagado con la caja (todo el tiempo)${N.puestoCasa ? ` · la casa ha puesto ${crc(N.puestoCasa)}` : ''}`)),
      N.porCat.length ? [h('div', { class: 'qhist-t' }, 'Gastos por categoría'), bars(N.porCat, { color: 'var(--blue)' })] : null),
    h('section', { class: 'card sec' },
      h('h2', {}, 'Movimientos del mes'),
      N.movs.length ? h('ul', { class: 'rows' }, N.movs.map((m) => h('li', {},
        h('span', { class: `hdot ${m.clase === 'venta' ? 'ok' : 'work'}` }),
        h('div', { class: 'main' }, m.clase === 'venta' ? (m.detalle || 'Venta') : m.comercio,
          h('span', { class: 'sub' }, [dayShort(m.fecha), m.clase === 'venta' ? m.cobro : m.categoria, m.clase === 'venta' ? m.quien : (m.fuente === C.CAJA_NEGOCIO ? 'caja del negocio' : `plata de la casa (${m.fuente})`)].filter(Boolean).join(' · '))),
        h('span', { class: 'amt', style: { color: m.clase === 'venta' ? 'var(--ok)' : null } }, `${m.clase === 'venta' ? '+' : '−'}${crc(m.monto)}`)))) : empty('Nada anotado este mes. Usá Venta o Gasto de arriba.')),
  ];
}
