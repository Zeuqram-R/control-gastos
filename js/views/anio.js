// Página "Tu año": resumen del año completo (en qué se fue la plata, ahorro, metas, súper, Santo Coco…).
import { h, crc, dayShort, todayCR, addDays, MESES, stat, bars, empty } from '../ui.js';
import * as C from '../calc.js';

const ast = { anio: null };
const CLAVES = ['gastos', 'cuentas', 'compras', 'productos', 'eventos', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas', 'abonos', 'metas', 'negocio', 'deseos'];

// Lo que entró de salario (y aguinaldo) en las quincenas del año desde que llevan el control.
function ingresosAnio(D, anio, desde, hasta) {
  const netos = C.ingresosNetos(D.ingresos);
  let total = 0, n = 0;
  for (let q = C.quincenaDe(desde); q.inicio <= hasta; q = C.quincenaDe(addDays(q.fin, 1))) {
    if (q.inicio.slice(0, 4) === String(anio)) { total += C.sum(netos.filter((r) => r.quincena === q.numero), (r) => r.neto); n++; }
  }
  const agui = C.aguinaldoDe(D.ingresos, anio).filter((a) => a.fecha <= hasta);
  return { total: total + C.sum(agui, (a) => a.neto), salario: total, aguinaldo: C.sum(agui, (a) => a.neto), quincenas: n };
}

export function viewAnio(ctx) {
  const { sync } = ctx;
  const D = Object.fromEntries(CLAVES.map((k) => [k, sync.data(k) || []]));
  const hoy = todayCR();
  const movsTodos = C.movimientos(D);
  const anios = [...new Set(movsTodos.map((m) => Number(m.fecha.slice(0, 4))))].sort();
  if (!anios.length) return h('section', { class: 'card' }, empty('Todavía no hay movimientos.'));
  if (!ast.anio || !anios.includes(ast.anio)) ast.anio = anios[anios.length - 1];
  const Y = ast.anio, ys = String(Y);
  const movs = movsTodos.filter((m) => m.fecha.startsWith(ys));
  const total = C.sum(movs, (m) => m.monto);
  const primera = movs.map((m) => m.fecha).sort()[0];
  const hasta = ys === hoy.slice(0, 4) ? hoy : `${ys}-12-31`;
  const ing = ingresosAnio(D, Y, primera, hasta);
  // Por mes y por categoría.
  const porMes = MESES.map((m, i) => ({ label: m.slice(0, 3), total: C.sum(movs.filter((x) => Number(x.fecha.slice(5, 7)) === i + 1), (x) => x.monto) })).filter((r, i) => r.total || (i + 1 >= Number(primera.slice(5, 7)) && `${ys}-${String(i + 1).padStart(2, '0')}` <= hasta.slice(0, 7)));
  const porCat = [...C.groupBy(movs, (m) => m.categoria)].map(([c, l]) => ({ label: c, total: C.sum(l, (m) => m.monto) })).sort((a, b) => b.total - a.total);
  const mayor = movs.slice().sort((a, b) => b.monto - a.monto)[0];
  // Ahorro y metas.
  const aportes = (D.metas || []).flatMap((m) => (m.aportes || []).filter((a) => String(a.fecha).startsWith(ys)).map((a) => ({ ...a, meta: m.nombre })));
  const ahorrado = C.sum(aportes, (a) => Number(a.monto) || 0);
  const cumplidas = C.metasInfo(D, hoy).filter((m) => m.lista).concat((D.metas || []).filter((m) => m.estado === 'archivada' && C.sum(m.aportes || [], (a) => Number(a.monto) || 0) >= Number(m.monto)));
  const metaGrande = cumplidas.sort((a, b) => (Number(b.monto) || 0) - (Number(a.monto) || 0))[0];
  // Súper.
  const compras = (D.compras || []).filter((r) => String(r.fecha).startsWith(ys));
  const superTotal = C.sum(compras, (r) => Number(r.total) || 0);
  const veces = [...C.groupBy(compras, (r) => r.clave)].map(([k, l]) => ({ producto: l[l.length - 1].producto, n: new Set(l.map((r) => String(r.fecha).slice(0, 10))).size, cant: C.sum(l, (r) => Number(r.cantidad) || 0), total: C.sum(l, (r) => Number(r.total) || 0) }))
    .sort((a, b) => b.n - a.n || b.total - a.total);
  const lugares = [...C.groupBy(compras, (r) => r.supermercado)].map(([k, l]) => ({ label: k, total: C.sum(l, (r) => Number(r.total) || 0) })).sort((a, b) => b.total - a.total);
  const iva = C.sum(compras, (r) => { const t = Number(r.total) || 0, p = Number(r.iva_pct) || 0; return t - t / (1 + p / 100); });
  // Deudas, Uber, Santo Coco.
  const deudas = C.sum(movs.filter((m) => m.gtipo === 'Deudas'), (m) => m.monto);
  const ubers = movs.filter((m) => m.tipo === 'gasto' && /uber|didi|taxi/i.test(m.titulo));
  const N = C.negocioInfo(D, ys);
  const ventasAnio = C.sum(N.ventas.filter((v) => v.fecha.startsWith(ys)), (v) => v.monto);
  const gastosNeg = C.sum(N.gastos.filter((g) => g.fecha.startsWith(ys)), (g) => g.monto);
  const nav = (lbl, aria, delta, off) => h('button', { type: 'button', class: 'icon-btn', 'aria-label': aria, disabled: off || null, onclick: () => { ast.anio += delta; ctx.rerender(); } }, lbl);
  const dato = (emoji, titulo, valor, sub) => h('div', { class: 'card tile anio-dato' }, h('div', { class: 'anio-e' }, emoji), h('div', { class: 'lbl' }, titulo), h('div', { class: 'num' }, valor), sub ? h('div', { class: 'sub' }, sub) : null);

  return [
    h('section', { class: 'sec' },
      h('div', { class: 'per-nav q-nav' },
        nav('‹', 'Año anterior', -1, Y <= anios[0]),
        h('div', { class: 'per-t' }, h('b', { class: 'anio-t' }, `Tu ${Y}`), h('span', { class: 'sub' }, ys === hoy.slice(0, 4) ? `Desde el ${dayShort(primera)} hasta hoy` : `Desde el ${dayShort(primera)}`)),
        nav('›', 'Año siguiente', 1, Y >= anios[anios.length - 1]))),
    h('section', { class: 'card sec' },
      h('div', { class: 'qgrid' },
        stat('Se gastó', crc(total), `${movs.length} movimientos`),
        stat('Entró (salario)', crc(ing.total), `${ing.quincenas} quincena(s)${ing.aguinaldo ? ` + aguinaldo ${crc(ing.aguinaldo)}` : ''}`, 'var(--ok)'),
        stat('Apartado para metas', crc(ahorrado), `${aportes.length} aporte(s)${cumplidas.length ? ` · ${cumplidas.length} meta(s) cumplida(s)` : ''}`),
        stat('Deudas pagadas', crc(deudas), 'Pagos y abonos'))),
    h('section', { class: 'card sec' }, h('h2', {}, 'Mes a mes'), bars(porMes)),
    h('section', { class: 'card sec' }, h('h2', {}, 'En qué se fue la plata'), bars(porCat.slice(0, 8), { color: 'var(--blue)' }),
      porCat.length > 8 ? h('p', { class: 'note' }, `Y ${porCat.length - 8} categoría(s) más.`) : null),
    h('section', { class: 'tiles anio-datos' },
      mayor ? dato('💸', 'El gasto más grande', crc(mayor.monto), `${mayor.titulo} · ${dayShort(mayor.fecha)}`) : null,
      veces[0] ? dato('🛒', 'Lo que más compraron', veces[0].producto, `${veces[0].n} ${veces[0].n === 1 ? "vez" : "veces"} · ${crc(veces[0].total)}`) : null,
      lugares[0] ? dato('🏪', 'Donde más compraron', lugares[0].label, crc(lugares[0].total)) : null,
      superTotal ? dato('🧾', 'IVA pagado en el súper', crc(iva), `de ${crc(superTotal)} en compras`) : null,
      ubers.length ? dato('🚗', 'Viajes en Uber', String(ubers.length), crc(C.sum(ubers, (m) => m.monto))) : null,
      metaGrande ? dato('🏁', 'La meta más grande cumplida', metaGrande.nombre, crc(Number(metaGrande.monto) || 0)) : null,
      ventasAnio || gastosNeg ? dato('🥥', 'Santo Coco', crc(ventasAnio - gastosNeg), `Ventas ${crc(ventasAnio)} − gastos ${crc(gastosNeg)}`) : null),
    veces.length > 1 ? h('section', { class: 'card sec' }, h('h2', {}, 'Lo más comprado'),
      h('ul', { class: 'rows' }, veces.slice(0, 5).map((v, i) => h('li', {}, h('span', { class: 'rank' }, String(i + 1)), h('div', { class: 'main' }, v.producto, h('span', { class: 'sub' }, `${v.n} compra(s)`)), h('span', { class: 'amt' }, crc(v.total)))))) : null,
  ];
}
