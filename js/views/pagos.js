// Páginas Recurrentes y Deudas, más el "tachar con 5 segundos para deshacer" que comparten.
import { h, crc, usd, todayCR, dayShort, daysBetween, empty, MESES, nombrePropio } from '../ui.js';
import * as C from '../calc.js';
import { secCuentas } from './resumen.js';

export const QC = { Ambos: 'var(--accent)', Ali: '#d46fb4', Jose: '#4f8fe8' };
const QL = { Ambos: 'De ambos', Ali: 'De Ali', Jose: 'De Jose' };
const ORANGE = 'var(--orange)', GREEN = 'var(--green)';
const colorOf = (q) => QC[q] || QC.Ambos;

// Tachar: queda "pendiente" 5 segundos (se puede deshacer tocando otra vez) y después se guarda.
const pending = new Map(); // key -> { n, timer, commit }
function toggle(key, commit, rerender) {
  const p = pending.get(key);
  if (p) { clearInterval(p.timer); pending.delete(key); rerender(); return; }
  const np = { n: 5, commit };
  np.timer = setInterval(() => {
    np.n--;
    if (np.n <= 0) { clearInterval(np.timer); pending.delete(key); commit(); }
    rerender();
  }, 1000);
  pending.set(key, np);
  rerender();
}
const pendOf = (key) => pending.get(key) || null;
const undoTxt = (p) => `Tachado · tocá de nuevo para deshacer (${p.n})`;

function base(sync) {
  const tc = C.ultimoTC(sync.data('tipo_cambio'));
  return {
    tc,
    rec: C.recurrentesCRC(sync.data('recurrentes'), tc),
    deudas: C.deudasCRC(C.saldoDeudas(sync.data('deudas'), sync.data('recurrentes'), sync.data('pagos_recurrentes'), sync.data('abonos')), tc),
    abonos: sync.data('abonos'),
    cuentas: sync.data('cuentas'),
    pagRec: new Map(sync.data('pagos_recurrentes').map((p) => [p.id, p])),
    pagDeu: new Map(sync.data('pagos_deudas').map((p) => [p.id, p])),
  };
}
const OFF = ['cancelado', 'sin costo', 'terminado'];

// ---------- Recurrentes ----------
const rstate = { panel: null, off: 0, sel: null };

