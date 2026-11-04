// Resumen para la app de iPhone: los mismos cálculos y textos de js/views/resumen.js, pero devueltos como datos
// (la app nativa solo los dibuja). Si cambia algo en el Resumen de la web, hay que reflejarlo aquí.
import { crc, usd, privacy, addDays, daysBetween, dayShort, MESES } from '../../js/ui.js';
import * as C from '../../js/calc.js';

const neg = (v) => `${v < 0 && !privacy.hide ? '−' : ''}${crc(Math.abs(v))}`;
const stat = (lbl, num, sub, color, fuente) => ({ lbl, num, sub: sub || null, color: color || null, fuente: fuente || null });
const aguiTxt = (a) => `aguinaldo de ${a.persona} ${crc(a.neto)}${a.proporcional ? ` (proporcional desde el ${dayShort(a.desde)})` : ''}, a más tardar el 20 dic.`;
const movLinea = (m) => ({ nombre: m.titulo, sub: [dayShort(m.fecha), m.sub, m.categoria, m.fuente].filter(Boolean).join(' · '), monto: m.monto });
const ingLineas = (ing, agui) => [
  ...ing.map((r) => ({ nombre: `Salario de ${r.persona}`, sub: `${crc(r.bruto)} bruto − ${crc(r.deduccion)} de CCSS (${r.deduccion_pct}%)`, monto: r.neto })),
  ...agui.map((a) => ({ nombre: `Aguinaldo de ${a.persona}`, sub: `Sin rebajos${a.proporcional ? ` · proporcional desde el ${dayShort(a.desde)}` : ''} · a más tardar el 20 dic.`, monto: a.neto })),
];
const fondoNota = (D, queda) => {
  const F = C.fondoAhorro(D);
  return F.total ? ` Aparte está el fondo de ahorro (${crc(F.total)}); con él serían ${queda + F.total < 0 ? '−' : ''}${crc(Math.abs(queda + F.total))}.` : '';
};
const fondoLinea = (D, queda) => {
  const F = C.fondoAhorro(D);
  if (!F.total) return null;
  const con = queda + F.total;
  return { lbl: `Con el fondo de ahorro (${crc(F.total)})`, num: neg(con), bad: con < 0 };
};
const crc2 = (v) => '₡' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const limpiar = (g) => (g ? { ...g, lineas: (g.lineas || []).filter(Boolean) } : null);
const fuente = (f) => ({ ...f, grupos: (f.grupos || []).filter(Boolean).map(limpiar) });

