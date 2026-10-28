// Página Resumen: quincena actual, gasto por tipo, el mes, perecederos, gastos, súper, IVA y compras.
import { h, privacy, crc, usd, pct, todayCR, dayShort, daysBetween, MESES, stat, tile, bars, thumb, empty } from '../ui.js';
import * as C from '../calc.js';
import { preguntasAbiertas } from './facturas.js';

const state = { buscar: '', todoVenc: false, todoCompras: false };
const more = (n, key, rerender) => h('button', { type: 'button', class: 'more', onclick: () => { state[key] = true; rerender(); } }, `Ver ${n} más`);

let openCat = null;
export function viewResumen(ctx) {
  const { sync } = ctx;
  openCat = ctx.openCategoria;
  const D = Object.fromEntries(['gastos', 'cuentas', 'compras', 'productos', 'eventos', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas']
    .map((k) => [k, sync.data(k)]));
  const hoy = todayCR();
  const B = C.balanceQuincena(D, hoy);
  const cat = C.catalogo(D.compras, D.productos);

  return [
    h('nav', { class: 'chips', 'aria-label': 'Ir a' },
      [['q', 'Quincena'], ['cuentas', 'Cuentas'], ['tipos', 'Por tipo'], ['mes', 'El mes'], ['venc', 'Perecederos'], ['gastos', 'Gastos'], ['super', 'Súper'], ['iva', 'IVA'], ['compras', 'Compras']]
        .map(([id, t]) => h('button', { type: 'button', class: 'chip', onclick: () => document.getElementById(`r-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, t))),
    secFacturas(ctx),
    secQuincena(D, B, hoy),
    secCuentas(ctx, D, B, hoy),
    secTipos(D, B, hoy),
    secMes(D),
    secVencimientos(ctx, cat, D.eventos, hoy),
    secGastos(D.gastos),
    secSuper(D),
    secIva(D),
    secCompras(ctx, D),
  ];
}

function secQuincena(D, B, hoy) {
  const { q } = B;
  const dia = Math.min(daysBetween(q.inicio, hoy) + 1, q.dias);
  const ingSub = `Salario de ${B.ing.map((r) => r.persona).join(' + ') || '—'} ${crc(B.neto)} neto (${crc(B.bruto)} bruto − CCSS)`
    + (B.saldo ? ` + saldo ${B.saldos.map((s) => (s.moneda === 'USD' ? `${usd(s.monto)} ≈ ${crc(s.crc)}` : `${crc(s.monto)}${s.donde && s.donde !== 'Salario' ? ` (${s.donde.toLowerCase()})` : ''}`)).join(' + ')}` : '');
  const items = [
    ...B.porPagar.map((f) => ({ fecha: f.prox, nombre: f.nombre, monto: f.monto_crc, extra: f.moneda === 'USD' ? usd(f.monto) : '', quien: f.quien })),
    ...B.deudasQ.map((d) => ({ fecha: String(d.fecha_limite).slice(0, 10), nombre: `${d.concepto} (${d.persona})`, monto: d.crc, extra: d.moneda === 'USD' ? usd(d.monto) : '', quien: d.de_quien })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const gen = genCard(D, B, 'General', hoy, false);
  return h('section', { id: 'r-q', class: 'sec' },
    h('div', { class: 'sec-head' },
      h('h2', {}, `Quincena actual · ${dayShort(q.inicio)} – ${dayShort(q.fin)}`),
      h('p', { class: 'note' }, `Día ${dia} de ${q.dias}. Las quincenas empiezan el 12 y el 26, cuando le pagan a Ali. Salario = cuentas; Wink = tarjeta de crédito.`
        + (B.tc ? ` Dólar: ${crc2(B.tc.venta)} venta · ${crc2(B.tc.compra)} compra (${dayShort(B.tc.fecha)}).` : ''))),
    h('div', { class: 'card' },
      h('div', { class: 'qgrid' },
        stat('Ingreso + saldo a favor', crc(B.neto + B.saldo), ingSub),
        stat('Por pagar', crc(B.fijos + B.deu), `${items.length} pago(s) hasta el ${dayShort(q.fin)}${B.sinFecha ? ` · ${B.sinFecha} sin fecha todavía` : ''}`),
        stat('Ya gastado', crc(B.gastado), (B.tachado ? `Incluye ${crc(B.tachado)} de pagos tachados · ` : '') + (B.wink ? `Salario ${crc(B.gastado - B.wink)} · Wink ${crc(B.wink)} (no sale de la quincena)` : 'Todo de salario')),
        privacy.hide ? stat('Queda libre', crc(0), 'Tocá el ojo de arriba para verlo') : stat('Queda libre', `${B.queda < 0 ? '−' : ''}${crc(Math.abs(B.queda))}`, B.queda < 0 ? `Falta para cubrir lo que hay que pagar hasta el ${dayShort(q.fin)}` : 'Libre para el resto de la quincena', B.queda < 0 ? 'var(--bad)' : 'var(--ok)')),
      items.length ? h('details', { class: 'pp' },
        h('summary', {}, 'Ver lo que hay que pagar'),
        h('ul', { class: 'rows' }, items.map((i) => h('li', {},
          h('span', { class: `who who-${(i.quien || 'Ambos').toLowerCase()}` }),
          h('div', { class: 'main' }, i.nombre, h('span', { class: 'sub' }, `${dayShort(i.fecha)}${i.extra ? ` · ${i.extra}` : ''} · ${i.quien || 'Ambos'}`)),
          h('span', { class: 'amt' }, crc(i.monto)))))) : null),
    gen);
}

const crc2 = (v) => '₡' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function genCard(D, B, catName, hoy, compact) {
  const { q } = B;
  const gs = D.gastos.filter((g) => (catName === 'General' || g.categoria === catName));
  const qs = C.quincenas(gs, D.presupuestos).filter((r) => r.categoria === catName);
  let cur = qs.find((r) => r.inicio === q.inicio) || { gastado: 0, salario: 0, wink: 0, n: 0 };
  if (catName === 'General' && B.tachado) cur = { ...cur, gastado: cur.gastado + B.tachado, salario: cur.salario + B.tachado };
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
      stat('Gastado', crc(cur.gastado), `${cur.n} gasto(s) · ${fuente}`),
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

function secTipos(D, B, hoy) {
  const { q } = B;
  const extras = [...new Set(D.gastos.map((g) => g.categoria))].filter((c) => c && !C.CATS.includes(c));
  const todas = [...C.CATS, ...extras];
  const conAlgo = todas.filter((c) => D.gastos.some((g) => g.categoria === c && g.fecha >= q.inicio && g.fecha <= q.fin) || C.presupuestoVigente(D.presupuestos, c, q.inicio));
  const resto = todas.filter((c) => !conAlgo.includes(c));
  return h('section', { id: 'r-tipos', class: 'sec' },
    h('div', { class: 'sec-head' }, h('h2', {}, 'Por tipo de gasto')),
    conAlgo.length ? h('div', { class: 'qcats' }, conAlgo.map((c) => genCard(D, B, c, hoy, true))) : null,
    resto.length ? h('p', { class: 'note' }, `Sin gastos esta quincena: ${resto.join(', ')}.`) : null);
}

function secMes(D) {
  const r = C.resumenMes(D.gastos);
  const label = r.mes ? `${MESES[Number(r.mes.slice(5, 7)) - 1]} ${r.mes.slice(0, 4)}` : 'el mes';
  return h('section', { id: 'r-mes', class: 'sec' },
    h('div', { class: 'sec-head' }, h('h2', {}, `Mes de ${label}`), h('p', { class: 'note' }, `${r.n} gasto(s)${r.n_pend ? ` · ${r.n_pend} sin clasificar` : ''}.`)),
    h('div', { class: 'tiles' },
      tile('Total del mes', crc(r.total)),
      tile('Fijo', crc(r.fijo), 'Suscripciones, servicios'),
      tile('Variable', crc(r.variable), 'Mercado y similares'),
      tile('De una vez', crc(r.una_vez)),
      r.pendiente ? tile('Sin clasificar', crc(r.pendiente)) : null));
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

function secGastos(gastos) {
  const rows = gastos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return h('section', { id: 'r-gastos', class: 'card sec' },
    h('h2', {}, 'Gastos'),
    h('p', { class: 'note' }, 'Cada gasto registrado, el más reciente primero.'),
    rows.length ? h('ul', { class: 'rows' }, rows.map((g) => h('li', {},
      h('div', { class: 'main' }, g.comercio,
        h('span', { class: 'sub' }, [dayShort(g.fecha), g.descripcion, g.categoria + (g.subcategoria ? ` · ${g.subcategoria}` : ''), g.fuente].filter(Boolean).join(' · ')),
        g.tipo ? h('span', { class: `pill ${g.tipo === 'Pendiente' ? 'pend' : g.tipo === 'Fijo' ? 'rec' : ''}` }, g.tipo) : null),
      h('span', { class: 'amt' }, crc(g.monto))))) : empty('Todavía no hay gastos.'));
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
  const D = Object.fromEntries(['gastos', 'cuentas', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas'].map((k) => [k, sync.data(k)]));
  const hoy = todayCR();
  const B = C.balanceQuincena(D, hoy);
  const { q } = B;
  const general = cat === 'General';
  const delCat = D.gastos.filter((g) => general || g.categoria === cat);
  const enQ = delCat.filter((g) => g.fecha >= q.inicio && g.fecha <= q.fin).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const items = enQ.map((g) => ({ fecha: g.fecha, titulo: g.comercio, sub: [g.descripcion, general ? g.categoria : g.subcategoria, g.fuente].filter(Boolean).join(' · '), monto: g.monto, tipo: 'gasto' }));
  if (general) {
    const tc = C.ultimoTC(D.tipo_cambio);
    const deCuenta = new Set(D.cuentas.map((c) => c.fuente));
    const recs = new Map(D.recurrentes.map((r) => [r.id, r]));
    for (const p of D.pagos_recurrentes.filter((x) => x.vence >= q.inicio && x.vence <= q.fin && !deCuenta.has(x.fuente))) {
      const r = recs.get(p.recurrente || p.id.split('_')[0]) || {};
      items.push({ fecha: p.fecha, titulo: r.nombre || 'Pago recurrente', sub: `Pago tachado (vence ${dayShort(p.vence)})${p.fuente ? ` · ${p.fuente}` : ''}`, monto: p.monto_crc, tipo: 'rec' });
    }
    const deudas = C.deudasCRC(D.deudas, tc);
    for (const p of D.pagos_deudas.filter((x) => x.fecha >= q.inicio && x.fecha <= q.fin)) {
      const d = deudas.find((x) => x.id === p.id);
      if (!d || d.direccion !== 'debemos') continue;
      items.push({ fecha: p.fecha, titulo: `${d.persona} · ${d.concepto}`, sub: `Deuda pagada${p.fuente ? ` · ${p.fuente}` : ''}`, monto: d.crc, tipo: 'deuda' });
    }
    items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }
  const total = C.sum(items, (i) => i.monto);
  const pasadas = [...C.groupBy(delCat.filter((g) => g.fecha < q.inicio), (g) => C.quincenaDe(g.fecha).inicio)].sort((a, b) => b[0].localeCompare(a[0]));
  const TIPO = { gasto: null, rec: 'Recurrente', deuda: 'Deuda' };
  const row = (i) => h('li', {},
    h('div', { class: 'main' }, i.titulo, h('span', { class: 'sub' }, `${dayShort(i.fecha)}${i.sub ? ` · ${i.sub}` : ''}`), TIPO[i.tipo] ? h('span', { class: `pill ${i.tipo === 'deuda' ? 'pend' : 'rec'}` }, TIPO[i.tipo]) : null),
    h('span', { class: 'amt' }, crc(i.monto)));
  return [
    h('section', { class: 'card' },
      h('h2', {}, general ? 'Todo lo de la quincena' : cat),
      h('p', { class: 'note' }, `Quincena del ${dayShort(q.inicio)} al ${dayShort(q.fin)} · ${items.length} movimiento(s)${general ? ' (gastos, pagos recurrentes tachados y deudas pagadas)' : ''}.`),
      h('div', { class: 'cat-total' }, h('span', {}, 'Total'), h('b', {}, crc(total))),
      items.length ? h('ul', { class: 'rows' }, items.map(row)) : empty('Nada en esta quincena.')),
    pasadas.length ? h('section', { class: 'card' },
      h('h2', {}, 'Quincenas anteriores'),
      pasadas.map(([ini, gs]) => h('details', { class: 'pp' },
        h('summary', {}, `${dayShort(ini)} – ${dayShort(C.quincenaDe(ini).fin)} · ${crc(C.sum(gs, (g) => g.monto))}`),
        h('ul', { class: 'rows' }, gs.map((g) => row({ fecha: g.fecha, titulo: g.comercio, sub: [g.descripcion, g.fuente].filter(Boolean).join(' · '), monto: g.monto, tipo: 'gasto' })))))) : null,
  ];
}

// Acceso rápido a subir facturas (y aviso si Claude dejó preguntas).
function secFacturas(ctx) {
  const pend = preguntasAbiertas(ctx.sync);
  const cola = ctx.sync.uploads.length;
  return h('section', { class: 'card fac-quick' + (pend.length ? ' alert' : '') },
    h('div', { class: 'main' },
      h('b', {}, pend.length ? `Claude tiene ${pend.length} pregunta${pend.length === 1 ? '' : 's'}` : 'Facturas'),
      h('span', { class: 'sub' }, pend.length ? 'Sobre las últimas facturas. Tocá para contestar.' : cola ? `${cola} esperando internet para subir` : 'Subí la foto y Claude la anota.')),
    h('button', { type: 'button', class: 'btn', onclick: () => ctx.go('facturas') }, pend.length ? 'Contestar' : 'Subir factura'));
}