export function viewRecurrentes(ctx) {
  const { sync, rerender, toast } = ctx;
  const B = base(sync);
  const hoy = todayCR();
  const q = C.quincenaDe(hoy);
  const act = B.rec.filter((f) => !OFF.includes(f.estado));
  const anuales = act.filter((f) => f.frecuencia === 'anual');
  const persona = sync.config.persona;
  // Tarjeta Wink: lo usado la quincena anterior, para tachar cuando la paguen.
  const DW = Object.fromEntries(['gastos', 'recurrentes', 'pagos_recurrentes', 'deudas', 'pagos_deudas', 'abonos', 'cuentas', 'tipo_cambio'].map((k) => [k, sync.data(k)]));
  const wink = C.winkPendiente(DW, hoy) || (() => {
    // Si ya se tachó, igual se muestra en el panel como pagado.
    const p = B.pagRec.get(`${C.WINK}_${q.inicio}`);
    return p ? { id: C.WINK, nombre: 'Tarjeta Wink (quincena anterior)', prox: q.inicio, monto: p.monto_crc, moneda: 'CRC', monto_crc: p.monto_crc, quien: 'Ambos', fuente: 'Salario', wink: true } : null;
  })();

  // Si el pago sale de una cuenta (p. ej. Bank of America), se descuenta de su saldo.
  const ajustarCuenta = (f, signo) => {
    const c = B.cuentas.find((x) => x.fuente === f.fuente);
    if (!c || c.moneda !== f.moneda) return;
    const saldo = Math.round((Number(c.saldo) - signo * Number(f.monto)) * 100) / 100;
    sync.mutate('cuentas', { kind: 'patch', record: { id: c.id, saldo, fecha: hoy } }, `${c.nombre}: ${signo > 0 ? '−' : '+'}${f.moneda === 'USD' ? '$' : '₡'}${f.monto} (${f.nombre})`);
  };
  const pagar = (f, fecha) => {
    const key = `${f.id}_${fecha}`;
    toggle(`r:${key}`, async () => {
      await sync.mutate('pagos_recurrentes', { kind: 'upsert', record: { id: key, recurrente: f.id, vence: fecha, fecha: hoy, monto_crc: f.monto_crc, fuente: f.fuente || 'Salario', por: persona } }, `pagó ${f.nombre} (${dayShort(fecha)})`);
      ajustarCuenta(f, 1);
    }, rerender);
  };
  const despagar = (f, fecha) => {
    const key = `${f.id}_${fecha}`;
    sync.mutate('pagos_recurrentes', { kind: 'delete', id: key }, `deshace el pago de ${f.nombre}`);
    ajustarCuenta(f, -1);
    toast(`${f.nombre}: ya no está marcado como pagado`);
  };

  // Fila de un pago (en el panel o en el detalle del día).
  const payRow = (f, fecha, sub) => {
    const key = `${f.id}_${fecha}`;
    const paid = B.pagRec.get(key), p = pendOf(`r:${key}`);
    const dias = fecha ? daysBetween(hoy, fecha) : null;
    return h('li', { class: 'pay-row tap' + (paid ? ' pagado' : '') + (p ? ' tachado' : ''), onclick: () => (paid ? despagar(f, fecha) : pagar(f, fecha)) },
      h('span', { class: 'bar', style: { background: colorOf(f.quien) } }),
      h('div', { class: 'main' },
        h('span', { class: 'nm' }, (paid ? '✓ ' : '') + f.nombre + (B.cuentas.some((c) => c.fuente === f.fuente) ? ` · ${f.fuente}` : '')),
        h('span', { class: 'sub' }, paid ? `Pagado el ${dayShort(paid.fecha)}${paid.por ? ` por ${paid.por}` : ''} · tocá para deshacer`
          : `${fecha ? `${dayShort(fecha)}${dias === 0 ? ' · hoy' : dias === 1 ? ' · mañana' : dias > 1 ? ` · en ${dias} días` : dias < 0 ? ` · hace ${-dias} días` : ''}` : 'Sin fecha'} · ${QL[f.quien] || QL.Ambos}${sub ? ` · ${sub}` : ''}`),
        p ? h('span', { class: 'undo' }, undoTxt(p)) : null),
      h('div', { class: 'amt' }, crc(f.monto_crc), f.moneda === 'USD' ? h('span', { class: 'muted' }, usd(f.monto)) : null));
  };

  // Panel desplegable de los tiles.
  let panel = null;
  if (rstate.panel) {
    let rows;
    if (rstate.panel === 'q') rows = act.map((f) => ({ f, fecha: C.proximoPago(f, q.inicio) })).filter((r) => r.fecha && r.fecha <= q.fin);
    else if (rstate.panel === 'mes') rows = act.filter((f) => f.frecuencia !== 'anual').flatMap((f) => (f.dia ? C.fechasEntre(f, hoy, C.addDays30(hoy)).map((fecha) => ({ f, fecha })) : [{ f, fecha: null }]));
    else rows = anuales.map((f) => ({ f, fecha: C.proximoPago(f, hoy) }));
    rows = rows.filter((r) => C.aplica(r.f, B.cuentas));
    if (rstate.panel === 'q' && wink) rows.unshift({ f: wink, fecha: wink.prox });
    rows.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const pend = rows.filter((r) => !B.pagRec.has(`${r.f.id}_${r.fecha}`));
    panel = h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', {}, rstate.panel === 'q' ? `Por pagar esta quincena (${dayShort(q.inicio)} – ${dayShort(q.fin)})` : rstate.panel === 'mes' ? 'Recurrentes de los próximos 30 días' : 'Pagos anuales'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => { rstate.panel = null; rerender(); } }, '✕')),
      h('p', { class: 'note' }, 'Tocá uno para marcarlo como pagado (5 segundos para deshacer). Se ve igual en todos los aparatos.'),
      rows.length ? h('ul', { class: 'rows' }, rows.map((r) => payRow(r.f, r.fecha, [r.f.rango, r.f.categoria, r.f.fuente].filter(Boolean).join(' · ')))) : empty('Nada por aquí.'),
      h('div', { class: 'pay-total' }, h('span', {}, `${pend.length} pendiente(s)${rows.length > pend.length ? ` · ${rows.length - pend.length} pagado(s)` : ''}`), h('b', {}, crc(C.sum(pend, (r) => r.f.monto_crc)))));
  }

  const enQ = act.map((f) => ({ f, fecha: C.proximoPago(f, q.inicio) })).filter((r) => r.fecha && r.fecha <= q.fin && !B.pagRec.has(`${r.f.id}_${r.fecha}`));
  if (wink) enQ.unshift({ f: wink, fecha: wink.prox });
  const tileBtn = (k, lbl, num, sub) => h('button', { type: 'button', class: 'card tile tile-btn', 'aria-pressed': String(rstate.panel === k), onclick: () => { rstate.panel = rstate.panel === k ? null : k; rerender(); } },
    h('div', { class: 'lbl' }, `${lbl} ›`), h('div', { class: 'num' }, num), h('div', { class: 'sub' }, sub));

  return [
    h('section', { class: 'tiles' },
      tileBtn('mes', 'Recurrentes al mes', crc(C.sum(act, (f) => f.mensual_crc)), `${act.length} pagos activos · anuales repartidos en 12`),
      tileBtn('q', 'Por pagar esta quincena', crc(C.sum(enQ, (r) => r.f.monto_crc)), `${enQ.length} pago(s) hasta el ${dayShort(q.fin)}`),
      tileBtn('anual', 'Pagos anuales', crc(C.sum(anuales, (f) => f.monto_crc)), `${anuales.length} al año · ${usd(C.sum(anuales.filter((f) => f.moneda === 'USD'), (f) => f.monto))}`),
      h('div', { class: 'card tile' }, h('div', { class: 'lbl' }, 'Tipo de cambio'), h('div', { class: 'num' }, B.tc ? `₡${Number(B.tc.venta).toFixed(2)}` : '—'), h('div', { class: 'sub' }, B.tc ? `Venta · compra ₡${Number(B.tc.compra).toFixed(2)} · ${dayShort(B.tc.fecha)}` : ''))),
    panel,
    (() => {
      const DC = Object.fromEntries(['gastos', 'cuentas', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas', 'abonos', 'metas'].map((k) => [k, sync.data(k)]));
      return secCuentas(ctx, DC, C.balanceQuincena(DC, hoy), hoy);
    })(),
    calendario(ctx, B, act, payRow),
    otros(B),
  ];
}

function calendario(ctx, B, act, payRow) {
  const { rerender } = ctx;
  const hoy = todayCR();
  const [cy, cm] = hoy.split('-').map(Number);
  const base = new Date(Date.UTC(cy, cm - 1 + rstate.off, 1));
  const Y = base.getUTCFullYear(), M = base.getUTCMonth() + 1;
  const iso = (d) => new Date(Date.UTC(Y, M - 1, d)).toISOString().slice(0, 10);
  const first = iso(1), ym = first.slice(0, 7), lastDay = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  const ev = [];
  for (const f of act.filter((x) => x.dia && x.monto)) {
    const d = C.proximoPago(f, first);
    if (d && d.slice(0, 7) === ym) ev.push({ f, fecha: d, paid: B.pagRec.get(`${f.id}_${d}`), deuda: false });
  }
  for (const d of B.deudas.filter((x) => x.direccion === 'debemos' && x.fecha_limite && String(x.fecha_limite).slice(0, 7) === ym)) {
    ev.push({ d, fecha: String(d.fecha_limite).slice(0, 10), paid: B.pagDeu.get(d.id), deuda: true, f: { nombre: d.concepto, quien: d.de_quien, monto_crc: d.crc } });
  }
  const porDia = new Map();
  for (const e of ev) { if (!porDia.has(e.fecha)) porDia.set(e.fecha, []); porDia.get(e.fecha).push(e); }
  if (!rstate.sel || rstate.sel.slice(0, 7) !== ym) rstate.sel = hoy.slice(0, 7) === ym ? hoy : (ev.length ? ev.map((e) => e.fecha).sort()[0] : first);

  const cells = [];
  for (const d of ['L', 'K', 'M', 'J', 'V', 'S', 'D']) cells.push(h('div', { class: 'cal-dow' }, d));
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'cal-cell out' }));
  for (let day = 1; day <= lastDay; day++) {
    const ds = iso(day), list = porDia.get(ds) || [];
    cells.push(h('div', { class: 'cal-cell' + (ds === hoy ? ' today' : '') + (ds === rstate.sel ? ' sel' : ''), onclick: () => { rstate.sel = ds; rerender(); } },
      h('div', { class: 'cal-num' }, String(day)),
      list.slice(0, 3).map((e) => h('div', {
        class: 'cal-chip' + (e.deuda ? ' deuda' : '') + (e.paid ? ' pagado' : ''),
        style: e.paid ? { borderColor: colorOf(e.f.quien), color: colorOf(e.f.quien) } : { backgroundColor: colorOf(e.f.quien) },
      }, (e.paid ? '✓ ' : '') + e.f.nombre)),
      list.length > 3 ? h('div', { class: 'cal-more' }, `+${list.length - 3}`) : null));
  }
  const trail = (7 - ((lead + lastDay) % 7)) % 7;
  for (let i = 0; i < trail; i++) cells.push(h('div', { class: 'cal-cell out' }));

  const sel = porDia.get(rstate.sel) || [];
  const [, sm, sd] = rstate.sel.split('-').map(Number);
  const sinFecha = act.filter((f) => f.frecuencia !== 'anual' && !f.dia && f.monto);
  const nav = (lbl, aria, fn) => h('button', { type: 'button', class: 'btn secondary sm', 'aria-label': aria, onclick: () => { fn(); rstate.sel = null; rerender(); } }, lbl);

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', {}, `${MESES[M - 1].charAt(0).toUpperCase()}${MESES[M - 1].slice(1)} ${Y} · ${crc(C.sum(ev, (e) => e.f.monto_crc))}`),
      h('div', { class: 'cal-nav' }, nav('‹', 'Mes anterior', () => rstate.off--), nav('Hoy', 'Este mes', () => { rstate.off = 0; }), nav('›', 'Mes siguiente', () => rstate.off++))),
    h('div', { class: 'legend cal-legend' },
      ['Jose', 'Ali', 'Ambos'].map((k) => h('span', {}, h('i', { style: { background: QC[k] } }), k)),
      h('span', {}, h('i', { class: 'deuda-sw' }), 'Rayado = deuda'),
      h('span', {}, h('i', { class: 'pagado-sw' }, '✓'), 'Borde y ✓ = pagado')),
    h('div', { class: 'cal-grid no-ptr' }, cells),
    h('div', { class: 'cal-detail' },
      h('h3', {}, `${sd} de ${MESES[sm - 1]}${sel.length ? ` · ${crc(C.sum(sel.filter((e) => !e.paid), (e) => e.f.monto_crc))} por pagar` : ''}`),
      sel.length ? h('ul', { class: 'rows' }, sel.map((e) => (e.deuda
        ? h('li', { class: 'pay-row' + (e.paid ? ' pagado' : '') },
          h('span', { class: 'bar deuda-sw', style: { background: colorOf(e.f.quien) } }),
          h('div', { class: 'main' }, h('span', { class: 'nm' }, (e.paid ? '✓ ' : '') + e.f.nombre), h('span', { class: 'sub' }, `Deuda con ${e.d.persona} · se tacha en Deudas`)),
          h('div', { class: 'amt' }, crc(e.f.monto_crc)))
        : payRow(e.f, e.fecha, [e.f.rango, e.f.categoria].filter(Boolean).join(' · ')))))
        : empty('Nada que pagar este día.')),
    sinFecha.length ? h('p', { class: 'note', style: { marginTop: '12px' } }, `Sin fecha fija (no salen en el calendario): ${sinFecha.map((f) => `${f.nombre} ${crc(f.monto_crc)}${f.rango ? `, ${f.rango.toLowerCase()}` : ''}`).join(' · ')}.`) : null);
}