function quincena(D, B, hoy) {
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
  const gIng = { titulo: 'Ingreso + saldo a favor', signo: '+', total: entra, lineas: [
    B.arrastre ? { nombre: 'Sobra de la quincena anterior', sub: B.prevQ ? `Lo que quedó sin gastar hasta el ${dayShort(B.prevQ.fin)} (sin contar lo que estaba pendiente)` : '', monto: B.arrastre } : null,
    ...ingLineas(B.ing, B.agui),
    ...B.saldos.map((s) => ({ nombre: `Saldo a favor${s.donde ? ` (${s.donde.toLowerCase()})` : ''}`, sub: [s.moneda === 'USD' ? `${usd(s.monto)} al tipo de cambio` : null, s.nota].filter(Boolean).join(' · '), monto: s.crc })),
  ], vacio: 'No hay ingresos anotados para esta quincena.' };
  const gPagar = { titulo: `Por pagar hasta el ${dayShort(q.fin)}`, signo: '−', total: B.fijos + B.deu, lineas: items.map((i) => ({ nombre: i.nombre, sub: `${dayShort(i.fecha)}${i.extra ? ` · ${i.extra}` : ''} · ${i.quien || 'Ambos'}`, monto: i.monto })), vacio: 'Nada pendiente.' };
  const gGastado = { titulo: 'Gastado del salario', signo: '−', total: B.gastado - B.wink - B.otraCuenta, lineas: B.movs.filter(deSalario).map(movLinea), vacio: 'Nada todavía.' };
  return {
    titulo: `Quincena actual · ${dayShort(q.inicio)} – ${dayShort(q.fin)}`,
    nota: `Día ${dia} de ${q.dias}. Las quincenas empiezan el 12 y el 26, cuando le pagan a Ali. Salario = cuentas; Wink = tarjeta de crédito.`
      + (B.tc ? ` Dólar: ${crc2(B.tc.venta)} venta · ${crc2(B.tc.compra)} compra (${dayShort(B.tc.fecha)}).` : ''),
    queda: B.queda,
    stats: [
      stat('Ingreso + saldo a favor', crc(entra), ingSub, null, fuente({ titulo: 'Ingreso + saldo a favor', grupos: [gIng], total: entra })),
      stat('Por pagar', crc(B.fijos + B.deu), `${items.length} pago(s) hasta el ${dayShort(q.fin)}${B.sinFecha ? ` · ${B.sinFecha} sin fecha todavía` : ''}`, null, fuente({
        titulo: 'Por pagar', grupos: [gPagar],
        nota: `Recurrentes que vencen hasta el ${dayShort(q.fin)} y todavía no están tachados, más deudas con fecha límite hasta ese día. Lo que sale de Bank of America va aparte, en Cuentas.${B.sinFecha ? ` Hay ${B.sinFecha} recurrente(s) sin fecha que no se cuentan.` : ''}`, total: B.fijos + B.deu })),
      stat('Ya gastado', crc(B.gastado), (B.tachado ? `Incluye ${crc(B.tachado)} de pagos tachados · ` : '') + (B.wink || B.otraCuenta ? [`Salario ${crc(B.gastado - B.wink - B.otraCuenta)}`, B.wink ? `Wink ${crc(B.wink)}` : null, B.otraCuenta ? `otras cuentas ${crc(B.otraCuenta)}` : null].filter(Boolean).join(' · ') + ' (solo el salario sale de la quincena)' : 'Todo de salario'), null, fuente({
        titulo: 'Ya gastado', nota: 'Gastos, pagos tachados y abonos desde el ' + dayShort(q.inicio) + '. Lo de Wink se muestra aparte porque se paga la quincena siguiente.',
        grupos: [gGastado, B.wink ? { titulo: 'Con Wink (no sale de esta quincena)', total: B.wink, lineas: B.movs.filter((m) => m.fuente === 'Wink').map(movLinea) } : null,
          B.otraCuenta ? { titulo: 'De otras cuentas (BofA…)', total: B.otraCuenta, lineas: B.movs.filter((m) => m.fuente !== 'Wink' && otraCta.has(m.fuente)).map(movLinea) } : null], total: B.gastado })),
      stat('Queda libre', privacy.hide ? crc(0) : neg(B.queda), privacy.hide ? 'Tocá el ojo de arriba para verlo' : B.queda < 0 ? `Falta para cubrir lo que hay que pagar hasta el ${dayShort(q.fin)}` : `Libre para el resto de la quincena${B.apartado ? ` (ya sin los ${crc(B.apartado)} apartados)` : ''}`, privacy.hide ? null : B.queda < 0 ? 'bad' : 'ok', fuente({
        titulo: 'Queda libre', nota: 'Lo que sobró de la anterior y lo que entra, menos lo que falta pagar, menos lo ya gastado del salario.' + fondoNota(D, B.queda),
        grupos: [gIng, gPagar, gGastado, B.apartado ? { titulo: 'Apartado para metas', signo: '−', total: B.apartado, lineas: B.aportes.map((a) => ({ nombre: a.meta, sub: `${dayShort(a.fecha)} · ${a.por || ''}`, monto: Number(a.monto) })) } : null], total: B.queda })),
    ],
    fondo: fondoLinea(D, B.queda),
    pagos: items.map((i) => ({ nombre: i.nombre, sub: `${dayShort(i.fecha)}${i.extra ? ` · ${i.extra}` : ''} · ${i.quien || 'Ambos'}`, monto: i.monto, quien: i.quien || 'Ambos' })),
    gen: genCard(D, B, 'General', hoy, false),
  };
}

