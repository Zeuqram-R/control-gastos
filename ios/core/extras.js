// Metas, lista de deseos, Santo Coco, Tu año y Facturas para la app de iPhone: mismos cálculos, textos y
// registros que js/views/metas.js, negocio.js, anio.js y facturas.js. Si cambian en la web, reflejarlo aquí.
import { crc, dayShort, addDays, MESES, nombrePropio } from '../../js/ui.js';
import * as C from '../../js/calc.js';

const J = (o) => JSON.stringify(o);
const neg = (v) => `${v < 0 ? '−' : ''}${crc(Math.abs(v))}`;
const PRIOS = [[1, 'Ya'], [2, 'Pronto'], [3, 'Algún día']];
const prioTxt = (p) => (PRIOS.find(([v]) => v === (p || 2)) || PRIOS[1])[1];

// ---------- Metas ----------
export function metas(D, hoy) {
  const ms = C.metasInfo(D, hoy);
  const P = ms.some((m) => m.falta) ? C.proyeccion(D, hoy, 24) : null;
  const F = C.fondoAhorro(D);
  const archivadas = (D.metas || []).filter((m) => m.estado === 'archivada');
  const totalAp = C.sum(ms, (m) => m.ahorrado), totalMeta = C.sum(ms, (m) => m.meta), totalQ = C.sum(ms, (m) => m.estaQ);
  const deseos = (D.deseos || []).filter((d) => !d.estado || d.estado === 'pendiente').sort((a, b) => (a.prioridad || 2) - (b.prioridad || 2) || String(a.creado).localeCompare(String(b.creado)));
  const hechos = (D.deseos || []).filter((d) => d.estado === 'comprado' || d.estado === 'meta');
  const totalD = C.sum(deseos, (d) => d.precio || 0);
  return {
    tiles: ms.length ? [
      { lbl: 'Apartado', num: crc(totalAp), sub: `de ${crc(totalMeta)} en ${ms.length} meta(s)` },
      { lbl: 'Esta quincena', num: crc(totalQ), sub: totalQ ? 'Lo que falta apartar' : 'Todo al día' },
      ...(F.cuentas.length ? [{ lbl: 'Fondo de ahorro', num: crc(F.total), sub: 'Se actualiza en Recurrentes → Cuentas' }] : []),
    ] : [],
    metas: ms.map((m) => {
      const n = P ? P.futuras.find((r) => r.q.inicio <= m.fecha && r.queda < 0) : null;
      return {
        id: m.id, nombre: m.nombre, pct: m.pct, lista: !!m.lista, vencida: !!m.vencida, estaQ: m.estaQ || 0,
        sub: `${crc(m.meta)} para el ${dayShort(m.fecha)} ${String(m.fecha).slice(0, 4)}`,
        stats: [
          { lbl: 'Apartado', num: crc(m.ahorrado), sub: `${Math.round(m.pct * 100)}% de la meta` },
          m.lista ? { lbl: '¡Listo!', num: '🎉', sub: 'Ya se juntó todo' } : { lbl: m.vencida ? 'Faltó' : 'Falta', num: crc(m.falta), sub: m.vencida ? 'La fecha ya pasó' : `${m.n} quincena(s) hasta el ${dayShort(m.fecha)}`, color: m.vencida ? 'bad' : null },
          ...(m.lista || m.vencida ? [] : [
            { lbl: 'Esta quincena', num: crc(m.estaQ), sub: m.enActual ? `Ya apartaron ${crc(m.enActual)}` : `Después, ${crc(m.porQ)} por quincena` },
            { lbl: '¿Alcanza?', num: n ? 'Justo no' : 'Sí', sub: n ? `La quincena del ${dayShort(n.q.inicio)} quedaría en −${crc(-n.queda)}` : 'La proyección aguanta', color: n ? 'warn' : 'ok' },
          ]),
        ],
        sugerido: m.estaQ ? `Lo sugerido para esta quincena: ${crc(m.estaQ)}.` : null,
        aportes: (m.aportes || []).slice().reverse().map((a) => ({ titulo: `${dayShort(a.fecha)} · ${a.por || ''}`, sub: a.fuente === 'Fondo' ? 'Ya estaba ahorrado' : 'De la quincena', monto: crc(Number(a.monto)) })),
        quitarLbl: m.lista ? 'Archivar (ya se cumplió)' : 'Quitar esta meta',
      };
    }),
    archivadas: archivadas.map((m) => ({ id: m.id, nombre: m.nombre, sub: `${crc(C.sum(m.aportes || [], (a) => Number(a.monto) || 0))} de ${crc(Number(m.monto) || 0)} · ${dayShort(m.fecha)}` })),
    deseos: {
      nota: `${deseos.length} cosa(s)${totalD ? ` · unos ${crc(totalD)} en total` : ''}. Tocá una para editarla; "Meta" la convierte en meta de ahorro.`,
      lista: deseos.map((d) => ({
        id: d.id, nombre: d.nombre, foto: d.foto || null, prioridad: d.prioridad || 2, precio: d.precio || null, para: d.para || 'Ambos', nota: d.nota || '',
        precioTxt: d.precio ? crc(d.precio) : '—',
        sub: [prioTxt(d.prioridad), d.para && d.para !== 'Ambos' ? `para ${d.para}` : null, d.nota].filter(Boolean).join(' · '),
        raw: J(d),
      })),
      hechos: hechos.map((d) => ({ id: d.id, nombre: d.nombre, sub: d.estado === 'meta' ? 'Se volvió meta de ahorro' : `Comprado el ${dayShort(d.comprado)}`, precio: d.precio ? crc(d.precio) : '' })),
    },
  };
}

