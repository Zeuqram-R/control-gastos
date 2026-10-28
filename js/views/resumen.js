// Página Resumen: quincena actual, gasto por tipo, el mes, perecederos, gastos, súper, IVA y compras.
import { h, privacy, addDays, crc, usd, pct, todayCR, dayShort, daysBetween, MESES, stat, tile, bars, thumb, empty, marcar, campoBuscar } from '../ui.js';
import * as C from '../calc.js';
import { preguntasAbiertas } from './facturas.js';
import { conFuente } from '../fuente.js';
import { abrirGasto } from '../gasto.js';
import { abrirAlcanza } from '../alcanza.js';
import { abrirPresupuestos } from '../sugerencias.js';

const state = { movBuscar: '', buscar: '', todoVenc: false, todoCompras: false, movModo: 'mes', movOff: 0, qOff: 0 };
const more = (n, key, rerender) => h('button', { type: 'button', class: 'more', onclick: () => { state[key] = true; rerender(); } }, `Ver ${n} más`);

let openCat = null;
export function viewResumen(ctx) {
  const { sync } = ctx;
  openCat = ctx.openCategoria;
  const D = Object.fromEntries(['gastos', 'cuentas', 'compras', 'productos', 'eventos', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas', 'abonos', 'metas']
    .map((k) => [k, sync.data(k)]));
  const hoy = todayCR();
  const B = C.balanceQuincena(D, hoy);
  const cat = C.catalogo(D.compras, D.productos);

  return [
    h('nav', { class: 'chips', 'aria-label': 'Ir a' },
      [['q', 'Quincena'], ['cuentas', 'Cuentas'], ['metas', 'Metas'], ['tipos', 'Por tipo'], ['mes', 'El mes'], ['venc', 'Perecederos'], ['gastos', 'Movimientos'], ['super', 'Súper'], ['iva', 'IVA'], ['compras', 'Compras']]
        .map(([id, t]) => h('button', { type: 'button', class: 'chip', onclick: () => document.getElementById(`r-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, t))),
    secFacturas(ctx),
    state.qOff > 0 ? secProyeccion(ctx, D, hoy) : secQuincena(ctx, D, B, hoy),
    secCuentas(ctx, D, B, hoy),
    secMetas(ctx, D, hoy),
    secNegocio(ctx, hoy),
    secTipos(ctx, D, B, hoy),
    secMes(D),
    secVencimientos(ctx, cat, D.eventos, hoy),
    secGastos(ctx, C.movimientos(D)),
    secSuper(D),
    secIva(D),
    secCompras(ctx, D),
  ];
}

// Flechas para moverse entre la quincena actual y las proyecciones de las siguientes.
function qNav(ctx, titulo) {
  const btn = (lbl, aria, delta, off) => h('button', { type: 'button', class: 'icon-btn', 'aria-label': aria, disabled: off || null, onclick: () => { state.qOff += delta; ctx.rerender(); } }, lbl);
  return h('div', { class: 'per-nav q-nav' },
    btn('‹', 'Quincena anterior', -1, state.qOff <= 0),
    h('div', { class: 'per-t' }, h('b', {}, titulo), h('span', { class: 'sub' }, state.qOff === 0 ? 'Tocá › para ver las próximas' : `Proyección · ${state.qOff} quincena${state.qOff === 1 ? '' : 's'} adelante`)),
    btn('›', 'Quincena siguiente', 1, state.qOff >= 12));
}

const aguiTxt = (a) => `aguinaldo de ${a.persona} ${crc(a.neto)}${a.proporcional ? ` (proporcional desde el ${dayShort(a.desde)})` : ''}, a más tardar el 20 dic.`;

// ---- ¿De dónde sale? (líneas para la hoja de detalle) ----
const movLinea = (m) => ({ nombre: m.titulo, sub: [dayShort(m.fecha), m.sub, m.categoria, m.fuente].filter(Boolean).join(' · '), monto: m.monto });
const ingLineas = (ing, agui) => [
  ...ing.map((r) => ({ nombre: `Salario de ${r.persona}`, sub: `${crc(r.bruto)} bruto − ${crc(r.deduccion)} de CCSS (${r.deduccion_pct}%)`, monto: r.neto })),
  ...agui.map((a) => ({ nombre: `Aguinaldo de ${a.persona}`, sub: `Sin rebajos${a.proporcional ? ` · proporcional desde el ${dayShort(a.desde)}` : ''} · a más tardar el 20 dic.`, monto: a.neto })),
];
const fondoNota = (D, queda) => {
  const F = C.fondoAhorro(D);
  return F.total ? ` Aparte está el fondo de ahorro (${crc(F.total)}); con él serían ${queda + F.total < 0 ? '−' : ''}${crc(Math.abs(queda + F.total))}.` : '';
};

function secProyeccion(ctx, D, hoy) {
  const P = C.proyeccion(D, hoy, 12);
  const r = P.futuras[state.qOff - 1];
  const neg = r.queda < 0;
  const quedaTxt = privacy.hide ? crc(0) : `${neg ? '−' : ''}${crc(Math.abs(r.queda))}`;
  return h('section', { id: 'r-q', class: 'sec' },
    qNav(ctx, `${dayShort(r.q.inicio)} – ${dayShort(r.q.fin)}`),
    h('div', { class: 'card proy' },
      h('div', { class: 'qgrid' },
        conFuente(stat('Sobra de la anterior', `${r.arrastre < 0 && !privacy.hide ? '−' : ''}${crc(Math.abs(r.arrastre))}`, r.arrastre < 0 ? 'La anterior queda en negativo' : 'Lo que quedaría libre de la quincena anterior', r.arrastre < 0 ? 'var(--bad)' : null), () => ({
          titulo: 'Sobra de la anterior',
          nota: `Es lo que ${state.qOff === 1 ? 'queda libre en la quincena actual' : 'quedaría libre en la quincena anterior'} (${dayShort(r.arrastreDe.inicio)} – ${dayShort(r.arrastreDe.fin)}). Tocá ‹ para ver cómo se calcula.`,
          total: r.arrastre, totalLbl: 'Pasa a esta quincena' })),
        conFuente(stat(r.agui.length ? 'Salario + aguinaldo' : 'Salario', crc(r.neto), [r.ing.length ? `${r.ing.map((x) => x.persona).join(' + ')} · quincena ${r.q.numero === 1 ? 'del 12' : 'del 26'} (neto)` : 'Sin salario anotado', ...r.agui.map(aguiTxt)].join(' · ')), () => ({
          titulo: r.agui.length ? 'Salario + aguinaldo' : 'Salario',
          grupos: [{ titulo: 'Entra en esta quincena', signo: '+', total: r.neto, lineas: ingLineas(r.ing, r.agui), vacio: 'No hay salario anotado para esta quincena.' }], total: r.neto })),
        conFuente(stat('Por pagar', crc(r.porPagar), `${r.pagos.length} pago(s) con fecha${r.pagos.some((p) => p.tipo === 'tarjeta') ? ' · incluye la tarjeta Wink' : ''}`), () => ({
          titulo: 'Por pagar',
          grupos: [{ titulo: `Pagos del ${dayShort(r.q.inicio)} al ${dayShort(r.q.fin)}`, signo: '−', total: r.porPagar, lineas: r.pagos.map((i) => ({ nombre: i.nombre, sub: `${dayShort(i.fecha)} · ${i.quien || 'Ambos'}${({ deuda: ' · deuda', tarjeta: ' · tarjeta', meta: ' · meta de ahorro' })[i.tipo] || ' · recurrente'}`, monto: i.monto })), vacio: 'No hay pagos con fecha en esta quincena.' }],
          nota: 'Recurrentes que vencen en estas fechas, deudas con fecha límite aquí y lo usado con Wink la quincena anterior. Lo que sale de Bank of America no se cuenta aquí.', total: r.porPagar })),
        conFuente(stat('Día a día (estimado)', crc(r.estVar), `Súper, salidas, transporte… (${r.estBase})`), () => ({
          titulo: 'Día a día (estimado)',
          nota: r.estDetalle.length ? 'Promedio de los gastos variables (súper, salidas, transporte…) de las quincenas que ya cerraron.' : 'Todavía no hay quincenas cerradas, así que uso lo que va de gasto variable en la actual.',
          grupos: r.estDetalle.length ? [{ titulo: `Quincenas cerradas (${r.estDetalle.length})`, lineas: r.estDetalle.map((x) => ({ nombre: `${dayShort(x.inicio)} – ${dayShort(x.fin)}`, monto: x.monto })) }] : [],
          total: r.estVar, totalLbl: r.estDetalle.length > 1 ? 'Promedio' : 'Estimado' }))),
      conFuente(h('div', { class: `proy-total${neg ? ' bad' : ''}` }, h('span', { class: 'lbl' }, neg ? 'Faltaría' : 'Quedaría libre'), h('b', {}, quedaTxt)), () => ({
        titulo: neg ? 'Faltaría' : 'Quedaría libre',
        nota: 'Lo que sobra de la anterior, más lo que entra, menos los pagos con fecha y el gasto del día a día estimado.' + fondoNota(D, r.queda),
        grupos: [
          { titulo: 'Sobra de la anterior', signo: '+', total: r.arrastre },
          { titulo: r.agui.length ? 'Salario + aguinaldo' : 'Salario', signo: '+', total: r.neto, lineas: ingLineas(r.ing, r.agui) },
          { titulo: 'Por pagar', signo: '−', total: r.porPagar, lineas: r.pagos.map((i) => ({ nombre: i.nombre, sub: dayShort(i.fecha), monto: i.monto })) },
          { titulo: 'Día a día (estimado)', signo: '−', total: r.estVar },
        ], total: r.queda })),
      fondoLinea(D, r.queda),
      r.pagos.length ? h('details', { class: 'pp' },
        h('summary', {}, 'Ver lo que hay que pagar'),
        h('ul', { class: 'rows' }, r.pagos.map((i) => h('li', {},
          h('span', { class: `who who-${(i.quien || 'Ambos').toLowerCase()}` }),
          h('div', { class: 'main' }, i.nombre, h('span', { class: 'sub' }, `${dayShort(i.fecha)} · ${i.quien || 'Ambos'}${i.tipo === 'deuda' ? ' · deuda' : ''}`)),
          h('span', { class: 'amt' }, crc(i.monto)))))) : null,
      h('p', { class: 'note', style: { margin: '12px 0 0' } }, `Es una estimación: no incluye cobros sin fecha (como la luz)${P.sinFecha.n ? ` ni ${P.sinFecha.n} deuda(s) sin fecha por ${crc(P.sinFecha.total)}` : ''}. Si una deuda tiene fecha para pagarse (decímela y se la pongo) o usan la tarjeta Wink, se suma sola.`)));
}

function secQuincena(ctx, D, B, hoy) {
  const { q } = B;
  const otraCta = new Set((D.cuentas || []).map((c) => c.fuente).filter(Boolean));
  const dia = Math.min(daysBetween(q.inicio, hoy) + 1, q.dias);
  const entra = B.arrastre + B.neto + B.saldo;
  const deSalario = (m) => m.fuente !== 'Wink' && !otraCta.has(m.fuente);
  const ingSub = (B.arrastre ? `Sobra de la anterior ${B.arrastre < 0 ? '−' : ''}${crc(Math.abs(B.arrastre))} + ` : '') + `Salario de ${B.ing.map((r) => r.persona).join(' + ') || '—'} ${crc(B.neto - C.sum(B.agui, (a) => a.neto))} neto (${crc(B.bruto)} bruto − CCSS)${B.agui.length ? ` + ${B.agui.map(aguiTxt).join(' + ')}` : ''}`
    + (B.saldo ? ` + saldo ${B.saldos.map((s) => (s.moneda === 'USD' ? `${usd(s.monto)} ≈ ${crc(s.crc)}` : `${crc(s.monto)}${s.donde && s.donde !== 'Salario' ? ` (${s.donde.toLowerCase()})` : ''}`)).join(' + ')}` : '');
  const items = [
    ...B.porPagar.map((f) => ({ fecha: f.prox, nombre: f.atrasado ? `${f.nombre} (atrasado)` : f.nombre, monto: f.monto_crc, extra: f.moneda === 'USD' ? usd(f.monto) : '', quien: f.quien })),
    ...B.deudasQ.map((d) => ({ fecha: String(d.fecha_limite).slice(0, 10), nombre: `${d.concepto} (${d.persona})`, monto: d.crc, extra: d.moneda === 'USD' ? usd(d.monto) : '', quien: d.de_quien })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const gen = genCard(D, B, 'General', hoy, false);
  const gIng = { titulo: 'Ingreso + saldo a favor', signo: '+', total: entra, lineas: [
    B.arrastre ? { nombre: 'Sobra de la quincena anterior', sub: B.prevQ ? `Lo que quedó sin gastar hasta el ${dayShort(B.prevQ.fin)} (sin contar lo que estaba pendiente)` : '', monto: B.arrastre } : null,
    ...ingLineas(B.ing, B.agui),
    ...B.saldos.map((s) => ({ nombre: `Saldo a favor${s.donde ? ` (${s.donde.toLowerCase()})` : ''}`, sub: [s.moneda === 'USD' ? `${usd(s.monto)} al tipo de cambio` : null, s.nota].filter(Boolean).join(' · '), monto: s.crc })),
  ].filter(Boolean), vacio: 'No hay ingresos anotados para esta quincena.' };
  const gPagar = { titulo: `Por pagar hasta el ${dayShort(q.fin)}`, signo: '−', total: B.fijos + B.deu, lineas: items.map((i) => ({ nombre: i.nombre, sub: `${dayShort(i.fecha)}${i.extra ? ` · ${i.extra}` : ''} · ${i.quien || 'Ambos'}`, monto: i.monto })), vacio: 'Nada pendiente.' };
  const gGastado = { titulo: 'Gastado del salario', signo: '−', total: B.gastado - B.wink - B.otraCuenta, lineas: B.movs.filter(deSalario).map(movLinea), vacio: 'Nada todavía.' };
  return h('section', { id: 'r-q', class: 'sec' },
    qNav(ctx, `Quincena actual · ${dayShort(q.inicio)} – ${dayShort(q.fin)}`),
    h('div', { class: 'sec-head' },
      h('p', { class: 'note' }, `Día ${dia} de ${q.dias}. Las quincenas empiezan el 12 y el 26, cuando le pagan a Ali. Salario = cuentas; Wink = tarjeta de crédito.`
        + (B.tc ? ` Dólar: ${crc2(B.tc.venta)} venta · ${crc2(B.tc.compra)} compra (${dayShort(B.tc.fecha)}).` : ''))),
    h('div', { class: 'card' },
      h('div', { class: 'qgrid' },
        conFuente(stat('Ingreso + saldo a favor', crc(entra), ingSub), () => ({ titulo: 'Ingreso + saldo a favor', grupos: [gIng], total: entra })),
        conFuente(stat('Por pagar', crc(B.fijos + B.deu), `${items.length} pago(s) hasta el ${dayShort(q.fin)}${B.sinFecha ? ` · ${B.sinFecha} sin fecha todavía` : ''}`), () => ({
          titulo: 'Por pagar', grupos: [gPagar],
          nota: `Recurrentes que vencen hasta el ${dayShort(q.fin)} y todavía no están tachados, más deudas con fecha límite hasta ese día. Lo que sale de Bank of America va aparte, en Cuentas.${B.sinFecha ? ` Hay ${B.sinFecha} recurrente(s) sin fecha que no se cuentan.` : ''}`, total: B.fijos + B.deu })),
        conFuente(stat('Ya gastado', crc(B.gastado), (B.tachado ? `Incluye ${crc(B.tachado)} de pagos tachados · ` : '') + (B.wink || B.otraCuenta ? [`Salario ${crc(B.gastado - B.wink - B.otraCuenta)}`, B.wink ? `Wink ${crc(B.wink)}` : null, B.otraCuenta ? `otras cuentas ${crc(B.otraCuenta)}` : null].filter(Boolean).join(' · ') + ' (solo el salario sale de la quincena)' : 'Todo de salario')), () => ({
          titulo: 'Ya gastado', nota: 'Gastos, pagos tachados y abonos desde el ' + dayShort(q.inicio) + '. Lo de Wink se muestra aparte porque se paga la quincena siguiente.',
          grupos: [gGastado, B.wink ? { titulo: 'Con Wink (no sale de esta quincena)', total: B.wink, lineas: B.movs.filter((m) => m.fuente === 'Wink').map(movLinea) } : null,
            B.otraCuenta ? { titulo: 'De otras cuentas (BofA…)', total: B.otraCuenta, lineas: B.movs.filter((m) => m.fuente !== 'Wink' && otraCta.has(m.fuente)).map(movLinea) } : null], total: B.gastado })),
        conFuente(privacy.hide ? stat('Queda libre', crc(0), 'Tocá el ojo de arriba para verlo') : stat('Queda libre', `${B.queda < 0 ? '−' : ''}${crc(Math.abs(B.queda))}`, B.queda < 0 ? `Falta para cubrir lo que hay que pagar hasta el ${dayShort(q.fin)}` : `Libre para el resto de la quincena${B.apartado ? ` (ya sin los ${crc(B.apartado)} apartados)` : ''}`, B.queda < 0 ? 'var(--bad)' : 'var(--ok)'), () => ({
          titulo: 'Queda libre', nota: 'Lo que sobró de la anterior y lo que entra, menos lo que falta pagar, menos lo ya gastado del salario.' + fondoNota(D, B.queda),
          grupos: [gIng, gPagar, gGastado, B.apartado ? { titulo: 'Apartado para metas', signo: '−', total: B.apartado, lineas: B.aportes.map((a) => ({ nombre: a.meta, sub: `${dayShort(a.fecha)} · ${a.por || ''}`, monto: Number(a.monto) })) } : null], total: B.queda }))),
      h('div', { class: 'q-foot' },
        h('p', { class: 'fx-hint' }, 'Tocá un número para ver de dónde sale.'),
        h('button', { type: 'button', class: 'btn secondary sm', onclick: () => abrirAlcanza(ctx) }, '¿Me alcanza?')),
      fondoLinea(D, B.queda),
      items.length ? h('details', { class: 'pp' },
        h('summary', {}, 'Ver lo que hay que pagar'),
        h('ul', { class: 'rows' }, items.map((i) => h('li', {},
          h('span', { class: `who who-${(i.quien || 'Ambos').toLowerCase()}` }),
          h('div', { class: 'main' }, i.nombre, h('span', { class: 'sub' }, `${dayShort(i.fecha)}${i.extra ? ` · ${i.extra}` : ''} · ${i.quien || 'Ambos'}`)),
          h('span', { class: 'amt' }, crc(i.monto)))))) : null),
    gen);
}

function fondoLinea(D, queda) {
  const F = C.fondoAhorro(D);
  if (!F.total) return null;
  const con = queda + F.total;
  return h('p', { class: 'fondo-l' }, h('span', {}, `Con el fondo de ahorro (${crc(F.total)})`), h('b', { style: { color: con < 0 ? 'var(--bad)' : null } }, `${con < 0 && !privacy.hide ? '−' : ''}${crc(Math.abs(con))}`));
}

const crc2 = (v) => '₡' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function genCard(D, B, catName, hoy, compact) {
  const { q } = B;
  const gs = C.movimientos(D).filter((g) => (catName === 'General' || g.categoria === catName));
  const qs = C.quincenas(gs, D.presupuestos).filter((r) => r.categoria === catName);
  const cur = qs.find((r) => r.inicio === q.inicio) || { gastado: 0, salario: 0, wink: 0, n: 0 };
  const presu = C.presupuestoVigente(D.presupuestos, catName, q.inicio);
  const pasadas = qs.filter((r) => r.inicio < q.inicio);
  const prom = pasadas.length ? C.sum(pasadas, (r) => r.gastado) / pasadas.length : null;
  const trans = Math.min(daysBetween(q.inicio, hoy) + 1, q.dias), quedan = q.dias - trans;
  const ritmo = cur.gastado / trans, proy = ritmo * q.dias;
  const fuente = cur.wink ? `Salario ${crc(cur.salario)} · Wink ${crc(cur.wink)}` : cur.gastado ? 'Todo de salario' : 'Sin gastos todavía';
  const ref = presu || prom || proy || 1;
  const over = presu && cur.gastado > presu;
  return h('div', { class: 'card qcard tap-card', role: 'button', 'aria-label': `Ver los gastos de ${catName === 'General' ? 'la quincena' : catName}`, onclick: () => openCat && openCat(catName) },
    compact ? h('h3', {}, h('span', {}, catName, h('span', { class: 'chev' }, ' ›')), C.CAT_SUB[catName] ? h('span', { class: 'muted' }, C.CAT_SUB[catName]) : null)
      : h('h3', {}, h('span', {}, 'Gasto de la quincena', h('span', { class: 'chev' }, ' ›'))),
    h('div', { class: 'qgrid' + (compact ? ' two' : '') },
      stat('Gastado', crc(cur.gastado), `${cur.n} movimiento(s) · ${fuente}`),
      stat('Presupuesto', presu ? crc(presu) : 'Sin definir', presu ? (presu - cur.gastado >= 0 ? `Quedan ${crc(presu - cur.gastado)}` : `Pasado por ${crc(cur.gastado - presu)}`) : (prom ? `Promedio: ${crc(prom)}` : 'Con 2 quincenas te sugiero uno')),
      stat('Ritmo por día', crc(ritmo), presu && quedan > 0 ? `Para no pasarse: ${crc(Math.max(presu - cur.gastado, 0) / quedan)}/día` : `${quedan} día(s) restantes`),
      stat('Al cierre, a este ritmo', crc(proy), compact ? 'Estimado' : 'Estimado. Al inicio de quincena sale alto porque los gastos grandes van primero.', presu ? (proy > presu ? 'var(--bad)' : 'var(--ok)') : null)),
    h('div', { class: 'qbar' },
      h('div', { class: 'qbar-days', style: { width: `${(trans / q.dias) * 100}%` } }),
      cur.gastado ? h('div', { class: 'qbar-money', style: { width: `calc(${Math.min((cur.gastado / ref) * 100, 100)}% - 6px)`, background: over ? 'var(--bad)' : 'var(--accent)' } }) : null),
    compact ? null : h('div', { class: 'qbar-legend' }, `Barra: gastado vs. ${presu ? 'presupuesto' : prom ? 'promedio de quincenas pasadas' : 'proyección'} · línea punteada: días que van de la quincena`),
    h('div', { class: 'qhist' },
      h('div', { class: 'qhist-t' }, 'Quincenas anteriores'),
      pasadas.length ? bars(pasadas.slice(-6).reverse().map((r) => ({ label: `${dayShort(r.inicio)} – ${dayShort(r.fin)}`, total: r.gastado })))
        : empty(`Todavía no hay quincenas cerradas. Esta cierra el ${dayShort(q.fin)}.`)));
}

function secTipos(ctx, D, B, hoy) {
  const { q } = B;
  const movs = C.movimientos(D);
  const extras = [...new Set(movs.map((g) => g.categoria))].filter((c) => c && !C.CATS.includes(c));
  const todas = [...C.CATS, ...extras];
  const conAlgo = todas.filter((c) => movs.some((g) => g.categoria === c && g.fecha >= q.inicio && g.fecha <= q.fin) || C.presupuestoVigente(D.presupuestos, c, q.inicio));
  const resto = todas.filter((c) => !conAlgo.includes(c));
  return h('section', { id: 'r-tipos', class: 'sec' },
    h('div', { class: 'sec-head card-head' }, h('h2', {}, 'Por tipo de gasto'), h('button', { type: 'button', class: 'btn secondary sm', onclick: () => abrirPresupuestos(ctx, D) }, 'Presupuestos')),
    conAlgo.length ? h('div', { class: 'qcats' }, conAlgo.map((c) => genCard(D, B, c, hoy, true))) : null,
    resto.length ? h('p', { class: 'note' }, `Sin gastos esta quincena: ${resto.join(', ')}.`) : null);
}

function secMes(D) {
  const movs = C.movimientos(D);
  const r = C.resumenMes(movs);
  const nomMes = (k) => MESES[Number(k.slice(5, 7)) - 1];
  const label = r.mes ? `${nomMes(r.mes)} ${r.mes.slice(0, 4)}` : 'el mes';
  const delMes = movs.filter((m) => m.fecha.slice(0, 7) === r.mes);
  const TIPOS = [['Fijo', 'Fijo'], ['Variable', 'Variable'], ['Una vez', 'De una vez'], ['Deudas', 'Deudas pagadas'], ['Pendiente', 'Sin clasificar']];
  const grupoTipo = (t, nombre) => { const l = delMes.filter((m) => (m.gtipo || m.tipo) === t); return { titulo: nombre, total: C.sum(l, (m) => m.monto), lineas: l.map(movLinea), vacio: 'Nada este mes.' }; };
  // Mes anterior, para comparar.
  const ant = r.mes ? (() => { let [y, m] = r.mes.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; })() : null;
  const R0 = ant ? C.resumenMes(movs.filter((m) => m.fecha.slice(0, 7) <= ant)) : null;
  const hayAnt = R0 && R0.mes === ant;
  const vs = (k) => {
    if (!hayAnt) return null;
    const d = r[k] - R0[k];
    if (!d) return `Igual que ${nomMes(ant)}`;
    return h('span', { class: d > 0 ? 'up' : 'down' }, `${d > 0 ? '▲' : '▼'} ${crc(Math.abs(d))} vs ${nomMes(ant)}`);
  };
  const enCurso = r.mes === todayCR().slice(0, 7);
  return h('section', { id: 'r-mes', class: 'sec' },
    h('div', { class: 'sec-head' }, h('h2', {}, `Mes de ${label}${enCurso ? ' (en curso)' : ''}`), h('p', { class: 'note' }, `${r.n} movimiento(s)${r.n_pend ? ` · ${r.n_pend} sin clasificar` : ''}.`)),
    h('div', { class: 'tiles' },
      conFuente(tile('Total del mes', crc(r.total), vs('total')), () => ({ titulo: `Total de ${label}`, grupos: TIPOS.map(([t, n]) => grupoTipo(t, n)).filter((g) => g.lineas.length), total: r.total })),
      conFuente(tile('Fijo', crc(r.fijo), vs('fijo') || 'Suscripciones, servicios'), () => ({ titulo: `Fijo · ${label}`, grupos: [grupoTipo('Fijo', 'Fijo')], total: r.fijo })),
      conFuente(tile('Variable', crc(r.variable), vs('variable') || 'Mercado y similares'), () => ({ titulo: `Variable · ${label}`, grupos: [grupoTipo('Variable', 'Variable')], total: r.variable })),
      conFuente(tile('De una vez', crc(r.una_vez), vs('una_vez')), () => ({ titulo: `De una vez · ${label}`, grupos: [grupoTipo('Una vez', 'De una vez')], total: r.una_vez })),
      r.deudas ? conFuente(tile('Deudas pagadas', crc(r.deudas), vs('deudas') || 'Pagos y abonos a deudas'), () => ({ titulo: `Deudas pagadas · ${label}`, grupos: [grupoTipo('Deudas', 'Deudas pagadas')], total: r.deudas })) : null,
      r.pendiente ? conFuente(tile('Sin clasificar', crc(r.pendiente)), () => ({ titulo: `Sin clasificar · ${label}`, grupos: [grupoTipo('Pendiente', 'Sin clasificar')], total: r.pendiente })) : null),
    comparativo(movs, nomMes));
}

// Gráfico comparativo por mes: total de cada mes y cada categoría mes a mes. Crece solo con más datos.
function comparativo(movs, nomMes) {
  const M = C.porMes(movs, 6);
  if (!M.meses.length) return null;
  const n = M.meses.length;
  const hoyMes = todayCR().slice(0, 7);
  // Tonos del más viejo (claro) al más nuevo (fuerte).
  const tono = (i) => `color-mix(in srgb, var(--accent) ${n === 1 ? 100 : Math.round(30 + (70 * i) / (n - 1))}%, var(--line))`;
  const max = Math.max(1, ...M.cats.flatMap((c) => c.valores));
  const maxT = Math.max(1, ...M.totales);
  const etiqueta = (k) => `${nomMes(k).slice(0, 3)}${k.slice(0, 4) !== hoyMes.slice(0, 4) ? ` ${k.slice(2, 4)}` : ''}`;
  return h('div', { class: 'card cmp' },
    h('h3', {}, 'Mes a mes'),
    n < 2 ? h('p', { class: 'note' }, `Por ahora solo hay datos de ${nomMes(M.meses[0])}. Desde el próximo mes este gráfico compara cada categoría contra los meses anteriores (hasta 6).`) : null,
    n >= 2 ? h('div', { class: 'cmp-cols' }, M.meses.map((k, i) => h('div', { class: 'cmp-col' },
      h('span', { class: 'cmp-v' }, crc(M.totales[i])),
      h('div', { class: 'cmp-bar', style: { height: `${Math.max(3, (M.totales[i] / maxT) * 100)}%`, background: tono(i) } }),
      h('span', { class: 'cmp-k' }, etiqueta(k) + (k === hoyMes ? '*' : ''))))) : null,
    n >= 2 ? h('div', { class: 'legend' }, M.meses.map((k, i) => h('span', {}, h('i', { style: { background: tono(i) } }), etiqueta(k)))) : null,
    h('div', { class: 'cmp-cats' }, M.cats.map((c) => h('div', { class: 'cmp-cat' },
      h('div', { class: 'cmp-cat-h' }, h('span', {}, c.categoria), h('b', {}, crc(c.valores[n - 1])),
        n >= 2 ? (() => { const d = c.valores[n - 1] - c.valores[n - 2]; return d ? h('span', { class: `cmp-d ${d > 0 ? 'up' : 'down'}` }, `${d > 0 ? '▲' : '▼'} ${crc(Math.abs(d))}`) : null; })() : null),
      c.valores.map((v, i) => h('div', { class: 'cmp-row', title: `${etiqueta(M.meses[i])}: ${crc(v)}` },
        h('div', { class: 'cmp-fill', style: { width: `${(v / max) * 100}%`, background: tono(i) } })))))),
    M.meses.includes(hoyMes) && n >= 2 ? h('p', { class: 'note', style: { margin: '10px 0 0' } }, '* Mes en curso: todavía no está completo.') : null);
}

function secVencimientos(ctx, cat, eventos, hoy) {
  const { sync } = ctx;
  const all = C.vencimientos(cat, eventos);
  const v = state.todoVenc ? all : all.slice(0, 6);
  return h('section', { id: 'r-venc', class: 'card sec' },
    h('h2', {}, 'Perecederos en casa'),
    h('p', { class: 'note' }, 'Vencimiento estimado desde la última compra. Avisame si algo se terminó, lo congelaron, lo cocinaron o lo botaron.'),
    v.length ? h('ul', { class: 'rows' }, v.map((r) => {
      const dias = daysBetween(hoy, r.vence);
      const when = dias < 0 ? `Venció hace ${-dias} día${dias === -1 ? '' : 's'}` : dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`;
      return h('li', { class: 'tap', onclick: () => ctx.openProduct(r.clave) },
        thumb(sync, r.clave, { open: true, title: r.producto }),
        h('div', { class: 'main' }, r.producto, h('span', { class: 'sub' }, `${r.sobras ? `Sobras cocinadas el ${dayShort(r.desde)}` : `Comprado ${dayShort(r.ultima)}`} · dura ~${r.dias} días${r.ubicacion ? ` · ${r.ubicacion}` : ''}`)),
        h('span', { class: 'when', style: { color: dias <= 0 ? 'var(--bad)' : dias <= 2 ? 'var(--warn)' : 'var(--muted)' } }, when));
    })) : empty('No hay perecederos pendientes.'),
    all.length > v.length ? more(all.length - v.length, 'todoVenc', ctx.rerender) : null);
}

// Movimientos por mes o por semana, con flechas para ir a periodos anteriores (hasta el primero).
function secGastos(ctx, movs) {
  const TIPO = { rec: 'Recurrente', deuda: 'Deuda', abono: 'Abono' };
  const hoy = todayCR();
  const semanaDe = (f) => { const d = new Date(`${f}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); };
  const mesDe = (f) => f.slice(0, 7);
  const keyOf = state.movModo === 'mes' ? mesDe : semanaDe;
  // Todos los periodos desde el primer movimiento hasta hoy (aunque alguno no tenga movimientos).
  const primero = movs.length ? movs[movs.length - 1].fecha : hoy;
  const periodos = [];
  if (state.movModo === 'mes') {
    let [y, m] = primero.slice(0, 7).split('-').map(Number);
    const [hy, hm] = hoy.slice(0, 7).split('-').map(Number);
    while (y < hy || (y === hy && m <= hm)) { periodos.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  } else {
    for (let w = semanaDe(primero); w <= semanaDe(hoy); w = addDays(w, 7)) periodos.push(w);
  }
  state.movOff = Math.max(0, Math.min(state.movOff, periodos.length - 1));
  const actual = periodos[periodos.length - 1 - state.movOff];
  const lista = movs.filter((g) => keyOf(g.fecha) === actual);
  const titulo = state.movModo === 'mes'
    ? `${MESES[Number(actual.slice(5, 7)) - 1].charAt(0).toUpperCase()}${MESES[Number(actual.slice(5, 7)) - 1].slice(1)} ${actual.slice(0, 4)}`
    : `${dayShort(actual)} – ${dayShort(addDays(actual, 6))}`;
  const nav = (lbl, aria, delta, disabled) => h('button', { type: 'button', class: 'icon-btn', 'aria-label': aria, disabled: disabled || null, onclick: () => { state.movOff += delta; ctx.rerender(); } }, lbl);
  const modo = (k, t) => h('button', { type: 'button', 'aria-pressed': String(state.movModo === k), onclick: () => { if (state.movModo !== k) { state.movModo = k; state.movOff = 0; ctx.rerender(); } } }, t);
  const filaMov = (g, q = '') => h('li', {},
    h('div', { class: 'main' }, marcar(g.titulo, q),
      h('span', { class: 'sub' }, marcar([dayShort(g.fecha), g.sub, g.categoria, g.fuente].filter(Boolean).join(' · '), q)),
      g.tipo === 'gasto' ? (g.gtipo ? h('span', { class: `pill ${g.gtipo === 'Pendiente' ? 'pend' : g.gtipo === 'Fijo' ? 'rec' : ''}` }, marcar(g.gtipo, q)) : null) : h('span', { class: `pill ${g.tipo === 'rec' ? 'rec' : 'pend'}` }, marcar(TIPO[g.tipo], q))),
    h('span', { class: 'amt' }, crc(g.monto)));
  const cuerpo = h('div', {});
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const fill = () => {
    const q = norm(state.movBuscar.trim());
    if (q) {
      // El mes solo cuenta si se escribe su nombre (o el inicio, desde 3 letras): así "ub" no trae todo octubre.
      const res = movs.filter((g) => norm([g.titulo, g.sub, g.categoria, g.fuente, g.gtipo, dayShort(g.fecha)].join(' ')).includes(q)
        || (q.length >= 3 && norm(MESES[Number(g.fecha.slice(5, 7)) - 1]).startsWith(q)));
      cuerpo.replaceChildren(
        h('div', { class: 'per-nav' }, h('div', { class: 'per-t' }, h('b', {}, `${res.length} resultado(s)`), h('span', { class: 'sub' }, `${crc(C.sum(res, (g) => g.monto))} en total · todos los meses`))),
        res.length ? h('ul', { class: 'rows' }, res.map((g) => filaMov(g, state.movBuscar))) : empty('Nada coincide con la búsqueda.'));
    } else {
      cuerpo.replaceChildren(
        h('div', { class: 'per-nav' },
          nav('‹', state.movModo === 'mes' ? 'Mes anterior' : 'Semana anterior', 1, state.movOff >= periodos.length - 1),
          h('div', { class: 'per-t' }, h('b', {}, titulo), h('span', { class: 'sub' }, `${lista.length} movimiento(s) · ${crc(C.sum(lista, (g) => g.monto))}`)),
          nav('›', state.movModo === 'mes' ? 'Mes siguiente' : 'Semana siguiente', -1, state.movOff <= 0)),
        lista.length ? h('ul', { class: 'rows' }, lista.map((g) => filaMov(g))) : empty(state.movModo === 'mes' ? 'No hay movimientos este mes.' : 'No hay movimientos esta semana.'));
    }
  };
  fill();
  const buscar = campoBuscar({ id: 'buscar-mov', placeholder: 'Buscar: Uber, súper, Wink, octubre…', value: state.movBuscar, onInput: (v) => { state.movBuscar = v; fill(); } });
  return h('section', { id: 'r-gastos', class: 'card sec' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Movimientos'), h('div', { class: 'head-r' }, h('button', { type: 'button', class: 'btn blue sm', onclick: () => abrirGasto(ctx) }, 'Gasto'), h('div', { class: 'seg mini' }, modo('mes', 'Mes'), modo('semana', 'Semana')))),
    h('div', { class: 'field', style: { margin: '10px 0 4px' } }, buscar),
    cuerpo);
}

function secSuper(D) {
  return h('section', { id: 'r-super', class: 'grid2 sec' },
    h('div', { class: 'card' },
      h('h2', {}, 'Súper por categoría'),
      h('p', { class: 'note' }, 'Todo lo comprado en supermercados, por tipo de producto.'),
      bars(C.porCategoria(D.compras).map((r) => ({ label: r.categoria, total: r.total })))),
    h('div', { class: 'card' },
      h('h2', {}, 'Súper por persona'),
      h('p', { class: 'note' }, 'Casa es lo compartido; Ali y Jose, lo que es de cada uno.'),
      bars(C.porDueno(D.compras, D.productos).map((r) => ({ label: r.dueno, total: r.total })), { color: 'var(--orange)' })));
}

function secIva(D) {
  const r = C.iva(D.compras, D.productos);
  const mes = r.mes ? MESES[Number(r.mes.slice(5, 7)) - 1] : 'el mes';
  return h('section', { id: 'r-iva', class: 'card sec' },
    h('h2', {}, `IVA pagado en ${mes}`),
    h('p', { class: 'note' }, 'La canasta básica paga 1% de IVA y todo lo demás 13%.'),
    h('div', { class: 'qgrid' },
      stat('IVA del mes', crc(r.iva), `de ${crc(r.total)} en compras de súper`),
      stat('Canasta básica (1%)', crc(r.iva_1), `sobre ${crc(r.total_1)} (${pct(1 - r.pct_13)} de lo comprado)`),
      stat('Resto (13%)', crc(r.iva_13), `sobre ${crc(r.total_13)} (${pct(r.pct_13)} de lo comprado)`),
      stat('Si todo fuera del 1%', crc(r.ahorro_si_1), 'Lo que se ahorrarían en impuesto')),
    h('div', { class: 'iva-split' },
      h('div', { style: { width: `${(1 - r.pct_13) * 100}%`, background: 'var(--green)' } }),
      h('div', { style: { width: `${r.pct_13 * 100}%`, background: 'var(--orange)' } })),
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: 'var(--green)' } }), '1% canasta básica'), h('span', {}, h('i', { style: { background: 'var(--orange)' } }), '13%')),
    h('details', { class: 'pp' },
      h('summary', {}, `Productos del 13% (${r.prods.length})`),
      h('ul', { class: 'rows' }, r.prods.map((p) => h('li', {},
        h('div', { class: 'main' }, p.producto, p.alternativa ? h('span', { class: 'sub alt' }, `Alternativa del 1%: ${p.alternativa}`) : null),
        h('span', { class: 'amt' }, crc(p.iva)))))));
}

function secCompras(ctx, D) {
  const { sync } = ctx;
  const info = new Map(D.productos.map((p) => [p.clave, p]));
  const rows = D.compras.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.id).localeCompare(String(b.id)));
  const list = h('ul', { class: 'rows' });
  const fill = () => {
    const q = state.buscar.trim().toLowerCase();
    const match = rows.filter((r) => !q || `${r.producto} ${r.categoria} ${r.supermercado}`.toLowerCase().includes(q));
    const vis = q || state.todoCompras ? match : match.slice(0, 12);
    list.replaceChildren(...vis.map((r) => {
      const ref = C.refPrecio(r, info.get(r.clave));
      const qty = r.unidad === 'kg' ? `${Number(r.cantidad).toFixed(3)} kg` : `${r.cantidad} ×`;
      return h('li', { class: 'tap', onclick: () => ctx.openProduct(r.clave) },
        thumb(sync, r.clave, { open: true, title: r.producto }),
        h('div', { class: 'main' }, r.producto, h('span', { class: 'sub' }, `${dayShort(r.fecha)} · ${r.supermercado} · ${qty} ${crc(r.precio_unitario)}${r.unidad === 'kg' ? '/kg' : ''} · ${crc(ref.v)}/${ref.u}`)),
        h('span', { class: 'amt' }, crc(r.total)));
    }));
    if (!vis.length) list.append(empty('Nada coincide con la búsqueda.'));
    if (match.length > vis.length) list.append(h('li', { class: 'more-li' }, h('button', { type: 'button', class: 'more', onclick: () => { state.todoCompras = true; fill(); } }, `Ver ${match.length - vis.length} más`)));
  };
  fill();
  const input = h('input', { class: 'input', id: 'buscar-compras', type: 'search', placeholder: 'Buscar artículo, categoría o súper…', oninput: (e) => { state.buscar = e.target.value; fill(); } });
  input.value = state.buscar;
  return h('section', { id: 'r-compras', class: 'card sec' },
    h('h2', {}, 'Detalle de compras'),
    h('p', { class: 'note' }, 'Cada artículo de cada factura, con su precio por kilo, litro o unidad.'),
    h('div', { class: 'field' }, input),
    list);
}

// ---------- Metas de ahorro (resumen; se manejan en la pestaña Metas) ----------
function secMetas(ctx, D, hoy) {
  const metas = C.metasInfo(D, hoy);
  const ir = () => ctx.go('metas');
  return h('section', { id: 'r-metas', class: 'sec' },
    h('div', { class: 'sec-head' }, h('h2', {}, 'Metas de ahorro')),
    h('div', { class: 'card tap-card', role: 'button', 'aria-label': 'Abrir Metas', onclick: ir },
      metas.length ? h('ul', { class: 'rows' }, metas.map((m) => h('li', {},
        h('div', { class: 'main' }, m.nombre,
          h('div', { class: 'meta-bar sm' }, h('div', { style: { width: `${m.pct * 100}%` } })),
          h('span', { class: 'sub' }, m.lista ? '¡Cumplida!' : m.vencida ? `Faltaron ${crc(m.falta)}` : `${crc(m.ahorrado)} de ${crc(m.meta)} · para el ${dayShort(m.fecha)}`)),
        m.lista || m.vencida ? null : h('div', { class: 'meta-q' }, h('span', { class: 'sub' }, 'Esta quincena'), h('b', {}, m.estaQ ? crc(m.estaQ) : '✓')))))
        : h('p', { class: 'note', style: { margin: 0 } }, 'Sin metas todavía. Tocá para crear una en Metas.'),
      h('div', { class: 'tap-more' }, 'Ver en Metas ›')));
}

// ---------- Santo Coco (resumen; se maneja en su página) ----------
function secNegocio(ctx, hoy) {
  const N = C.negocioInfo({ gastos: ctx.sync.data('gastos'), negocio: ctx.sync.data('negocio') }, hoy.slice(0, 7));
  return h('section', { id: 'r-negocio', class: 'card fac-quick tap-card sec', role: 'button', 'aria-label': 'Abrir Santo Coco', onclick: () => ctx.go('negocio') },
    h('div', { class: 'main' },
      h('b', {}, 'Santo Coco 🥥'),
      h('span', { class: 'sub' }, N.ventas.length || N.gastos.length ? `Este mes: ventas ${crc(N.ventasMes)} · gastos ${crc(N.gastosMes)} · ${N.ganancia < 0 ? 'pérdida' : 'ganancia'} ${crc(Math.abs(N.ganancia))}` : 'Ventas y gastos del negocio, aparte de la casa.')),
    h('span', { class: 'chev big' }, '›'));
}

// ---------- Cuentas (Bank of America y las que vengan) ----------
function secCuentas(ctx, D, B, hoy) {
  const { sync, toast, rerender } = ctx;
  const info = C.cuentasInfo(D, hoy, 35);
  if (!info.length) return null;
  const totalCRC = C.sum(info, (c) => c.crc);
  return h('section', { id: 'r-cuentas', class: 'sec' },
    h('div', { class: 'sec-head' }, h('h2', {}, 'Cuentas'),
      h('p', { class: 'note' }, `Plata en cuentas aparte del salario de la quincena. Con lo que queda libre de la quincena, en total tienen unos ${crc(B.queda + totalCRC)}.`)),
    info.map((c) => {
      const fmt = (v) => (c.moneda === 'USD' ? usd(v) : crc(v));
      const editId = `cta-${c.id}`;
      const input = h('input', { class: 'input', id: editId, inputmode: 'decimal', placeholder: c.moneda === 'USD' ? '0.00' : '0', autocomplete: 'off' });
      const guardar = async () => {
        const v = Number(String(input.value).replace(/[^\d.-]/g, ''));
        if (!input.value.trim() || Number.isNaN(v)) { input.focus(); return; }
        await sync.mutate('cuentas', { kind: 'patch', record: { id: c.id, saldo: v, fecha: hoy } }, `saldo de ${c.nombre}: ${c.moneda === 'USD' ? '$' : '₡'}${v}`);
        toast('Saldo actualizado.');
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
      const neg = c.proyectado < 0;
      return h('div', { class: 'card cuenta' },
        h('div', { class: 'cuenta-h' },
          h('div', {}, h('b', {}, c.nombre), h('span', { class: 'sub' }, `${c.dueno ? `De ${c.dueno} · ` : ''}actualizado el ${dayShort(c.fecha)}`)),
          h('div', { class: 'cuenta-saldo' }, h('div', { class: 'num', style: { color: c.saldo < 0 ? 'var(--bad)' : null } }, fmt(c.saldo)), c.moneda === 'USD' ? h('span', { class: 'sub' }, `≈ ${crc(c.crc)} (compra)`) : null)),
        c.cobros.length ? [
          h('div', { class: 'qhist-t' }, 'Lo que se cobra en los próximos 35 días'),
          h('ul', { class: 'rows' }, c.cobros.map((x) => h('li', { class: x.omitido ? 'off' : '' },
            h('div', { class: 'main' }, x.f.nombre, h('span', { class: 'sub' }, `${dayShort(x.fecha)}${x.omitido ? ` · no se cobra: la cuenta tendría ${fmt(x.f.condicion.menor_que)} o más` : ` · queda en ${fmt(x.despues)}`}`)),
            h('span', { class: 'amt', style: { color: !x.omitido && x.despues < 0 ? 'var(--bad)' : null } }, x.monto != null ? `−${fmt(x.monto)}` : '—')))),
          h('p', { class: `cuenta-proy${neg ? ' bad' : ''}` }, neg
            ? `Para cubrir todo hay que meter unos ${fmt(Math.ceil(-c.proyectado * 100) / 100)} antes del ${dayShort(c.cobros.find((x) => !x.omitido && x.despues < 0)?.fecha)}.`
            : `Después de esos cobros quedaría en ${fmt(c.proyectado)}.`),
        ] : h('p', { class: 'note' }, 'No hay cobros en los próximos 35 días.'),
        c.nota ? h('p', { class: 'note', style: { marginTop: '8px' } }, c.nota) : null,
        h('details', { class: 'pp' }, h('summary', {}, 'Actualizar saldo'),
          h('div', { class: 'row-add', style: { marginTop: '10px' } }, input, h('button', { class: 'btn', type: 'button', onclick: guardar }, 'Guardar')),
          h('p', { class: 'note', style: { margin: '6px 0 0' } }, 'Cuando marcás pagado en Recurrentes algo que sale de esta cuenta, se descuenta solo.')));
    }));
}

// ---------- Detalle de una categoría (lo que suma esa cajita) ----------
export function viewCategoria(ctx) {
  const { sync, cat, openProduct } = ctx;
  const D = Object.fromEntries(['gastos', 'cuentas', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas', 'abonos'].map((k) => [k, sync.data(k)]));
  const hoy = todayCR();
  const B = C.balanceQuincena(D, hoy);
  const { q } = B;
  const general = cat === 'General';
  const delCat = C.movimientos(D).filter((m) => general || m.categoria === cat);
  const items = delCat.filter((m) => m.fecha >= q.inicio && m.fecha <= q.fin)
    .map((m) => ({ ...m, sub: [m.sub, general ? m.categoria : null, m.fuente].filter(Boolean).join(' · ') }));
  const total = C.sum(items, (i) => i.monto);
  const pasadas = [...C.groupBy(delCat.filter((g) => g.fecha < q.inicio), (g) => C.quincenaDe(g.fecha).inicio)].sort((a, b) => b[0].localeCompare(a[0]));
  const TIPO = { gasto: null, rec: 'Recurrente', deuda: 'Deuda', abono: 'Abono' };
  const row = (i) => h('li', {},
    h('div', { class: 'main' }, i.titulo, h('span', { class: 'sub' }, `${dayShort(i.fecha)}${i.sub ? ` · ${i.sub}` : ''}`), TIPO[i.tipo] ? h('span', { class: `pill ${i.tipo === 'rec' ? 'rec' : 'pend'}` }, TIPO[i.tipo]) : null),
    h('span', { class: 'amt' }, crc(i.monto)));
  return [
    h('section', { class: 'card' },
      h('h2', {}, general ? 'Todo lo de la quincena' : cat),
      h('p', { class: 'note' }, `Quincena del ${dayShort(q.inicio)} al ${dayShort(q.fin)} · ${items.length} movimiento(s)${general ? ' (gastos, pagos recurrentes, deudas pagadas y abonos)' : ''}.`),
      h('div', { class: 'cat-total' }, h('span', {}, 'Total'), h('b', {}, crc(total))),
      items.length ? h('ul', { class: 'rows' }, items.map(row)) : empty('Nada en esta quincena.')),
    pasadas.length ? h('section', { class: 'card' },
      h('h2', {}, 'Quincenas anteriores'),
      pasadas.map(([ini, gs]) => h('details', { class: 'pp' },
        h('summary', {}, `${dayShort(ini)} – ${dayShort(C.quincenaDe(ini).fin)} · ${crc(C.sum(gs, (g) => g.monto))}`),
        h('ul', { class: 'rows' }, gs.map((g) => row({ ...g, sub: [g.sub, g.fuente].filter(Boolean).join(' · ') })))))) : null,
  ];
}

// Acceso rápido a subir facturas (y aviso si Claude dejó preguntas).
function secFacturas(ctx) {
  const pend = preguntasAbiertas(ctx.sync);
  const cola = ctx.sync.uploads.length;
  return h('section', { class: 'card fac-quick' + (pend.length ? ' alert' : '') },
    h('div', { class: 'main' },
      h('b', {}, pend.length ? `Claude tiene ${pend.length} pregunta${pend.length === 1 ? '' : 's'}` : 'Anotar'),
      h('span', { class: 'sub' }, pend.length ? 'Sobre las últimas facturas. Tocá para contestar.' : cola ? `${cola} esperando internet para subir` : 'Anotá un gasto o subí la foto de la factura.')),
    h('div', { class: 'fac-btns' },
      h('button', { type: 'button', class: 'btn blue', onclick: () => abrirGasto(ctx) }, 'Gasto'),
      h('button', { type: 'button', class: 'btn', onclick: () => ctx.go('facturas') }, pend.length ? 'Contestar' : 'Factura')));
}