function proyecciones(D, hoy) {
  const P = C.proyeccion(D, hoy, 12);
  return P.futuras.map((r, k) => {
    const off = k + 1;
    const n = r.queda < 0;
    return {
      titulo: `${dayShort(r.q.inicio)} – ${dayShort(r.q.fin)}`,
      sub: `Proyección · ${off} quincena${off === 1 ? '' : 's'} adelante`,
      queda: r.queda,
      stats: [
        stat('Sobra de la anterior', neg(r.arrastre), r.arrastre < 0 ? 'La anterior queda en negativo' : 'Lo que quedaría libre de la quincena anterior', r.arrastre < 0 ? 'bad' : null, fuente({
          titulo: 'Sobra de la anterior',
          nota: `Es lo que ${off === 1 ? 'queda libre en la quincena actual' : 'quedaría libre en la quincena anterior'} (${dayShort(r.arrastreDe.inicio)} – ${dayShort(r.arrastreDe.fin)}). Tocá ‹ para ver cómo se calcula.`,
          total: r.arrastre, totalLbl: 'Pasa a esta quincena' })),
        stat(r.agui.length ? 'Salario + aguinaldo' : 'Salario', crc(r.neto), [r.ing.length ? `${r.ing.map((x) => x.persona).join(' + ')} · quincena ${r.q.numero === 1 ? 'del 12' : 'del 26'} (neto)` : 'Sin salario anotado', ...r.agui.map(aguiTxt)].join(' · '), null, fuente({
          titulo: r.agui.length ? 'Salario + aguinaldo' : 'Salario',
          grupos: [{ titulo: 'Entra en esta quincena', signo: '+', total: r.neto, lineas: ingLineas(r.ing, r.agui), vacio: 'No hay salario anotado para esta quincena.' }], total: r.neto })),
        stat('Por pagar', crc(r.porPagar), `${r.pagos.length} pago(s) con fecha${r.pagos.some((p) => p.tipo === 'tarjeta') ? ' · incluye la tarjeta Wink' : ''}`, null, fuente({
          titulo: 'Por pagar',
          grupos: [{ titulo: `Pagos del ${dayShort(r.q.inicio)} al ${dayShort(r.q.fin)}`, signo: '−', total: r.porPagar, lineas: r.pagos.map((i) => ({ nombre: i.nombre, sub: `${dayShort(i.fecha)} · ${i.quien || 'Ambos'}${({ deuda: ' · deuda', tarjeta: ' · tarjeta', meta: ' · meta de ahorro' })[i.tipo] || ' · recurrente'}`, monto: i.monto })), vacio: 'No hay pagos con fecha en esta quincena.' }],
          nota: 'Recurrentes que vencen en estas fechas, deudas con fecha límite aquí y lo usado con Wink la quincena anterior. Lo que sale de Bank of America no se cuenta aquí.', total: r.porPagar })),
        stat('Día a día (estimado)', crc(r.estVar), `Súper, salidas, transporte… (${r.estBase})`, null, fuente({
          titulo: 'Día a día (estimado)',
          nota: r.estDetalle.length ? 'Promedio de los gastos variables (súper, salidas, transporte…) de las quincenas que ya cerraron.' : 'Todavía no hay quincenas cerradas, así que uso lo que va de gasto variable en la actual.',
          grupos: r.estDetalle.length ? [{ titulo: `Quincenas cerradas (${r.estDetalle.length})`, lineas: r.estDetalle.map((x) => ({ nombre: `${dayShort(x.inicio)} – ${dayShort(x.fin)}`, monto: x.monto })) }] : [],
          total: r.estVar, totalLbl: r.estDetalle.length > 1 ? 'Promedio' : 'Estimado' })),
      ],
      total: stat(n ? 'Faltaría' : 'Quedaría libre', privacy.hide ? crc(0) : neg(r.queda), null, n ? 'bad' : 'ok', fuente({
        titulo: n ? 'Faltaría' : 'Quedaría libre',
        nota: 'Lo que sobra de la anterior, más lo que entra, menos los pagos con fecha y el gasto del día a día estimado.' + fondoNota(D, r.queda),
        grupos: [
          { titulo: 'Sobra de la anterior', signo: '+', total: r.arrastre },
          { titulo: r.agui.length ? 'Salario + aguinaldo' : 'Salario', signo: '+', total: r.neto, lineas: ingLineas(r.ing, r.agui) },
          { titulo: 'Por pagar', signo: '−', total: r.porPagar, lineas: r.pagos.map((i) => ({ nombre: i.nombre, sub: dayShort(i.fecha), monto: i.monto })) },
          { titulo: 'Día a día (estimado)', signo: '−', total: r.estVar },
        ], total: r.queda })),
      fondo: fondoLinea(D, r.queda),
      pagos: r.pagos.map((i) => ({ nombre: i.nombre, sub: `${dayShort(i.fecha)} · ${i.quien || 'Ambos'}${i.tipo === 'deuda' ? ' · deuda' : ''}`, monto: i.monto, quien: i.quien || 'Ambos' })),
      nota: `Es una estimación: no incluye cobros sin fecha (como la luz)${P.sinFecha.n ? ` ni ${P.sinFecha.n} deuda(s) sin fecha por ${crc(P.sinFecha.total)}` : ''}. Si una deuda tiene fecha para pagarse (decímela y se la pongo) o usan la tarjeta Wink, se suma sola.`,
    };
  });
}

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
  const fte = cur.wink ? `Salario ${crc(cur.salario)} · Wink ${crc(cur.wink)}` : cur.gastado ? 'Todo de salario' : 'Sin gastos todavía';
  const ref = presu || prom || proy || 1;
  const over = !!(presu && cur.gastado > presu);
  return {
    cat: catName,
    titulo: compact ? catName : 'Gasto de la quincena',
    sub: compact ? (C.CAT_SUB[catName] || null) : null,
    stats: [
      stat('Gastado', crc(cur.gastado), `${cur.n} movimiento(s) · ${fte}`),
      stat('Presupuesto', presu ? crc(presu) : 'Sin definir', presu ? (presu - cur.gastado >= 0 ? `Quedan ${crc(presu - cur.gastado)}` : `Pasado por ${crc(cur.gastado - presu)}`) : (prom ? `Promedio: ${crc(prom)}` : 'Con 2 quincenas te sugiero uno')),
      stat('Ritmo por día', crc(ritmo), presu && quedan > 0 ? `Para no pasarse: ${crc(Math.max(presu - cur.gastado, 0) / quedan)}/día` : `${quedan} día(s) restantes`),
      stat('Al cierre, a este ritmo', crc(proy), compact ? 'Estimado' : 'Estimado. Al inicio de quincena sale alto porque los gastos grandes van primero.', presu ? (proy > presu ? 'bad' : 'ok') : null),
    ],
    dias: trans / q.dias,
    plata: cur.gastado ? Math.min(cur.gastado / ref, 1) : 0,
    over,
    leyenda: compact ? null : `Barra: gastado vs. ${presu ? 'presupuesto' : prom ? 'promedio de quincenas pasadas' : 'proyección'} · línea punteada: días que van de la quincena`,
    hist: pasadas.slice(-6).reverse().map((r) => ({ label: `${dayShort(r.inicio)} – ${dayShort(r.fin)}`, total: r.gastado })),
    vacio: `Todavía no hay quincenas cerradas. Esta cierra el ${dayShort(q.fin)}.`,
  };
}