// Meta nueva (opcionalmente desde un deseo).
export function nuevaMeta(D, st, hoy, persona, id) {
  const monto = Number(String(st.monto).replace(/[^\d]/g, ''));
  if (!String(st.nombre || '').trim() || !monto || !st.fecha) return { error: 'Llená los tres datos.' };
  const nombre = st.nombre.trim();
  return {
    recText: J({ id, nombre, monto, fecha: st.fecha, creada: hoy, por: persona, aportes: [], ...(st.deseo ? { deseo: st.deseo } : {}) }),
    summary: `nueva meta: ${nombre}`,
    deseoText: st.deseo ? J({ id: st.deseo, estado: 'meta', meta: id }) : null,
    deseoSummary: `deseo → meta: ${nombre}`,
  };
}

// Apartar para una meta: se agrega el aporte; si sale de la quincena, se suma al fondo de ahorro.
export function apartar(D, metaId, montoTxt, de, hoy, persona) {
  const m = (D.metas || []).find((x) => x.id === metaId);
  const info = C.metasInfo(D, hoy).find((x) => x.id === metaId);
  const monto = Number(String(montoTxt || (info && info.estaQ) || '').replace(/[^\d]/g, ''));
  if (!m || !monto) return { error: 'Poné cuánto.' };
  const aportes = [...(m.aportes || []), { fecha: hoy, monto, por: persona, fuente: de }];
  const fondo = (D.cuentas || []).find((c) => c.tipo === 'ahorro' && c.moneda !== 'USD');
  return {
    recText: J({ id: m.id, aportes }), summary: `aparta ${crc(monto)} para ${m.nombre}`,
    fondoText: fondo && de === 'Salario' ? J({ id: fondo.id, saldo: (Number(fondo.saldo) || 0) + monto, fecha: hoy }) : null,
    fondoSummary: `fondo +${crc(monto)}`,
    toast: `Apartado ${crc(monto)} para «${m.nombre}».`,
  };
}

// Guardar un deseo (nuevo o editado). foto: ruta nueva, "" para quitarla, null para dejar la que tenía.
export function guardarDeseo(D, st, hoy, persona, id, foto) {
  if (!String(st.nombre || '').trim()) return { error: '¿Qué quieren comprar?' };
  const d = st.id ? (D.deseos || []).find((x) => x.id === st.id) : null;
  const precio = Math.round(Number(String(st.precio || '').replace(/[^\d]/g, ''))) || null;
  const rec = { id: d?.id || id, nombre: st.nombre.trim(), precio, prioridad: Number(st.prioridad) || 2, para: st.para || 'Ambos', nota: String(st.nota || '').trim(), creado: d?.creado || hoy, por: d?.por || persona, estado: 'pendiente', foto: foto === '' ? null : (foto || d?.foto || null) };
  return { recText: J(rec), id: rec.id, nombre: rec.nombre, summary: `${d ? 'edita' : 'agrega'} deseo: ${rec.nombre}` };
}

