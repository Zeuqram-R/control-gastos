// "+ Gasto": anotar un gasto sin factura (SINPE, Uber, efectivo, la feria…) en segundos.
import { h, crc, todayCR, addDays } from './ui.js';
import { FUENTES, TIPOS, ruta, opcionesGasto, armarGasto } from './gastoRec.js';
import * as C from './calc.js';
import { abrirHoja } from './fuente.js';

export { ruta };

export function abrirGasto(ctx, pre = {}) {
  const { sync, toast } = ctx;
  const cfg = sync.config;
  const gastos = sync.data('gastos');
  const hoy = todayCR();
  // Lo último que se anotó en cada comercio sirve para adivinar la categoría.
  const O = opcionesGasto(gastos);
  const porComercio = new Map(Object.entries(O.porComercio));
  const { catsCasa, catsNeg } = O;
  const st = { monto: '', moneda: 'CRC', comercio: '', desc: '', categoria: pre.categoria || null, tipo: 'Variable', fuente: pre.negocio ? C.CAJA_NEGOCIO : 'Salario', quien: cfg.persona, fecha: hoy, guardando: false, catAuto: false, negocio: !!pre.negocio };

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
  let catSeg = seg('categoria', st.negocio ? catsNeg : catsCasa);
  let fuenteSeg = seg('fuente', st.negocio ? [C.CAJA_NEGOCIO, ...FUENTES] : FUENTES);
  const catBox = h('div', {}, catSeg), fuenteBox = h('div', {}, fuenteSeg);
  const negBtn = h('button', { type: 'button', class: 'neg-switch', 'aria-pressed': String(st.negocio), onclick: () => {
    st.negocio = !st.negocio; negBtn.setAttribute('aria-pressed', String(st.negocio));
    st.categoria = null; st.catAuto = false;
    st.fuente = st.negocio ? C.CAJA_NEGOCIO : 'Salario';
    catSeg = seg('categoria', st.negocio ? catsNeg : catsCasa); catBox.replaceChildren(catSeg);
    fuenteSeg = seg('fuente', st.negocio ? [C.CAJA_NEGOCIO, ...FUENTES] : FUENTES); fuenteBox.replaceChildren(fuenteSeg);
    negNota.hidden = !st.negocio;
  } }, h('span', { class: 'neg-dot' }), 'Es de Santo Coco 🥥');
  const negNota = h('p', { class: 'note', style: { margin: '6px 0 0' }, hidden: !st.negocio || null }, 'Si sale de la caja del negocio no toca la plata de la casa. Si lo pagaron con plata de la casa, se cuenta en la quincena como "Santo Coco".');
  const comIn = h('input', { class: 'input', id: 'g-comercio', list: 'g-comercios', placeholder: 'Uber, la feria, SINPE a Cris…', autocomplete: 'off', oninput: (e) => {
    st.comercio = e.target.value;
    const prev = porComercio.get(st.comercio.trim().toLowerCase());
    if (prev && !!prev.negocio === st.negocio && (!st.categoria || st.catAuto)) {
      st.categoria = prev.categoria; st.catAuto = true; catSeg.paint();
      if (prev.tipo === 'Variable' || prev.tipo === 'Una vez') { st.tipo = prev.tipo; tipoSeg.paint(); }
    }
  } });
  const descIn = h('input', { class: 'input', id: 'g-desc', placeholder: 'Opcional · en Uber, DiDi, InDrive, taxi o bus: de dónde a dónde (Casa a Walmart)', autocomplete: 'off', oninput: (e) => { st.desc = e.target.value; } });
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
    const R = armarGasto(st, { persona: cfg.persona, tipo_cambio: sync.data('tipo_cambio'), cuentas: sync.data('cuentas') || [], hoy });
    if (R.error) { err.textContent = R.error; err.hidden = false; if (R.campo === 'monto') montoIn.focus(); else if (R.campo === 'comercio') comIn.focus(); return; }
    const { rec, montoCRC } = R, id = rec.id;
    st.guardando = true; btn.disabled = true;
    await sync.mutate('gastos', { kind: 'upsert', record: rec }, R.summary);
    const cta = R.cuenta;
    if (cta) await sync.mutate('cuentas', { kind: 'patch', record: cta.record }, cta.summary);
    cerrar();
    toast(`Anotado: ${rec.comercio} ${crc(montoCRC)}`, { label: 'Deshacer', fn: async () => {
      await sync.mutate('gastos', { kind: 'delete', id }, R.undoSummary);
      if (cta) await sync.mutate('cuentas', { kind: 'patch', record: cta.undo }, cta.undoSummary);
    } });
  };
  const btn = h('button', { type: 'button', class: 'btn blue block', onclick: guardar }, 'Anotar gasto');

  const cerrar = abrirHoja({ titulo: 'Anotar un gasto', kicker: 'Sin factura', cuerpo: [
    h('div', { class: 'field' }, h('label', { for: 'g-monto' }, 'Monto'), h('div', { class: 'row-add' }, montoIn, monedaSeg)),
    h('div', { class: 'field' }, h('label', { for: 'g-comercio' }, '¿En qué?'), comIn,
      h('datalist', { id: 'g-comercios' }, [...new Set(gastos.map((g) => g.comercio).filter(Boolean))].map((c) => h('option', { value: c })))),
    h('div', { class: 'field' }, negBtn, negNota),
    h('div', { class: 'field' }, h('label', {}, 'Categoría'), catBox),
    h('div', { class: 'field' }, h('label', {}, 'Tipo'), tipoSeg),
    h('div', { class: 'field' }, h('label', {}, 'Cómo se pagó'), fuenteBox),
    h('div', { class: 'field' }, h('label', {}, 'Quién pagó'), seg('quien', ['Jose', 'Ali'])),
    h('div', { class: 'field' }, h('label', { for: 'g-fecha' }, 'Cuándo'), h('div', { class: 'row-add' }, diaSeg, fechaIn)),
    h('div', { class: 'field' }, h('label', { for: 'g-desc' }, 'Detalle'), descIn),
    err, btn,
    h('p', { class: 'note', style: { margin: '10px 0 0' } }, 'Los pagos que se repiten cada mes van en Recurrentes, y las compras con factura conviene subirlas (así se anotan los productos y precios).'),
  ] });
  diaSeg.paint();
  setTimeout(() => montoIn.focus(), 250);
}