function tipos(D, B, hoy) {
  const { q } = B;
  const movs = C.movimientos(D);
  const extras = [...new Set(movs.map((g) => g.categoria))].filter((c) => c && !C.CATS.includes(c));
  const todas = [...C.CATS, ...extras];
  const conAlgo = todas.filter((c) => movs.some((g) => g.categoria === c && g.fecha >= q.inicio && g.fecha <= q.fin) || C.presupuestoVigente(D.presupuestos, c, q.inicio));
  const resto = todas.filter((c) => !conAlgo.includes(c));
  return { cards: conAlgo.map((c) => genCard(D, B, c, hoy, true)), resto: resto.length ? `Sin gastos esta quincena: ${resto.join(', ')}.` : null };
}

function mes(D, hoy) {
  const movs = C.movimientos(D);
  const r = C.resumenMes(movs);
  const nomMes = (k) => MESES[Number(k.slice(5, 7)) - 1];
  const label = r.mes ? `${nomMes(r.mes)} ${r.mes.slice(0, 4)}` : 'el mes';
  const delMes = movs.filter((m) => m.fecha.slice(0, 7) === r.mes);
  const TIPOS = [['Fijo', 'Fijo'], ['Variable', 'Variable'], ['Una vez', 'De una vez'], ['Deudas', 'Deudas pagadas'], ['Pendiente', 'Sin clasificar']];
  const grupoTipo = (t, nombre) => { const l = delMes.filter((m) => (m.gtipo || m.tipo) === t); return { titulo: nombre, total: C.sum(l, (m) => m.monto), lineas: l.map(movLinea), vacio: 'Nada este mes.' }; };
  const ant = r.mes ? (() => { let [y, m] = r.mes.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; })() : null;
  const R0 = ant ? C.resumenMes(movs.filter((m) => m.fecha.slice(0, 7) <= ant)) : null;
  const hayAnt = R0 && R0.mes === ant;
  const vs = (k, alt) => {
    if (!hayAnt) return alt ? { texto: alt, dir: null } : null;
    const d = r[k] - R0[k];
    if (!d) return { texto: `Igual que ${nomMes(ant)}`, dir: null };
    return { texto: `${d > 0 ? '▲' : '▼'} ${crc(Math.abs(d))} vs ${nomMes(ant)}`, dir: d > 0 ? 'up' : 'down' };
  };
  const tile = (lbl, num, v, f) => ({ lbl, num, sub: v ? v.texto : null, dir: v ? v.dir : null, fuente: fuente(f) });
  const enCurso = r.mes === hoy.slice(0, 7);
  // Mes a mes (hasta 6 meses).
  const M = C.porMes(movs, 6);
  const n = M.meses.length;
  const hoyMes = hoy.slice(0, 7);
  const etiqueta = (k) => `${nomMes(k).slice(0, 3)}${k.slice(0, 4) !== hoyMes.slice(0, 4) ? ` ${k.slice(2, 4)}` : ''}`;
  return {
    titulo: `Mes de ${label}${enCurso ? ' (en curso)' : ''}`,
    nota: `${r.n} movimiento(s)${r.n_pend ? ` · ${r.n_pend} sin clasificar` : ''}.`,
    tiles: [
      tile('Total del mes', crc(r.total), vs('total'), { titulo: `Total de ${label}`, grupos: TIPOS.map(([t, nn]) => grupoTipo(t, nn)).filter((g) => g.lineas.length), total: r.total }),
      tile('Fijo', crc(r.fijo), vs('fijo', 'Suscripciones, servicios'), { titulo: `Fijo · ${label}`, grupos: [grupoTipo('Fijo', 'Fijo')], total: r.fijo }),
      tile('Variable', crc(r.variable), vs('variable', 'Mercado y similares'), { titulo: `Variable · ${label}`, grupos: [grupoTipo('Variable', 'Variable')], total: r.variable }),
      tile('De una vez', crc(r.una_vez), vs('una_vez'), { titulo: `De una vez · ${label}`, grupos: [grupoTipo('Una vez', 'De una vez')], total: r.una_vez }),
      r.deudas ? tile('Deudas pagadas', crc(r.deudas), vs('deudas', 'Pagos y abonos a deudas'), { titulo: `Deudas pagadas · ${label}`, grupos: [grupoTipo('Deudas', 'Deudas pagadas')], total: r.deudas }) : null,
      r.pendiente ? tile('Sin clasificar', crc(r.pendiente), null, { titulo: `Sin clasificar · ${label}`, grupos: [grupoTipo('Pendiente', 'Sin clasificar')], total: r.pendiente }) : null,
    ].filter(Boolean),
    cmp: n ? {
      nota: n < 2 ? `Por ahora solo hay datos de ${nomMes(M.meses[0])}. Desde el próximo mes este gráfico compara cada categoría contra los meses anteriores (hasta 6).` : null,
      meses: M.meses.map((k, i) => ({ label: etiqueta(k) + (k === hoyMes && n >= 2 ? '*' : ''), total: M.totales[i] })),
      cats: M.cats.map((c) => ({ categoria: c.categoria, valores: c.valores, delta: n >= 2 ? c.valores[n - 1] - c.valores[n - 2] : 0 })),
      enCurso: M.meses.includes(hoyMes) && n >= 2 ? '* Mes en curso: todavía no está completo.' : null,
    } : null,
  };
}

