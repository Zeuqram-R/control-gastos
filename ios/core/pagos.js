// Recurrentes y Deudas para la app de iPhone: mismos cálculos, textos y registros que js/views/pagos.js.
// Si cambian en la web, reflejarlo aquí.
import { crc, usd, dayShort, daysBetween, MESES, nombrePropio } from '../../js/ui.js';
import * as C from '../../js/calc.js';

const QL = { Ambos: 'De ambos', Ali: 'De Ali', Jose: 'De Jose' };
const OFF = ['cancelado', 'sin costo', 'terminado'];
const J = (o) => JSON.stringify(o);

function base(D) {
  const tc = C.ultimoTC(D.tipo_cambio || []);
  return {
    tc,
    rec: C.recurrentesCRC(D.recurrentes || [], tc),
    deudas: C.deudasCRC(C.saldoDeudas(D.deudas || [], D.recurrentes || [], D.pagos_recurrentes || [], D.abonos || []), tc),
    abonos: D.abonos || [],
    cuentas: D.cuentas || [],
    pagRec: new Map((D.pagos_recurrentes || []).map((p) => [p.id, p])),
    pagDeu: new Map((D.pagos_deudas || []).map((p) => [p.id, p])),
  };
}

// Si el pago sale de una cuenta (BofA), se descuenta de su saldo (y se devuelve al deshacer).
function cuentaPara(B, hoy, f, signo) {
  const c = B.cuentas.find((x) => x.fuente === f.fuente);
  if (!c || c.moneda !== f.moneda) return null;
  const saldo = Math.round((Number(c.saldo) - signo * Number(f.monto)) * 100) / 100;
  return { recText: J({ id: c.id, saldo, fecha: hoy }), summary: `${c.nombre}: ${signo > 0 ? '−' : '+'}${f.moneda === 'USD' ? '$' : '₡'}${f.monto} (${f.nombre})` };
}
// Se calcula en el momento de guardar, con el saldo que haya en ese momento.
export function ajusteCuenta(D, hoy, recId, signo) {
  const B = base(D);
  const f = B.rec.find((r) => r.id === recId);
  return (f && cuentaPara(B, hoy, f, signo)) || { recText: null };
}