function otros(B) {
  const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const grupos = [
    ['Anuales', B.rec.filter((f) => f.frecuencia === 'anual' && !OFF.includes(f.estado))],
    ['Terminados, sin costo o cancelados', B.rec.filter((f) => OFF.includes(f.estado))],
  ].filter(([, l]) => l.length);
  return h('section', { class: 'card' },
    h('h2', {}, 'Anualidades, terminados y cancelados'),
    h('p', { class: 'note' }, 'Si renuevan algo cancelado, avisame y vuelve al calendario.'),
    grupos.flatMap(([g, list]) => [
      h('h3', { class: 'grp-h' }, g + (g === 'Anuales' ? ` · ${crc(C.sum(list, (f) => f.monto_crc))} al año` : '')),
      h('ul', { class: 'rows' }, list.slice().sort((a, b) => (a.mes || 0) - (b.mes || 0) || (a.dia || 0) - (b.dia || 0)).map((f) => h('li', { class: OFF.includes(f.estado) ? 'off' : '' },
        h('span', { class: 'who', style: { background: colorOf(f.quien) } }),
        h('div', { class: 'main' }, f.nombre + (f.estado === 'cancelado' ? ' (cancelado)' : f.estado === 'terminado' ? ' (terminado)' : ''),
          h('span', { class: 'sub' }, [f.frecuencia === 'anual' && f.dia ? `${f.dia} ${MES3[(f.mes || 1) - 1]}` : (f.rango || (f.dia ? `Día ${f.dia}` : '')), f.quien, f.nota].filter(Boolean).join(' · '))),
        h('span', { class: 'amt' }, f.moneda === 'USD' ? usd(f.monto) : crc(f.monto))))),
    ]));
}