function cuentasMini(D, B, hoy) {
  const info = C.cuentasInfo(D, hoy, 35);
  if (!info.length) return null;
  const F = C.fondoAhorro(D);
  return {
    filas: info.map((c) => {
      const fmt = (v) => (c.moneda === 'USD' ? usd(v) : crc(v));
      const malo = c.cobros.find((x) => !x.omitido && x.despues < 0);
      return { nombre: c.nombre, sub: malo ? `No alcanza para ${malo.f.nombre} el ${dayShort(malo.fecha)}` : c.cobros.length ? `Después de los cobros de 35 días: ${fmt(c.proyectado)}` : `Actualizado el ${dayShort(c.fecha)}`, subBad: !!malo, num: fmt(c.saldo), bad: c.saldo < 0 };
    }),
    nota: F.total ? `Con lo libre de la quincena y el fondo, en total tienen unos ${crc(B.queda + C.sum(info, (c) => c.crc || 0))}.` : null,
  };
}

function metas(D, hoy) {
  return C.metasInfo(D, hoy).map((m) => ({
    nombre: m.nombre, pct: m.pct,
    sub: m.lista ? '¡Cumplida!' : m.vencida ? `Faltaron ${crc(m.falta)}` : `${crc(m.ahorrado)} de ${crc(m.meta)} · para el ${dayShort(m.fecha)}`,
    estaQ: m.lista || m.vencida ? null : (m.estaQ ? crc(m.estaQ) : '✓'),
  }));
}

