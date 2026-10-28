// "+ Gasto": anotar un gasto sin factura (SINPE, Uber, efectivo, la feria…) en segundos.
import { h, crc, usd, todayCR, addDays, dayShort } from './ui.js';
import * as C from './calc.js';
import { abrirHoja } from './fuente.js';

const FUENTES = ['Salario', 'Wink', 'BofA', 'Préstamo', 'Efectivo'];
const TIPOS = [['Variable', 'Variable', 'Súper, comida, transporte…'], ['Una vez', 'De una vez', 'Algo puntual']];

export function abrirGasto(ctx, pre = {}) {
  const { sync, toast } = ctx;
  const cfg = sync.config;
  const gastos = sync.data('gastos');
  const hoy = todayCR();
  // Lo último que se anotó en cada comercio sirve para adivinar la categoría.
  const porComercio = new Map();
  for (const g of gastos.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))) if (g.comercio) porComercio.set(g.comercio.toLowerCase(), g);
  const cats = [...new Set([...C.CATS, 'Transporte', ...gastos.map((g) => g.categoria).filter(Boolean)])];
  const st = { monto: '', moneda: 'CRC', comercio: '', desc: '', categoria: pre.categoria || null, tipo: 'Variable', fuente: 'Salario', quien: cfg.persona, fecha: hoy, guardando: false, catAuto: false };

  const err = h('p', { class: 'error-msg', hidden: true });
  const seg = (key, opts, cls = '') => {
    const wrap = h('div', { class: `seg wrap ${cls}` });
    const paint = () => { for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(st[key]))); };
    for (const o of opts) {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      wrap.append(h('button', { type: 'button', 'data-v': v, onclick: () => { st[key] = v; if (key === 'categoria') st.catAuto = false; paint(); if (key === 'moneda') montoIn.placeholder = v === 'USD' ? '0.00' : '0'; } }, t));
    }
    paint();
    wrap.paint = paint;
    return wrap;
  };
  const montoIn = h('input', { class: 'input big-num', id: 'g-monto', inputmode: 'decimal', placeholder: '0', autocomplete: 'off', oninput: (e) => { st.monto = e.target.value; } });
  const monedaSeg = seg('moneda', [['CRC', '₡'], ['USD', '$']], 'mini');
  const catSeg = seg('categoria', cats);
  const comIn = h('input', { class: 'input', id: 'g-comercio', list: 'g-comercios', placeholder: 'Uber, la feria, SINPE a Cris…', autocomplete: 'off', oninput: (e) => {
    st.comercio = e.target.value;
    const prev = porComercio.get(st.comercio.trim().toLowerCase());
    if (prev && (!st.categoria || st.catAuto)) {
      st.categoria = prev.categoria; st.catAuto = true; catSeg.paint();
      if (prev.tipo === 'Variable' || prev.tipo === 'Una vez') { st.tipo = prev.tipo; tipoSeg.paint(); }
    }
  } });
  const descIn = h('input', { class: 'input', id: 'g-desc', placeholder: 'Opcional', autocomplete: 'off', oninput: (e) => { st.desc = e.target.value; } });
  const tipoSeg = seg('tipo', TIPOS.map(([v, t]) => [v, t]));
  const fechaIn = h('input', { class: 'input', id: 'g-fecha', type: 'date', value: hoy, max: hoy, onchange: (e) => { st.fecha = e.target.value || hoy; diaSeg.paint(); } });
  const diaSeg = (() => {
    const wrap = h('div', { class: 'seg wrap' });
    const opts = [['hoy', 'Hoy', hoy], ['ayer', 'Ayer', addDays(hoy, -1)]];
    const paint = () => { for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.f === st.fecha)); fechaIn.value = st.fecha; };
    for (const [, t, f] of opts) wrap.append(h('button', { type: 'button', 'data-f': f, onclick: () => { st.fecha = f; paint(); } }, t));
    wrap.paint = paint;
    return wrap;
  })();

  const guardar = async () => {
    err.hidden = true;
    const n = Number(String(st.monto).replace(/[^\d.]/g, ''));
    if (!n) { err.textContent = 'Poné el monto.'; err.hidden = false; montoIn.focus(); return; }
    if (!st.comercio.trim()) { err.textContent = '¿En qué fue? (el lugar o a quién se le pagó)'; err.hidden = false; comIn.focus(); return; }
    if (!st.categoria) { err.textContent = 'Elegí la categoría.'; err.hidden = false; return; }
    const tc = C.ultimoTC(sync.data('tipo_cambio'));
    if (st.moneda === 'USD' && !tc) { err.textContent = 'No tengo tipo de cambio para pasarlo a colones.'; err.hidden = false; return; }
    const montoCRC = st.moneda === 'USD' ? Math.round(n * Number(tc.venta)) : Math.round(n);
    const id = `GM-${Date.now().toString(36)}`;
    const rec = {
      id, fecha: st.fecha, comercio: st.comercio.trim(), categoria: st.categoria, subcategoria: '',
      descripcion: st.desc.trim(), monto: montoCRC, tipo: st.tipo, fuente: st.fuente, metodo_pago: st.fuente === 'Efectivo' ? 'Efectivo' : '',
      nota: [`Anotado en la app por ${cfg.persona}`, st.quien !== cfg.persona ? `pagó ${st.quien}` : null, st.moneda === 'USD' ? `${usd(n)} al tipo de cambio de ${crc(Number(tc.venta))}` : null].filter(Boolean).join(' · '),
      quien_pago: st.quien,
    };
    st.guardando = true; btn.disabled = true;
    await sync.mutate('gastos', { kind: 'upsert', record: rec }, `gasto: ${rec.comercio} ${crc(montoCRC)}`);
    // Si salió de BofA, se descuenta del saldo de la cuenta.
    const cta = (sync.data('cuentas') || []).find((c) => c.fuente === st.fuente);
    let antes = null;
    if (cta) {
      antes = Number(cta.saldo) || 0;
      const resta = cta.moneda === 'USD' ? (st.moneda === 'USD' ? n : Math.round((n / Number(tc?.venta || 1)) * 100) / 100) : montoCRC;
      await sync.mutate('cuentas', { kind: 'patch', record: { id: cta.id, saldo: Math.round((antes - resta) * 100) / 100, fecha: hoy } }, `saldo de ${cta.nombre} por gasto`);
    }
    cerrar();
    toast(`Anotado: ${rec.comercio} ${crc(montoCRC)}`, { label: 'Deshacer', fn: async () => {
      await sync.mutate('gastos', { kind: 'delete', id }, `deshace gasto ${rec.comercio}`);
      if (cta) await sync.mutate('cuentas', { kind: 'patch', record: { id: cta.id, saldo: antes } }, `saldo de ${cta.nombre}`);
    } });
  };
  const btn = h('button', { type: 'button', class: 'btn block', onclick: guardar }, 'Anotar gasto');

  const cerrar = abrirHoja({ titulo: 'Anotar un gasto', kicker: 'Sin factura', cuerpo: [
    h('div', { class: 'field' }, h('label', { for: 'g-monto' }, 'Monto'), h('div', { class: 'row-add' }, montoIn, monedaSeg)),
    h('div', { class: 'field' }, h('label', { for: 'g-comercio' }, '¿En qué?'), comIn,
      h('datalist', { id: 'g-comercios' }, [...new Set(gastos.map((g) => g.comercio).filter(Boolean))].map((c) => h('option', { value: c })))),
    h('div', { class: 'field' }, h('label', {}, 'Categoría'), catSeg),
    h('div', { class: 'field' }, h('label', {}, 'Tipo'), tipoSeg),
    h('div', { class: 'field' }, h('label', {}, 'Cómo se pagó'), seg('fuente', FUENTES)),
    h('div', { class: 'field' }, h('label', {}, 'Quién pagó'), seg('quien', ['Jose', 'Ali'])),
    h('div', { class: 'field' }, h('label', { for: 'g-fecha' }, 'Cuándo'), h('div', { class: 'row-add' }, diaSeg, fechaIn)),
    h('div', { class: 'field' }, h('label', { for: 'g-desc' }, 'Detalle'), descIn),
    err, btn,
    h('p', { class: 'note', style: { margin: '10px 0 0' } }, 'Los pagos que se repiten cada mes van en Recurrentes, y las compras con factura conviene subirlas (así se anotan los productos y precios).'),
  ] });
  diaSeg.paint();
  setTimeout(() => montoIn.focus(), 250);
}