// ---------- Deudas ----------
const dstate = { filtro: null, abiertos: new Set(), form: false, abonando: null, abono: '' };

export function viewDeudas(ctx) {
  const { sync, rerender, toast } = ctx;
  const B = base(sync);
  const hoy = todayCR();
  const persona = sync.config.persona;
  const vivas = B.deudas.filter((d) => !B.pagDeu.has(d.id));
  const deb = vivas.filter((d) => d.direccion === 'debemos'), nos = vivas.filter((d) => d.direccion !== 'debemos');
  const sumC = (l) => C.sum(l, (d) => d.crc), sumU = (l) => C.sum(l, (d) => d.usd);
  const bal = sumC(nos) - sumC(deb);

  const pagar = (d) => toggle(`d:${d.id}`, () => sync.mutate('pagos_deudas', { kind: 'upsert', record: { id: d.id, fecha: hoy, monto: d.monto, moneda: d.moneda, fuente: '', por: persona } }, `${d.direccion === 'debemos' ? 'pagó a' : 'cobró a'} ${d.persona}: ${d.concepto}`), rerender);
  const montoTxt = (d) => (d.moneda === 'USD' ? `${usd(d.monto)} (${crc(d.crc)})` : `${crc(d.monto)} (${usd(d.usd)})`);

  const filtroBtn = (k, lbl, list, color) => h('button', { type: 'button', class: 'card tile tile-btn', 'aria-pressed': String(dstate.filtro === k), onclick: () => { dstate.filtro = dstate.filtro === k ? null : k; rerender(); } },
    h('div', { class: 'lbl' }, lbl), h('div', { class: 'num', style: { color } }, crc(sumC(list))),
    h('div', { class: 'sub' }, `≈ ${usd(Math.round(sumU(list)))} · ${new Set(list.map((d) => d.persona)).size} personas${dstate.filtro === k ? ' · filtrado' : ''}`));

  const lista = vivas.filter((d) => !dstate.filtro || (dstate.filtro === 'debemos' ? d.direccion === 'debemos' : d.direccion !== 'debemos'));
  const grupos = [...C.groupBy(lista, (d) => `${d.persona}|${d.direccion}`)]
    .sort((a, b) => (a[1][0].direccion === 'debemos' ? 0 : 1) - (b[1][0].direccion === 'debemos' ? 0 : 1) || sumC(b[1]) - sumC(a[1]));

  // Abonar (pago parcial) a una deuda; baja lo que falta sin tacharla.
  const abonoUI = (d) => {
    if (dstate.abonando !== d.id) {
      return h('button', { type: 'button', class: 'link-btn abonar', onclick: (e) => { e.stopPropagation(); dstate.abonando = d.id; dstate.abono = ''; rerender(); } }, d.direccion === 'debemos' ? 'Abonar' : 'Registrar abono');
    }
    const inp = h('input', { class: 'input', id: `ab-${d.id}`, inputmode: 'decimal', placeholder: d.moneda === 'USD' ? 'Monto en $' : 'Monto en ₡', autocomplete: 'off', oninput: (e) => { dstate.abono = e.target.value; }, onclick: (e) => e.stopPropagation() });
    inp.value = dstate.abono;
    const guardar = async (e) => {
      e?.stopPropagation();
      const v = Number(String(inp.value).replace(/[^\d.]/g, ''));
      if (!v) { inp.focus(); return; }
      dstate.abonando = null; dstate.abono = '';
      await sync.mutate('abonos', { kind: 'upsert', record: { id: `A${Date.now().toString(36)}`, deuda: d.id, fecha: hoy, monto: v, moneda: d.moneda, fuente: '', por: persona } }, `abono a ${d.persona}: ${d.moneda === 'USD' ? '$' : '₡'}${v}`);
      toast('Abono anotado.');
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(e); });
    return h('div', { class: 'abono-form', onclick: (e) => e.stopPropagation() }, inp,
      h('button', { type: 'button', class: 'btn sm', onclick: guardar }, 'Guardar'),
      h('button', { type: 'button', class: 'btn secondary sm', onclick: (e) => { e.stopPropagation(); dstate.abonando = null; rerender(); } }, '✕'));
  };
  const abonadoTxt = (d) => (d.abonado ? h('div', { class: 'deuda-nota' }, `Abonado ${d.moneda === 'USD' ? usd(d.abonado) : crc(d.abonado)} (${d.abonos.length} abono${d.abonos.length === 1 ? '' : 's'}) de ${d.moneda === 'USD' ? usd(d.monto_original) : crc(d.monto_original)}`) : null);

  const card = ([gk, list]) => {
    const d0 = list[0], multi = list.length > 1, cls = d0.direccion === 'debemos' ? 'debe' : 'nos';
    const abierto = dstate.abiertos.has(gk);
    const head = [
      h('div', { class: 'deuda-h' }, h('b', {}, d0.persona), h('span', { class: `pill deuda-pill ${cls}` }, multi && new Set(list.map((d) => d.de_quien)).size > 1 ? 'Varios' : (d0.de_quien || 'Ambos'))),
      h('div', { class: 'deuda-tot' }, `${crc(sumC(list))} · ${usd(Math.round(sumU(list) * 100) / 100)}`),
    ];
    if (!multi && d0.recurrente) {
      return h('div', { class: `deuda ${cls} fija` },
        head,
        h('div', { class: 'deuda-it' }, h('span', {}, `Faltan ${d0.cuotas_faltan} de ${d0.cuotas_total} cuotas`), h('span', {}, crc(d0.crc))),
        abonadoTxt(d0),
        h('div', { class: 'deuda-nota' }, 'Baja sola con cada cuota que se marca pagada en Recurrentes, y con los pagos extra que abonés aquí.'),
        abonoUI(d0));
    }
    if (!multi) {
      const p = pendOf(`d:${d0.id}`);
      return h('div', { class: `deuda ${cls}` + (p ? ' tachado' : ''), role: 'button', onclick: () => pagar(d0) },
        head,
        h('div', { class: 'deuda-it' }, h('span', {}, d0.concepto + (d0.fecha_limite ? ` · pagar antes del ${dayShort(d0.fecha_limite)}` : '')), h('span', {}, montoTxt(d0))),
        d0.nota ? h('div', { class: 'deuda-nota' }, d0.nota) : null,
        abonadoTxt(d0),
        p ? h('span', { class: 'undo' }, undoTxt(p)) : abonoUI(d0));
    }
    return h('div', { class: `deuda ${cls}`, role: 'button', onclick: () => { abierto ? dstate.abiertos.delete(gk) : dstate.abiertos.add(gk); rerender(); } },
      head,
      h('div', { class: 'deuda-more' }, `${list.length} detalles · ${abierto ? 'tocá un detalle para tacharlo' : 'tocá para ver y tachar cada uno'}`),
      abierto ? list.map((d) => {
        const p = pendOf(`d:${d.id}`);
        return h('div', { class: 'deuda-it tachable' + (p ? ' tachado' : ''), onclick: (e) => { e.stopPropagation(); pagar(d); } },
          h('span', {}, d.concepto + (d.fecha_limite ? ` · antes del ${dayShort(d.fecha_limite)}` : '') + (d.de_quien !== d0.de_quien ? ` · ${d.de_quien}` : '')),
          h('span', {}, montoTxt(d)),
          d.abonado ? h('span', { class: 'abono-mini' }, `Abonado ${d.moneda === 'USD' ? usd(d.abonado) : crc(d.abonado)}`) : null,
          p ? h('span', { class: 'undo' }, undoTxt(p)) : abonoUI(d));
      }) : null);
  };

  const pagadas = B.deudas.filter((d) => B.pagDeu.has(d.id)).sort((a, b) => String(B.pagDeu.get(b.id).fecha).localeCompare(String(B.pagDeu.get(a.id).fecha)));

  return [
    h('section', { class: 'tiles' },
      filtroBtn('debemos', 'Debemos', deb, ORANGE),
      filtroBtn('nos', 'Nos deben', nos, GREEN),
      h('div', { class: 'card tile' }, h('div', { class: 'lbl' }, 'Balance'),
        h('div', { class: 'num', style: { color: bal < 0 ? 'var(--bad)' : 'var(--ok)' } }, `${bal < 0 ? '−' : '+'}${crc(Math.abs(bal))}`),
        h('div', { class: 'sub' }, bal < 0 ? 'Si todos pagaran hoy, todavía deberían esto' : 'Les deben más de lo que deben'))),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', {}, dstate.filtro === 'debemos' ? 'Lo que debemos' : dstate.filtro === 'nos' ? 'Lo que nos deben' : 'Deudas'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { dstate.form = !dstate.form; rerender(); } }, dstate.form ? 'Cerrar' : '+ Agregar')),
      dstate.form ? formDeuda(ctx, B) : null,
      h('div', { class: 'legend deuda-legend' },
        h('span', {}, h('i', { style: { background: ORANGE } }), 'Debemos'),
        h('span', {}, h('i', { style: { background: GREEN } }), 'Nos deben'),
        h('span', { class: 'dl-sep' }),
        h('span', { class: 'dl-who' }, ['Jose', 'Ali', 'Ambos'].map((k) => h('span', { class: 'pill dl-ex' }, k)), h('span', { class: 'muted' }, '← de quién es'))),
      h('p', { class: 'note' }, 'Tocá una deuda para tacharla como pagada (5 segundos para deshacer). Las que tienen varios detalles se abren para tachar cada uno. Totales en ₡ y $ (tipo de cambio de venta).'),
      grupos.length ? h('div', { class: 'deudas-grid' }, grupos.map(card)) : empty('No hay deudas pendientes aquí.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Pagado'),
      h('p', { class: 'note' }, 'Deudas que ya se pagaron o que ya nos pagaron, y los abonos, con su fecha.'),
      B.abonos.length ? [h('h3', { class: 'grp-h' }, 'Abonos'), h('ul', { class: 'rows' }, B.abonos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((a) => {
        const d = B.deudas.find((x) => x.id === a.deuda) || {};
        return h('li', { class: 'pay-row' },
          h('span', { class: 'bar', style: { background: d.direccion === 'debemos' ? ORANGE : GREEN } }),
          h('div', { class: 'main' }, `${d.persona || 'Deuda'} · abono`,
            h('span', { class: 'sub' }, `${d.concepto || ''} · el ${dayShort(a.fecha)}${a.por ? ` · ${a.por}` : ''} · `,
              h('button', { type: 'button', class: 'link-btn', onclick: () => { sync.mutate('abonos', { kind: 'delete', id: a.id }, `deshace abono a ${d.persona}`); toast('Abono quitado.'); } }, 'Deshacer'))),
          h('div', { class: 'amt' }, a.moneda === 'USD' ? usd(a.monto) : crc(a.monto)));
      })), h('h3', { class: 'grp-h' }, 'Deudas pagadas')] : null,
      pagadas.length ? h('ul', { class: 'rows' }, pagadas.map((d) => {
        const pg = B.pagDeu.get(d.id);
        return h('li', { class: 'pay-row' },
          h('span', { class: 'bar', style: { background: d.direccion === 'debemos' ? ORANGE : GREEN } }),
          h('div', { class: 'main' }, `${d.persona} · ${d.concepto}`,
            h('span', { class: 'sub' }, `${d.direccion === 'debemos' ? 'Pagamos' : 'Nos pagó'} · ${d.de_quien || 'Ambos'} · el ${dayShort(pg.fecha)}${pg.fuente ? ` · con ${pg.fuente.toLowerCase() === 'préstamo' ? 'el préstamo' : pg.fuente}` : ''} · `,
              h('button', { type: 'button', class: 'link-btn', onclick: () => { sync.mutate('pagos_deudas', { kind: 'delete', id: d.id }, `deshace: ${d.persona} · ${d.concepto}`); toast('Vuelve a pendientes.'); } }, 'Deshacer'))),
          h('div', { class: 'amt' }, d.moneda === 'USD' ? usd(d.monto) : crc(d.monto), h('span', { class: 'muted' }, d.moneda === 'USD' ? crc(d.crc) : usd(d.usd))));
      })) : empty('Todavía no hay nada pagado.')),
  ];
}