function negocio(D, hoy) {
  const N = C.negocioInfo({ gastos: D.gastos, negocio: D.negocio }, hoy.slice(0, 7));
  return N.ventas.length || N.gastos.length ? `Este mes: ventas ${crc(N.ventasMes)} · gastos ${crc(N.gastosMes)} · ${N.ganancia < 0 ? 'pérdida' : 'ganancia'} ${crc(Math.abs(N.ganancia))}` : 'Ventas y gastos del negocio, aparte de la casa.';
}

const TIPO_MOV = { rec: 'Recurrente', deuda: 'Deuda', abono: 'Abono' };
function movimientos(D) {
  return C.movimientos(D).map((g) => ({
    titulo: g.titulo, sub: [dayShort(g.fecha), g.sub, g.categoria, g.fuente].filter(Boolean).join(' · '), fecha: g.fecha, monto: g.monto,
    pill: g.tipo === 'gasto' ? (g.gtipo || null) : TIPO_MOV[g.tipo] || null,
    pillTipo: g.tipo === 'gasto' ? (g.gtipo === 'Pendiente' ? 'pend' : g.gtipo === 'Fijo' ? 'rec' : '') : g.tipo === 'rec' ? 'rec' : 'pend',
    buscar: [g.titulo, g.sub, g.categoria, g.fuente, g.gtipo, dayShort(g.fecha)].join(' '),
  }));
}

export function resumen(D, hoy) {
  const B = C.balanceQuincena(D, hoy);
  const pend = (D.pendientes || []).filter((p) => (p.estado || 'abierta') === 'abierta' && p.respuesta == null).length;
  const mm = hoy.slice(5, 7);
  return {
    preguntas: pend,
    anio: ['12', '01'].includes(mm) ? `✨ Tu ${mm === '01' ? Number(hoy.slice(0, 4)) - 1 : hoy.slice(0, 4)}` : null,
    quincena: quincena(D, B, hoy),
    proyecciones: proyecciones(D, hoy),
    cuentas: cuentasMini(D, B, hoy),
    metas: metas(D, hoy),
    negocio: negocio(D, hoy),
    tipos: tipos(D, B, hoy),
    mes: mes(D, hoy),
    movs: movimientos(D),
    meses: MESES,
  };
}