// ---------- Santo Coco ----------
export function negocio(D, hoy, off = 0) {
  const base = C.negocioInfo(D, hoy.slice(0, 7));
  const primero = base.meses[0] || hoy.slice(0, 7);
  const meses = [];
  for (let [y, m] = primero.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= hoy.slice(0, 7); m === 12 ? (y++, m = 1) : m++) meses.push(`${y}-${String(m).padStart(2, '0')}`);
  const o = Math.max(0, Math.min(off, meses.length - 1));
  const mes = meses[meses.length - 1 - o];
  const N = C.negocioInfo(D, mes);
  const nomMes = `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
  return {
    off: o, max: meses.length - 1,
    titulo: nomMes.charAt(0).toUpperCase() + nomMes.slice(1),
    sub: `${N.nVentas} venta(s) · ${N.movs.length - N.nVentas} gasto(s)`,
    stats: [
      { lbl: 'Ventas', num: crc(N.ventasMes), sub: N.nVentas ? `Promedio ${crc(N.ventasMes / N.nVentas)} por venta` : 'Sin ventas este mes', color: 'ok' },
      { lbl: 'Gastos', num: crc(N.gastosMes), sub: 'Insumos, empaque, transporte…' },
      { lbl: N.ganancia < 0 ? 'Pérdida' : 'Ganancia', num: neg(N.ganancia), sub: 'Ventas − gastos del mes', color: N.ganancia < 0 ? 'bad' : 'ok' },
      { lbl: 'Caja del negocio', num: crc(N.caja), sub: `Ventas − lo pagado con la caja (todo el tiempo)${N.puestoCasa ? ` · la casa ha puesto ${crc(N.puestoCasa)}` : ''}` },
    ],
    porCat: N.porCat,
    movs: N.movs.map((m) => ({
      id: m.id, venta: m.clase === 'venta',
      titulo: m.clase === 'venta' ? (m.detalle || 'Venta') : m.comercio,
      sub: [dayShort(m.fecha), m.clase === 'venta' ? m.cobro : m.categoria, m.clase === 'venta' ? m.quien : (m.fuente === C.CAJA_NEGOCIO ? 'caja del negocio' : `plata de la casa (${m.fuente})`)].filter(Boolean).join(' · '),
      monto: `${m.clase === 'venta' ? '+' : '−'}${crc(m.monto)}`,
    })),
  };
}

export function venta(st, id) {
  const n = Math.round(Number(String(st.monto).replace(/[^\d.]/g, '')));
  if (!n) return { error: 'Poné el monto.' };
  return { recText: J({ id, tipo: 'venta', fecha: st.fecha, monto: n, detalle: String(st.detalle || '').trim(), cobro: st.cobro, quien: st.quien }), summary: `venta Santo Coco ${crc(n)}`, toast: `Venta anotada: ${crc(n)}` };
}

// ---------- Tu año ----------
function ingresosAnio(D, anio, desde, hasta) {
  const netos = C.ingresosNetos(D.ingresos || []);
  let total = 0, n = 0;
  for (let q = C.quincenaDe(desde); q.inicio <= hasta; q = C.quincenaDe(addDays(q.fin, 1))) {
    if (q.inicio.slice(0, 4) === String(anio)) { total += C.sum(netos.filter((r) => r.quincena === q.numero), (r) => r.neto); n++; }
  }
  const agui = C.aguinaldoDe(D.ingresos || [], anio).filter((a) => a.fecha <= hasta);
  return { total: total + C.sum(agui, (a) => a.neto), aguinaldo: C.sum(agui, (a) => a.neto), quincenas: n };
}

export function anio(D, hoy, Y0) {
  const movsTodos = C.movimientos(D);
  const anios = [...new Set(movsTodos.map((m) => Number(m.fecha.slice(0, 4))))].sort();
  if (!anios.length) return { vacio: 'Todavía no hay movimientos.' };
  const Y = Y0 && anios.includes(Y0) ? Y0 : anios[anios.length - 1], ys = String(Y);
  const movs = movsTodos.filter((m) => m.fecha.startsWith(ys));
  const total = C.sum(movs, (m) => m.monto);
  const primera = movs.map((m) => m.fecha).sort()[0];
  const hasta = ys === hoy.slice(0, 4) ? hoy : `${ys}-12-31`;
  const ing = ingresosAnio(D, Y, primera, hasta);
  const porMes = MESES.map((m, i) => ({ label: m.slice(0, 3), total: C.sum(movs.filter((x) => Number(x.fecha.slice(5, 7)) === i + 1), (x) => x.monto) })).filter((r, i) => r.total || (i + 1 >= Number(primera.slice(5, 7)) && `${ys}-${String(i + 1).padStart(2, '0')}` <= hasta.slice(0, 7)));
  const porCat = [...C.groupBy(movs, (m) => m.categoria)].map(([c, l]) => ({ label: c, total: C.sum(l, (m) => m.monto) })).sort((a, b) => b.total - a.total);
  const mayor = movs.slice().sort((a, b) => b.monto - a.monto)[0];
  const aportes = (D.metas || []).flatMap((m) => (m.aportes || []).filter((a) => String(a.fecha).startsWith(ys)).map((a) => ({ ...a, meta: m.nombre })));
  const ahorrado = C.sum(aportes, (a) => Number(a.monto) || 0);
  const cumplidas = C.metasInfo(D, hoy).filter((m) => m.lista).concat((D.metas || []).filter((m) => m.estado === 'archivada' && C.sum(m.aportes || [], (a) => Number(a.monto) || 0) >= Number(m.monto)));
  const metaGrande = cumplidas.sort((a, b) => (Number(b.monto) || 0) - (Number(a.monto) || 0))[0];
  const compras = (D.compras || []).filter((r) => String(r.fecha).startsWith(ys));
  const superTotal = C.sum(compras, (r) => Number(r.total) || 0);
  const veces = [...C.groupBy(compras, (r) => r.clave)].map(([, l]) => ({ producto: l[l.length - 1].producto, n: new Set(l.map((r) => String(r.fecha).slice(0, 10))).size, total: C.sum(l, (r) => Number(r.total) || 0) })).sort((a, b) => b.n - a.n || b.total - a.total);
  const lugares = [...C.groupBy(compras, (r) => r.supermercado)].map(([k, l]) => ({ label: k, total: C.sum(l, (r) => Number(r.total) || 0) })).sort((a, b) => b.total - a.total);
  const iva = C.sum(compras, (r) => { const t = Number(r.total) || 0, p = Number(r.iva_pct) || 0; return t - t / (1 + p / 100); });
  const deudas = C.sum(movs.filter((m) => m.gtipo === 'Deudas'), (m) => m.monto);
  const ubers = movs.filter((m) => m.tipo === 'gasto' && /uber|didi|taxi/i.test(m.titulo));
  const N = C.negocioInfo(D, ys);
  const ventasAnio = C.sum(N.ventas.filter((v) => v.fecha.startsWith(ys)), (v) => v.monto);
  const gastosNeg = C.sum(N.gastos.filter((g) => g.fecha.startsWith(ys)), (g) => g.monto);
  const dato = (emoji, titulo, valor, sub) => ({ emoji, titulo, valor, sub });
  return {
    anio: Y, min: anios[0], max: anios[anios.length - 1],
    titulo: `Tu ${Y}`, sub: ys === hoy.slice(0, 4) ? `Desde el ${dayShort(primera)} hasta hoy` : `Desde el ${dayShort(primera)}`,
    stats: [
      { lbl: 'Se gastó', num: crc(total), sub: `${movs.length} movimientos` },
      { lbl: 'Entró (salario)', num: crc(ing.total), sub: `${ing.quincenas} quincena(s)${ing.aguinaldo ? ` + aguinaldo ${crc(ing.aguinaldo)}` : ''}`, color: 'ok' },
      { lbl: 'Apartado para metas', num: crc(ahorrado), sub: `${aportes.length} aporte(s)${cumplidas.length ? ` · ${cumplidas.length} meta(s) cumplida(s)` : ''}` },
      { lbl: 'Deudas pagadas', num: crc(deudas), sub: 'Pagos y abonos' },
    ],
    porMes, porCat: porCat.slice(0, 8), masCats: porCat.length > 8 ? `Y ${porCat.length - 8} categoría(s) más.` : null,
    datos: [
      mayor ? dato('💸', 'El gasto más grande', crc(mayor.monto), `${mayor.titulo} · ${dayShort(mayor.fecha)}`) : null,
      veces[0] ? dato('🛒', 'Lo que más compraron', veces[0].producto, `${veces[0].n} ${veces[0].n === 1 ? 'vez' : 'veces'} · ${crc(veces[0].total)}`) : null,
      lugares[0] ? dato('🏪', 'Donde más compraron', lugares[0].label, crc(lugares[0].total)) : null,
      superTotal ? dato('🧾', 'IVA pagado en el súper', crc(iva), `de ${crc(superTotal)} en compras`) : null,
      ubers.length ? dato('🚗', 'Viajes en Uber', String(ubers.length), crc(C.sum(ubers, (m) => m.monto))) : null,
      metaGrande ? dato('🏁', 'La meta más grande cumplida', metaGrande.nombre, crc(Number(metaGrande.monto) || 0)) : null,
      ventasAnio || gastosNeg ? dato('🥥', 'Santo Coco', crc(ventasAnio - gastosNeg), `Ventas ${crc(ventasAnio)} − gastos ${crc(gastosNeg)}`) : null,
    ].filter(Boolean),
    top: veces.length > 1 ? veces.slice(0, 5).map((v, i) => ({ rank: i + 1, producto: v.producto, sub: `${v.n} compra(s)`, monto: crc(v.total) })) : [],
  };
}

// ---------- Facturas ----------
export function facturas(D, enBandeja) {
  const pend = (D.pendientes || []).filter((p) => (p.estado || 'abierta') === 'abierta' && p.respuesta == null);
  const procesadas = (D.facturas || []).slice().sort((a, b) => String(b.procesada || b.fecha).localeCompare(String(a.procesada || a.fecha)));
  return {
    preguntas: pend.map((p) => ({ id: p.id, pregunta: p.pregunta, detalle: p.detalle || null, opciones: p.opciones || [], texto: p.permite_texto !== false })),
    lugares: (D.lugares || []).map((l) => l.nombre).filter(Boolean),
    bandeja: enBandeja.map((id) => ({ id, titulo: `Factura ${id.slice(0, 10)}`, sub: 'En GitHub, Claude la está procesando (unos minutos)' })),
    lista: procesadas.slice(0, 20).map((f) => ({
      estado: f.estado === 'error' ? 'bad' : f.estado === 'con preguntas' ? 'work' : f.estado === 'duplicada' ? 'wait' : 'ok',
      titulo: `${f.lugar || 'Factura'}${f.fecha ? ` · ${dayShort(f.fecha)}` : ''}`,
      sub: [f.articulos ? `${f.articulos} artículos` : null, f.estado === 'con preguntas' ? 'tiene preguntas' : f.estado === 'error' ? (f.resumen || 'no se pudo leer') : f.resumen].filter(Boolean).join(' · '),
      total: f.total != null ? crc(f.total) : null,
    })),
  };
}

// La ficha que acompaña las fotos (Claude la lee al procesar).
export function fichaFactura(st, persona, dispositivo, id, nombres, subida) {
  const ficha = { id, subida, subido_por: persona, dispositivo, lugar: nombrePropio(st.lugar || ''), fuente: st.fuente, quien_pago: st.quien, nota: String(st.nota || '').trim(), archivos: nombres, ...(st.negocio ? { negocio: 'Santo Coco' } : {}) };
  const resumen = `${ficha.lugar || 'Factura'} · ${nombres.length} foto(s) · ${ficha.fuente}`;
  return { texto: JSON.stringify(ficha, null, 1) + '\n', resumen, message: `${persona} (${dispositivo}): factura ${resumen}` };
}

export function respuesta(D, id, txt, persona, ahora) {
  const t = String(txt || '').trim();
  const q = (D.pendientes || []).find((x) => x.id === id);
  if (!t) return { error: 'Escribí la respuesta.' };
  return { recText: J({ id, respuesta: t, respondido_por: persona, respondido_en: ahora, estado: 'respondida' }), summary: `responde: ${String(q?.pregunta || '').slice(0, 50)}` };
}