// Fecha con tres listas (el calendario del sistema se porta raro en la Mac).
function fecha3() {
  const [y, m, d] = (fstate.fecha || '--').split('-');
  const pad = (n) => String(n).padStart(2, '0');
  const parts = { y, m, d };
  const set = () => { fstate.fecha = parts.y && parts.m && parts.d ? `${parts.y}-${parts.m}-${parts.d}` : ''; };
  const mk = (k, label, opts) => {
    const s = h('select', { class: 'input', 'aria-label': label, onchange: (e) => { parts[k] = e.target.value; set(); } },
      h('option', { value: '' }, label), opts.map(([v, t]) => h('option', { value: v, selected: v === parts[k] || null }, t)));
    return s;
  };
  const yr = new Date().getFullYear();
  return h('div', { class: 'date3' },
    mk('d', 'Día', Array.from({ length: 31 }, (_, i) => [pad(i + 1), String(i + 1)])),
    mk('m', 'Mes', MESES.map((n, i) => [pad(i + 1), n])),
    mk('y', 'Año', [yr, yr + 1, yr + 2].map((v) => [String(v), String(v)])));
}

// Agregar una deuda desde la app.
const fstate = { persona: '', dir: 'debemos', quien: 'Ambos', concepto: '', monto: '', moneda: 'CRC', fecha: '' };
function formDeuda(ctx, B) {
  const { sync, rerender, toast } = ctx;
  const personas = [...new Set(B.deudas.map((d) => d.persona))];
  const inp = (id, key, attrs = {}) => {
    const el = h('input', { class: 'input', id, autocomplete: 'off', ...attrs, oninput: (e) => { fstate[key] = e.target.value; } });
    el.value = fstate[key];
    return el;
  };
  const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(fstate[key] === v), onclick: () => { fstate[key] = v; rerender(); } }, t)));
  const err = h('p', { class: 'error-msg', hidden: true });
  const guardar = async () => {
    const monto = Number(String(fstate.monto).replace(/[^\d.]/g, ''));
    if (!fstate.persona.trim() || !fstate.concepto.trim() || !monto) { err.textContent = 'Falta la persona, el concepto o el monto.'; err.hidden = false; return; }
    const id = `D${Date.now().toString(36).toUpperCase()}`;
    await sync.mutate('deudas', { kind: 'upsert', record: { id, persona: nombrePropio(fstate.persona), direccion: fstate.dir, de_quien: fstate.quien, concepto: fstate.concepto.trim(), monto, moneda: fstate.moneda, fecha_limite: fstate.fecha || '', estado: 'pendiente', nota: `Agregada desde la app por ${sync.config.persona}` } }, `nueva deuda: ${fstate.persona.trim()} · ${fstate.concepto.trim()}`);
    Object.assign(fstate, { persona: '', concepto: '', monto: '', fecha: '' });
    dstate.form = false;
    toast('Deuda agregada.');
    rerender();
  };
  return h('div', { class: 'deuda-form' },
    h('div', { class: 'field' }, h('label', {}, '¿Quién?'), seg('dir', [['debemos', 'Debemos'], ['nos deben', 'Nos deben']])),
    h('div', { class: 'field' }, h('label', { for: 'df-persona' }, fstate.dir === 'debemos' ? 'A quién le debemos' : 'Quién nos debe'), inp('df-persona', 'persona', { list: 'df-personas', placeholder: 'Nombre' }),
      h('datalist', { id: 'df-personas' }, personas.map((p) => h('option', { value: p })))),
    h('div', { class: 'field' }, h('label', { for: 'df-concepto' }, 'Concepto'), inp('df-concepto', 'concepto', { placeholder: 'Por qué' })),
    h('div', { class: 'field' }, h('label', { for: 'df-monto' }, 'Monto'),
      h('div', { class: 'df-monto' }, inp('df-monto', 'monto', { inputmode: 'decimal', placeholder: '0' }), seg('moneda', [['CRC', '₡'], ['USD', '$']]))),
    h('div', { class: 'field' }, h('label', {}, 'De quién es'), seg('quien', [['Jose', 'Jose'], ['Ali', 'Ali'], ['Ambos', 'Ambos']])),
    h('div', { class: 'field' }, h('label', {}, 'Pagar antes del (opcional)'), fecha3()),
    err,
    h('button', { type: 'button', class: 'btn block', onclick: guardar }, 'Guardar deuda'));
}