// Detalle de una categoría (o "General": todo lo de la quincena).
export function categoria(D, hoy, cat) {
  const B = C.balanceQuincena(D, hoy);
  const { q } = B;
  const general = cat === 'General';
  const delCat = C.movimientos(D).filter((m) => general || m.categoria === cat);
  const enOrden = (l) => l.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).reverse();
  const fila = (m, sub) => ({ titulo: m.titulo, sub: `${dayShort(m.fecha)}${sub ? ` · ${sub}` : ''}`, monto: m.monto, pill: TIPO_MOV[m.tipo] || null, pillTipo: m.tipo === 'rec' ? 'rec' : 'pend' });
  const items = enOrden(delCat.filter((m) => m.fecha >= q.inicio && m.fecha <= q.fin));
  const pasadas = [...C.groupBy(delCat.filter((g) => g.fecha < q.inicio), (g) => C.quincenaDe(g.fecha).inicio)].sort((a, b) => b[0].localeCompare(a[0]));
  return {
    titulo: general ? 'Todo lo de la quincena' : cat,
    nota: `Quincena del ${dayShort(q.inicio)} al ${dayShort(q.fin)} · ${items.length} movimiento(s)${general ? ' (gastos, pagos recurrentes, deudas pagadas y abonos)' : ''}.`,
    total: crc(C.sum(items, (i) => i.monto)),
    items: items.map((m) => fila(m, [m.sub, general ? m.categoria : null, m.fuente].filter(Boolean).join(' · '))),
    pasadas: pasadas.map(([ini, gs]) => ({ titulo: `${dayShort(ini)} – ${dayShort(C.quincenaDe(ini).fin)}`, total: crc(C.sum(gs, (g) => g.monto)), items: enOrden(gs).map((g) => fila(g, [g.sub, g.fuente].filter(Boolean).join(' · '))) })),
  };
}

// "¿Me alcanza?": la misma lógica de js/alcanza.js.
export function alcanza(D, hoy, n, cuando) {
  const B = C.balanceQuincena(D, hoy);
  const P = C.proyeccion(D, hoy, 6);
  const F = C.fondoAhorro(D);
  const ms = C.metasInfo(D, hoy).filter((m) => m.estaQ > 0 && !m.vencida);
  const opciones = [['ahora', 'Esta quincena'], ['proxima', `La próxima (${dayShort(P.futuras[0].q.inicio)})`]];
  if (!n) return { opciones, vacio: 'Escribí cuánto cuesta y te digo cómo quedan las cuentas.' };
  const ahora = cuando === 'ahora';
  const quedaAhora = B.queda - (ahora ? n : 0);
  const futuras = P.futuras.map((r) => ({ ...r, despues: r.queda - n }));
  const primeraRoja = futuras.find((r) => r.despues < 0);
  const peorAntes = Math.min(B.queda, ...P.futuras.map((r) => r.queda));
  let veredicto, cls;
  if ((ahora && quedaAhora < 0) || (!ahora && futuras[0].despues < 0)) { veredicto = 'No alcanza'; cls = 'bad'; }
  else if (primeraRoja) { veredicto = 'Alcanza, pero aprieta'; cls = 'warn'; }
  else { veredicto = 'Sí alcanza'; cls = 'ok'; }
  const metaTxt = ms.length && ((ahora && quedaAhora < C.sum(ms, (m) => m.estaQ)) || primeraRoja)
    ? `Ojo con las metas: lo que toca apartar (${crc(C.sum(ms, (m) => m.estaQ))} esta quincena) quedaría más difícil.` : null;
  const fila = (lbl, antes, despues) => ({ lbl, antes: neg(antes), despues: neg(despues), bad: despues < 0 });
  return {
    opciones, veredicto, cls,
    nota: primeraRoja
      ? `La quincena del ${dayShort(primeraRoja.q.inicio)} quedaría en ${neg(primeraRoja.despues)}.${F.total && primeraRoja.despues + F.total >= 0 ? ` El fondo de ahorro (${crc(F.total)}) lo cubriría.` : ''}`
      : peorAntes - n >= 0 ? `Después de comprarlo, la quincena más apretada de las próximas quedaría en ${neg(Math.min(ahora ? quedaAhora : Infinity, ...futuras.map((r) => r.despues)))}.` : '',
    filas: [ahora ? fila(`Esta quincena (hasta el ${dayShort(B.q.fin)})`, B.queda, quedaAhora) : null, ...futuras.map((r) => fila(`${dayShort(r.q.inicio)} – ${dayShort(r.q.fin)}`, r.queda, r.despues))].filter(Boolean),
    metaTxt,
    pie: 'Es la misma proyección de Resumen (salario, pagos con fecha, Wink y el gasto del día a día estimado), restando esta compra.',
  };
}