// ---------- Recurrentes ----------
export function recurrentes(D, hoy, persona, off = 0) {
  const B = base(D);
  const q = C.quincenaDe(hoy);
  const act = B.rec.filter((f) => !OFF.includes(f.estado));
  const anuales = act.filter((f) => f.frecuencia === 'anual');
  const wink = C.winkPendiente(D, hoy) || (() => {
    const p = B.pagRec.get(`${C.WINK}_${q.inicio}`);
    return p ? { id: C.WINK, nombre: 'Tarjeta Wink (quincena anterior)', prox: q.inicio, monto: p.monto_crc, moneda: 'CRC', monto_crc: p.monto_crc, quien: 'Ambos', fuente: 'Salario', wink: true } : null;
  })();

  const cuentaDe = (f, signo) => cuentaPara(B, hoy, f, signo);
  const payRow = (f, fecha, sub) => {
    const key = `${f.id}_${fecha}`;
    const paid = B.pagRec.get(key);
    const dias = fecha ? daysBetween(hoy, fecha) : null;
    return {
      key, recId: f.id, quien: f.quien || 'Ambos', pagado: !!paid,
      nombre: (paid ? '✓ ' : '') + f.nombre + (B.cuentas.some((c) => c.fuente === f.fuente) ? ` · ${f.fuente}` : ''),
      sub: paid ? `Pagado el ${dayShort(paid.fecha)}${paid.por ? ` por ${paid.por}` : ''} · tocá para deshacer`
        : `${fecha ? `${dayShort(fecha)}${dias === 0 ? ' · hoy' : dias === 1 ? ' · mañana' : dias > 1 ? ` · en ${dias} días` : dias < 0 ? ` · hace ${-dias} días` : ''}` : 'Sin fecha'} · ${QL[f.quien] || QL.Ambos}${sub ? ` · ${sub}` : ''}`,
      monto: crc(f.monto_crc), montoN: Number(f.monto_crc) || 0, usd: f.moneda === 'USD' ? usd(f.monto) : null,
      // Lo que se guarda al tachar y al deshacer.
      pago: fecha ? J({ id: key, recurrente: f.id, vence: fecha, fecha: hoy, monto_crc: f.monto_crc, fuente: f.fuente || 'Salario', por: persona }) : null,
      pagoSummary: `pagó ${f.nombre} (${dayShort(fecha)})`,
      despagoSummary: `deshace el pago de ${f.nombre}`,
      despagoToast: `${f.nombre}: ya no está marcado como pagado`,
      cuenta: !!cuentaDe(f, 1),
    };
  };
  const panel = (k) => {
    let rows;
    if (k === 'q') rows = act.map((f) => ({ f, fecha: C.proximoPago(f, q.inicio) })).filter((r) => r.fecha && r.fecha <= q.fin);
    else if (k === 'mes') rows = act.filter((f) => f.frecuencia !== 'anual').flatMap((f) => (f.dia ? C.fechasEntre(f, hoy, C.addDays30(hoy)).map((fecha) => ({ f, fecha })) : [{ f, fecha: null }]));
    else rows = anuales.map((f) => ({ f, fecha: C.proximoPago(f, hoy) }));
    rows = rows.filter((r) => C.aplica(r.f, B.cuentas));
    if (k === 'q' && wink) rows.unshift({ f: wink, fecha: wink.prox });
    rows.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const pend = rows.filter((r) => !B.pagRec.has(`${r.f.id}_${r.fecha}`));
    return {
      titulo: k === 'q' ? `Por pagar esta quincena (${dayShort(q.inicio)} – ${dayShort(q.fin)})` : k === 'mes' ? 'Recurrentes de los próximos 30 días' : 'Pagos anuales',
      filas: rows.map((r) => payRow(r.f, r.fecha, [r.f.rango, r.f.categoria, r.f.fuente].filter(Boolean).join(' · '))),
      pie: `${pend.length} pendiente(s)${rows.length > pend.length ? ` · ${rows.length - pend.length} pagado(s)` : ''}`,
      total: crc(C.sum(pend, (r) => r.f.monto_crc)),
    };
  };
  const enQ = act.map((f) => ({ f, fecha: C.proximoPago(f, q.inicio) })).filter((r) => r.fecha && r.fecha <= q.fin && !B.pagRec.has(`${r.f.id}_${r.fecha}`));
  if (wink) enQ.unshift({ f: wink, fecha: wink.prox });

  // Cuentas (BofA…): saldo, cobros de 35 días y cómo quedaría.
  const Bq = C.balanceQuincena(D, hoy);
  const info = C.cuentasInfo(D, hoy, 35);
  const cuentas = info.length ? {
    nota: `Plata en cuentas aparte del salario de la quincena. Con lo que queda libre de la quincena, en total tienen unos ${crc(Bq.queda + C.sum(info, (c) => c.crc))}.`,
    lista: info.map((c) => {
      const fmt = (v) => (c.moneda === 'USD' ? usd(v) : crc(v));
      const neg = c.proyectado < 0;
      return {
        id: c.id, nombre: c.nombre, moneda: c.moneda || 'CRC',
        sub: `${c.dueno ? `De ${c.dueno} · ` : ''}actualizado el ${dayShort(c.fecha)}`,
        saldo: fmt(c.saldo), bad: c.saldo < 0, aprox: c.moneda === 'USD' ? `≈ ${crc(c.crc)} (compra)` : null,
        cobros: c.cobros.map((x) => ({ nombre: x.f.nombre, off: !!x.omitido, sub: `${dayShort(x.fecha)}${x.omitido ? ` · no se cobra: la cuenta tendría ${fmt(x.f.condicion.menor_que)} o más` : ` · queda en ${fmt(x.despues)}`}`, monto: x.monto != null ? `−${fmt(x.monto)}` : '—', bad: !x.omitido && x.despues < 0 })),
        proy: c.cobros.length ? (neg ? `Para cubrir todo hay que meter unos ${fmt(Math.ceil(-c.proyectado * 100) / 100)} antes del ${dayShort(c.cobros.find((x) => !x.omitido && x.despues < 0)?.fecha)}.` : `Después de esos cobros quedaría en ${fmt(c.proyectado)}.`) : 'No hay cobros en los próximos 35 días.',
        proyBad: neg && c.cobros.length > 0,
        nota: c.nota || null,
      };
    }),
  } : null;

  // Calendario del mes (off = meses desde hoy).
  const [cy, cm] = hoy.split('-').map(Number);
  const b0 = new Date(Date.UTC(cy, cm - 1 + off, 1));
  const Y = b0.getUTCFullYear(), M = b0.getUTCMonth() + 1;
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
  const porDia = {};
  for (const e of ev) (porDia[e.fecha] = porDia[e.fecha] || []).push(e);
  const dias = [];
  for (let day = 1; day <= lastDay; day++) {
    const ds = iso(day), list = porDia[ds] || [];
    dias.push({
      fecha: ds, dia: day,
      chips: list.map((e) => ({ nombre: (e.paid ? '✓ ' : '') + e.f.nombre, quien: e.f.quien || 'Ambos', pagado: !!e.paid, deuda: e.deuda })),
      porPagar: list.length ? crc(C.sum(list.filter((e) => !e.paid), (e) => e.f.monto_crc)) : null,
      filas: list.map((e) => (e.deuda
        ? { deuda: true, key: `d:${e.d.id}`, quien: e.f.quien || 'Ambos', pagado: !!e.paid, nombre: (e.paid ? '✓ ' : '') + e.f.nombre, sub: `Deuda con ${e.d.persona} · se tacha en Deudas`, monto: crc(e.f.monto_crc) }
        : payRow(e.f, e.fecha, [e.f.rango, e.f.categoria].filter(Boolean).join(' · ')))),
    });
  }
  const sinFecha = act.filter((f) => f.frecuencia !== 'anual' && !f.dia && f.monto);
  const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const otros = [
    ['Anuales', B.rec.filter((f) => f.frecuencia === 'anual' && !OFF.includes(f.estado))],
    ['Terminados, sin costo o cancelados', B.rec.filter((f) => OFF.includes(f.estado))],
  ].filter(([, l]) => l.length).map(([g, list]) => ({
    titulo: g + (g === 'Anuales' ? ` · ${crc(C.sum(list, (f) => f.monto_crc))} al año` : ''),
    filas: list.slice().sort((a, b) => (a.mes || 0) - (b.mes || 0) || (a.dia || 0) - (b.dia || 0)).map((f) => ({
      off: OFF.includes(f.estado), quien: f.quien || 'Ambos',
      nombre: f.nombre + (f.estado === 'cancelado' ? ' (cancelado)' : f.estado === 'terminado' ? ' (terminado)' : ''),
      sub: [f.frecuencia === 'anual' && f.dia ? `${f.dia} ${MES3[(f.mes || 1) - 1]}` : (f.rango || (f.dia ? `Día ${f.dia}` : '')), f.quien, f.nota].filter(Boolean).join(' · '),
      monto: f.moneda === 'USD' ? usd(f.monto) : crc(f.monto),
    })),
  }));

  return {
    hoy,
    tiles: [
      { k: 'mes', lbl: 'Recurrentes al mes', num: crc(C.sum(act, (f) => f.mensual_crc)), sub: `${act.length} pagos activos · anuales repartidos en 12` },
      { k: 'q', lbl: 'Por pagar esta quincena', num: crc(C.sum(enQ, (r) => r.f.monto_crc)), sub: `${enQ.length} pago(s) hasta el ${dayShort(q.fin)}` },
      { k: 'anual', lbl: 'Pagos anuales', num: crc(C.sum(anuales, (f) => f.monto_crc)), sub: `${anuales.length} al año · ${usd(C.sum(anuales.filter((f) => f.moneda === 'USD'), (f) => f.monto))}` },
      { k: 'tc', lbl: 'Tipo de cambio', num: B.tc ? `₡${Number(B.tc.venta).toFixed(2)}` : '—', sub: B.tc ? `Venta · compra ₡${Number(B.tc.compra).toFixed(2)} · ${dayShort(B.tc.fecha)}` : '' },
    ],
    paneles: { q: panel('q'), mes: panel('mes'), anual: panel('anual') },
    cuentas,
    cal: {
      titulo: `${MESES[M - 1].charAt(0).toUpperCase()}${MESES[M - 1].slice(1)} ${Y} · ${crc(C.sum(ev, (e) => e.f.monto_crc))}`,
      mes: ym, lead: (new Date(first).getUTCDay() + 6) % 7, dias,
      inicial: hoy.slice(0, 7) === ym ? hoy : (ev.length ? ev.map((e) => e.fecha).sort()[0] : first),
      meses: MESES,
    },
    sinFecha: sinFecha.length ? `Sin fecha fija (no salen en el calendario): ${sinFecha.map((f) => `${f.nombre} ${crc(f.monto_crc)}${f.rango ? `, ${f.rango.toLowerCase()}` : ''}`).join(' · ')}.` : null,
    otros,
  };
}

// ---------- Deudas ----------
export function deudas(D, hoy, persona, filtro = null) {
  const B = base(D);
  const vivas = B.deudas.filter((d) => !B.pagDeu.has(d.id));
  const deb = vivas.filter((d) => d.direccion === 'debemos'), nos = vivas.filter((d) => d.direccion !== 'debemos');
  const sumC = (l) => C.sum(l, (d) => d.crc), sumU = (l) => C.sum(l, (d) => d.usd);
  const bal = sumC(nos) - sumC(deb);
  const montoTxt = (d) => (d.moneda === 'USD' ? `${usd(d.monto)} (${crc(d.crc)})` : `${crc(d.monto)} (${usd(d.usd)})`);
  const abonadoTxt = (d) => (d.abonado ? `Abonado ${d.moneda === 'USD' ? usd(d.abonado) : crc(d.abonado)} (${d.abonos.length} abono${d.abonos.length === 1 ? '' : 's'}) de ${d.moneda === 'USD' ? usd(d.monto_original) : crc(d.monto_original)}` : null);
  const item = (d, d0) => ({
    id: d.id, moneda: d.moneda || 'CRC', persona: d.persona,
    concepto: d.concepto + (d.fecha_limite ? ` · ${d0 ? 'antes del' : 'pagar antes del'} ${dayShort(d.fecha_limite)}` : '') + (d0 && d.de_quien !== d0.de_quien ? ` · ${d.de_quien}` : ''),
    monto: montoTxt(d), nota: d.nota || null, abonado: abonadoTxt(d),
    abonoMini: d.abonado ? `Abonado ${d.moneda === 'USD' ? usd(d.abonado) : crc(d.abonado)}` : null,
    abonoLbl: d.direccion === 'debemos' ? 'Abonar' : 'Registrar abono',
    pago: J({ id: d.id, fecha: hoy, monto: d.monto, moneda: d.moneda, fuente: '', por: persona }),
    pagoSummary: `${d.direccion === 'debemos' ? 'pagó a' : 'cobró a'} ${d.persona}: ${d.concepto}`,
  });
  const lista = vivas.filter((d) => !filtro || (filtro === 'debemos' ? d.direccion === 'debemos' : d.direccion !== 'debemos'));
  const grupos = [...C.groupBy(lista, (d) => `${d.persona}|${d.direccion}`)]
    .sort((a, b) => (a[1][0].direccion === 'debemos' ? 0 : 1) - (b[1][0].direccion === 'debemos' ? 0 : 1) || sumC(b[1]) - sumC(a[1]))
    .map(([gk, list]) => {
      const d0 = list[0], multi = list.length > 1;
      return {
        gk, persona: d0.persona, debemos: d0.direccion === 'debemos',
        pill: multi && new Set(list.map((d) => d.de_quien)).size > 1 ? 'Varios' : (d0.de_quien || 'Ambos'),
        total: `${crc(sumC(list))} · ${usd(Math.round(sumU(list) * 100) / 100)}`,
        multi,
        fija: !multi && d0.recurrente ? { cuotas: `Faltan ${d0.cuotas_faltan} de ${d0.cuotas_total} cuotas`, monto: crc(d0.crc), abonado: abonadoTxt(d0), nota: 'Baja sola con cada cuota que se marca pagada en Recurrentes, y con los pagos extra que abonés aquí.' } : null,
        items: list.map((d) => item(d, multi ? d0 : null)),
        mas: `${list.length} detalles`,
      };
    });
  const pagadas = B.deudas.filter((d) => B.pagDeu.has(d.id)).sort((a, b) => String(B.pagDeu.get(b.id).fecha).localeCompare(String(B.pagDeu.get(a.id).fecha)));
  return {
    tiles: [
      { k: 'debemos', lbl: 'Debemos', num: crc(sumC(deb)), sub: `≈ ${usd(Math.round(sumU(deb)))} · ${new Set(deb.map((d) => d.persona)).size} personas`, color: 'warn' },
      { k: 'nos', lbl: 'Nos deben', num: crc(sumC(nos)), sub: `≈ ${usd(Math.round(sumU(nos)))} · ${new Set(nos.map((d) => d.persona)).size} personas`, color: 'ok' },
      { k: 'bal', lbl: 'Balance', num: `${bal < 0 ? '−' : '+'}${crc(Math.abs(bal))}`, sub: bal < 0 ? 'Si todos pagaran hoy, todavía deberían esto' : 'Les deben más de lo que deben', color: bal < 0 ? 'bad' : 'ok' },
    ],
    titulo: filtro === 'debemos' ? 'Lo que debemos' : filtro === 'nos' ? 'Lo que nos deben' : 'Deudas',
    grupos,
    abonos: B.abonos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((a) => {
      const d = B.deudas.find((x) => x.id === a.deuda) || {};
      return { id: a.id, debemos: d.direccion === 'debemos', titulo: `${d.persona || 'Deuda'} · abono`, sub: `${d.concepto || ''} · el ${dayShort(a.fecha)}${a.por ? ` · ${a.por}` : ''}`, monto: a.moneda === 'USD' ? usd(a.monto) : crc(a.monto), summary: `deshace abono a ${d.persona}` };
    }),
    pagadas: pagadas.map((d) => {
      const pg = B.pagDeu.get(d.id);
      return { id: d.id, debemos: d.direccion === 'debemos', titulo: `${d.persona} · ${d.concepto}`,
        sub: `${d.direccion === 'debemos' ? 'Pagamos' : 'Nos pagó'} · ${d.de_quien || 'Ambos'} · el ${dayShort(pg.fecha)}${pg.fuente ? ` · con ${pg.fuente.toLowerCase() === 'préstamo' ? 'el préstamo' : pg.fuente}` : ''}`,
        monto: d.moneda === 'USD' ? usd(d.monto) : crc(d.monto), otro: d.moneda === 'USD' ? crc(d.crc) : usd(d.usd), summary: `deshace: ${d.persona} · ${d.concepto}` };
    }),
    personas: [...new Set(B.deudas.map((d) => d.persona))],
  };
}

// Abono a una deuda (pago parcial).
export function abono(D, hoy, persona, deudaId, montoTxt, id) {
  const B = base(D);
  const d = B.deudas.find((x) => x.id === deudaId);
  const v = Number(String(montoTxt).replace(/[^\d.]/g, ''));
  if (!d || !v) return { error: 'Poné el monto.' };
  return { recText: J({ id, deuda: d.id, fecha: hoy, monto: v, moneda: d.moneda, fuente: '', por: persona }), summary: `abono a ${d.persona}: ${d.moneda === 'USD' ? '$' : '₡'}${v}` };
}

// Deuda nueva desde la app.
export function nuevaDeuda(st, persona, id) {
  const monto = Number(String(st.monto).replace(/[^\d.]/g, ''));
  if (!String(st.persona || '').trim() || !String(st.concepto || '').trim() || !monto) return { error: 'Falta la persona, el concepto o el monto.' };
  const rec = { id, persona: nombrePropio(st.persona), direccion: st.dir, de_quien: st.quien, concepto: st.concepto.trim(), monto, moneda: st.moneda, fecha_limite: st.fecha || '', estado: 'pendiente', nota: `Agregada desde la app por ${persona}` };
  return { recText: J(rec), summary: `nueva deuda: ${st.persona.trim()} · ${st.concepto.trim()}` };
}

// Actualizar el saldo de una cuenta.
export function saldoCuenta(D, hoy, cuentaId, montoTxt) {
  const c = (D.cuentas || []).find((x) => x.id === cuentaId);
  const v = Number(String(montoTxt).replace(/[^\d.-]/g, ''));
  if (!c || !String(montoTxt).trim() || Number.isNaN(v)) return { error: 'Poné el saldo.' };
  return { recText: J({ id: c.id, saldo: v, fecha: hoy }), summary: `saldo de ${c.nombre}: ${c.moneda === 'USD' ? '$' : '₡'}${v}` };
}
