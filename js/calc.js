// Cálculos del control (sin interfaz). Reciben los datos tal como están en el repo.
import { addDays, daysBetween } from './ui.js';

const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const mean = (arr) => (arr.length ? sum(arr) / arr.length : null);
const groupBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const d10 = (s) => String(s || '').slice(0, 10);
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

export const CATS = ['Súper', 'Casa', 'Servicios', 'Suscripciones y pagos recurrentes', 'Weed', 'Vapos', 'Salidas', 'Emergencias'];
export const CAT_SUB = { 'Súper': 'Supermercados, chino, pulperías y feria' };

// Quincenas de pago de Ali: del 12 al 25 y del 26 al 11.
export function quincenaDe(fecha) {
  const [y, m, d] = d10(fecha).split('-').map(Number);
  const ini = d >= 26 ? [y, m, 26] : d >= 12 ? [y, m, 12] : (m === 1 ? [y - 1, 12, 26] : [y, m - 1, 26]);
  const inicio = iso(...ini);
  const fin = ini[2] === 12 ? iso(ini[0], ini[1], 25) : iso(ini[0], ini[1] + 1, 11);
  return { inicio, fin, numero: ini[2] === 12 ? 1 : 2, dias: daysBetween(inicio, fin) + 1 };
}

export function ultimoTC(tipoCambio) {
  return tipoCambio.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).pop() || null;
}

export function resumenMes(gastos) {
  const mes = gastos.map((g) => d10(g.fecha).slice(0, 7)).sort().pop() || '';
  const delMes = gastos.filter((g) => d10(g.fecha).slice(0, 7) === mes);
  const s = (t) => sum(delMes.filter((g) => !t || g.tipo === t), (g) => g.monto);
  return { mes, total: s(), fijo: s('Fijo'), variable: s('Variable'), una_vez: s('Una vez'), pendiente: s('Pendiente'), n: delMes.length, n_pend: delMes.filter((g) => g.tipo === 'Pendiente').length };
}

export function quincenas(gastos, presupuestos) {
  const presu = presupuestos.filter((r) => r.desde && r.monto).sort((a, b) => String(a.desde).localeCompare(String(b.desde)));
  const out = [];
  for (const [inicio, gs] of groupBy(gastos, (g) => quincenaDe(g.fecha).inicio)) {
    const q = quincenaDe(inicio);
    for (const [cat, list] of [['General', gs], ...groupBy(gs, (g) => g.categoria)]) {
      const pr = presu.filter((r) => (r.categoria || 'General') === cat && d10(r.desde) <= inicio).pop();
      out.push({
        inicio, fin: q.fin, categoria: cat,
        gastado: sum(list, (g) => g.monto),
        salario: sum(list.filter((g) => g.fuente !== 'Wink'), (g) => g.monto),
        wink: sum(list.filter((g) => g.fuente === 'Wink'), (g) => g.monto),
        n: list.length, presupuesto: pr ? Number(pr.monto) : null,
      });
    }
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.categoria.localeCompare(b.categoria));
}

export function presupuestoVigente(presupuestos, cat, inicio) {
  const pr = presupuestos.filter((r) => r.desde && r.monto && (r.categoria || 'General') === cat && d10(r.desde) <= inicio)
    .sort((a, b) => String(a.desde).localeCompare(String(b.desde))).pop();
  return pr ? Number(pr.monto) : null;
}

export function ingresosNetos(ingresos) {
  return ingresos.map((r) => {
    const bruto = Number(r.bruto) || 0;
    const ded = Math.round(bruto * (Number(r.deduccion_pct) || 0) / 100);
    return { ...r, quincena: Number(r.quincena), bruto, deduccion: ded, neto: bruto - ded };
  });
}

export function recurrentesCRC(recurrentes, tc) {
  const venta = tc ? Number(tc.venta) : null;
  return recurrentes.map((f) => {
    const m = Number(f.monto) || 0;
    const c = f.moneda === 'USD' ? (venta ? m * venta : null) : m;
    const div = f.frecuencia === 'anual' ? 12 : f.frecuencia === 'semestral' ? 6 : 1;
    return { ...f, monto: m, dia: Number(f.dia) || null, mes: Number(f.mes) || null, monto_crc: c == null ? null : Math.round(c), mensual_crc: c == null ? null : Math.round(c / div) };
  });
}

export function deudasCRC(deudas, tc) {
  const venta = tc ? Number(tc.venta) : null;
  return deudas.filter((d) => d.estado !== 'pagado').map((d) => {
    const m = Number(d.monto) || 0;
    return { ...d, monto: m, crc: d.moneda === 'USD' ? (venta ? Math.round(m * venta) : null) : m, usd: d.moneda === 'USD' ? m : (venta ? Math.round((m / venta) * 100) / 100 : null) };
  });
}

export function saldosCRC(saldos, tc) {
  const compra = tc ? Number(tc.compra) : null;
  return saldos.map((s) => ({ ...s, monto: Number(s.monto), crc: s.moneda === 'USD' ? (compra ? Math.round(Number(s.monto) * compra) : null) : Number(s.monto) }));
}

// Próxima fecha de pago de un recurrente desde una fecha dada.
export function proximoPago(f, desde) {
  if (!f.dia || ['cancelado', 'sin costo', 'terminado'].includes(f.estado)) return null;
  const okRango = (d) => ((!f.hasta || d <= d10(f.hasta)) && (!f.desde || d >= d10(f.desde)) ? d : null);
  if (f.desde && desde < d10(f.desde)) desde = d10(f.desde);
  const [y, m] = desde.split('-').map(Number);
  const mk = (yy, mm) => { const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); return iso(yy, mm, Math.min(f.dia, last)); };
  if (f.frecuencia === 'anual' && f.mes) { const a = mk(y, f.mes); return okRango(a >= desde ? a : mk(y + 1, f.mes)); }
  const a = mk(y, m);
  return okRango(a >= desde ? a : (m === 12 ? mk(y + 1, 1) : mk(y, m + 1)));
}

// Balance de la quincena: lo que entra, lo que hay que pagar, lo gastado y lo que queda.
export function balanceQuincena(D, hoy) {
  const q = quincenaDe(hoy);
  const tc = ultimoTC(D.tipo_cambio);
  const ing = ingresosNetos(D.ingresos).filter((r) => r.quincena === q.numero);
  const neto = sum(ing, (r) => r.neto), bruto = sum(ing, (r) => r.bruto);
  const saldos = saldosCRC(D.saldos, tc);
  const saldo = sum(saldos, (s) => s.crc);
  const pagRec = new Map(D.pagos_recurrentes.map((p) => [p.id, p]));
  const pagDeu = new Map(D.pagos_deudas.map((p) => [p.id, p]));
  const activos = recurrentesCRC(D.recurrentes, tc).filter((f) => !['cancelado', 'sin costo', 'terminado'].includes(f.estado));
  const porPagar = activos.map((f) => ({ ...f, prox: proximoPago(f, hoy) }))
    .filter((f) => f.prox && f.prox <= q.fin && !pagRec.has(`${f.id}_${f.prox}`));
  const deudas = deudasCRC(D.deudas, tc);
  const deudasQ = deudas.filter((d) => !pagDeu.has(d.id) && d.direccion === 'debemos' && d.fecha_limite && d10(d.fecha_limite) <= q.fin);
  const tachRec = [...pagRec.values()].filter((r) => r.vence && r.vence >= q.inicio && r.vence <= q.fin);
  const tachDeu = deudas.filter((d) => d.direccion === 'debemos' && pagDeu.has(d.id) && d10(pagDeu.get(d.id).fecha) >= q.inicio && d10(pagDeu.get(d.id).fecha) <= q.fin);
  const tachado = sum(tachRec, (r) => r.monto_crc) + sum(tachDeu, (d) => d.crc);
  const gs = D.gastos.filter((g) => d10(g.fecha) >= q.inicio && d10(g.fecha) <= q.fin);
  const wink = sum(gs.filter((g) => g.fuente === 'Wink'), (g) => g.monto);
  const gastado = sum(gs, (g) => g.monto) + tachado;
  const fijos = sum(porPagar, (f) => f.monto_crc), deu = sum(deudasQ, (d) => d.crc);
  return {
    q, tc, ing, neto, bruto, saldos, saldo, porPagar, deudasQ, fijos, deu, tachado, gastado, wink,
    sinFecha: activos.filter((f) => !f.dia).length,
    queda: neto + saldo - fijos - deu - (gastado - wink),
  };
}

const refPrecio = (r, p = {}) => {
  const c = Number(p.contenido) || 0, pu = Number(r.precio_unitario);
  if (r.unidad === 'kg') return { v: pu, u: 'kg' };
  if (!c) return { v: pu, u: 'un' };
  if (p.medida === 'g') return { v: (pu / c) * 1000, u: 'kg' };
  if (p.medida === 'mL') return { v: (pu / c) * 1000, u: 'L' };
  return { v: pu / c, u: 'un' };
};
export { refPrecio };

// Perfil de cada producto a partir de las compras.
export function catalogo(compras, productos) {
  const info = new Map(productos.map((p) => [p.clave, p]));
  return [...groupBy(compras, (d) => d.clave)].map(([clave, filas]) => {
    const p = info.get(clave) || {};
    const orden = filas.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.id).localeCompare(String(b.id)));
    const ultimos = [...groupBy(orden, (d) => d.supermercado)].map(([s, f]) => ({ s, p: Number(f[f.length - 1].precio_unitario), ref: refPrecio(f[f.length - 1], p) }));
    const mejor = ultimos.reduce((a, b) => (b.ref.v < a.ref.v ? b : a));
    const peor = ultimos.reduce((a, b) => (b.ref.v > a.ref.v ? b : a));
    const first = Number(orden[0].precio_unitario), last = Number(orden[orden.length - 1].precio_unitario);
    const fechas = [...new Set(orden.map((d) => d10(d.fecha)))];
    const gaps = fechas.slice(1).map((f, i) => daysBetween(fechas[i], f));
    return {
      clave, producto: p.producto || orden[orden.length - 1].producto, grupo: p.grupo || p.producto || '', categoria: p.categoria || orden[0].categoria,
      n_supers: ultimos.length, ahorro: peor.p - mejor.p, gasto_total: sum(orden, (d) => d.total), iva: Number(orden[orden.length - 1].iva_pct) || null,
      otros_nombres: p.otros_nombres || [], alternativa: p.alternativa_1 || '',
      dueno: p.dueno || 'Casa', ubicacion: p.ubicacion || '', unidad: orden[0].unidad,
      perecedero: p.perecedero === true || p.perecedero === 'si', vida_util_dias: Number(p.vida_util_dias) || null,
      compras: fechas.length, primera: fechas[0], ultima: fechas[fechas.length - 1],
      mejor_precio: mejor.p, mejor_ref: Math.round(mejor.ref.v), ref_u: mejor.ref.u, mejor_super: mejor.s,
      cambio_pct: first ? (last - first) / first : 0,
      cada_dias: gaps.length ? Math.round(mean(gaps)) : null,
    };
  }).sort((a, b) => a.producto.localeCompare(b.producto));
}

const eventosDe = (eventos, clave) => eventos.filter((e) => e.clave === clave).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

export function vencimientos(cat, eventos) {
  const out = [];
  for (const p of cat) {
    if (!p.perecedero || !p.vida_util_dias) continue;
    const evs = eventosDe(eventos, p.clave).filter((e) => d10(e.fecha) >= p.ultima);
    const last = evs[evs.length - 1];
    const tipo = last ? String(last.evento).toLowerCase() : '';
    if (['terminado', 'congelado', 'botado'].includes(tipo)) continue;
    const desde = tipo === 'cocinado' ? d10(last.fecha) : p.ultima;
    const dias = tipo === 'cocinado' ? (Number(last.vida_dias) || 3) : p.vida_util_dias;
    out.push({ ...p, sobras: tipo === 'cocinado', desde, dias, vence: addDays(desde, dias) });
  }
  return out.sort((a, b) => a.vence.localeCompare(b.vence));
}

// Lista del súper: lo que se acabó, lo que se acaba pronto, lo que vence y lo pedido a mano.
export function listaCompras(compras, cat, eventos, lista, hoy) {
  const out = new Map();
  const put = (key, row) => { const prev = out.get(key); if (!prev || row.pr < prev.pr) out.set(key, row); };
  const lim7 = addDays(hoy, 7), lim3 = addDays(hoy, 3);
  for (const p of cat) {
    const ev = eventosDe(eventos, p.clave);
    const fechas = [...new Set(compras.filter((r) => r.clave === p.clave).map((r) => d10(r.fecha)))].sort();
    const durs = ev.filter((e) => String(e.evento).toLowerCase() === 'terminado').map((e) => {
      const desde = fechas.filter((f) => f <= d10(e.fecha)).pop();
      return desde ? daysBetween(desde, e.fecha) : null;
    }).filter((x) => x != null);
    const despues = ev.filter((e) => d10(e.fecha) >= p.ultima);
    const last = despues[despues.length - 1];
    const tipo = last ? String(last.evento).toLowerCase() : '';
    const base = { key: p.clave, clave: p.clave, producto: p.producto, mejor_super: p.mejor_super, mejor_precio: p.mejor_precio, unidad: p.unidad, dueno: p.dueno };
    if (tipo === 'terminado' || tipo === 'botado') { put(p.clave, { ...base, pr: 0, motivo: 'falta', detalle: `${tipo === 'botado' ? 'Se botó' : 'Se acabó'} el ${d10(last.fecha)}` }); continue; }
    if (tipo === 'congelado') continue;
    const dura = durs.length ? Math.round(mean(durs)) : p.cada_dias;
    if (dura) { const f = addDays(p.ultima, dura); if (f <= lim7) put(p.clave, { ...base, pr: 1, motivo: 'pronto', detalle: `Suele durar ~${dura} días`, fecha: f }); }
    if (p.perecedero && p.vida_util_dias) {
      const desde = tipo === 'cocinado' ? d10(last.fecha) : p.ultima;
      const dias = tipo === 'cocinado' ? (Number(last.vida_dias) || 3) : p.vida_util_dias;
      const f = addDays(desde, dias);
      if (f <= lim3) put(p.clave, { ...base, pr: 1, motivo: 'vence', detalle: `${tipo === 'cocinado' ? 'Las sobras vencen' : 'Vence'} aprox. el ${f}`, fecha: f });
    }
  }
  for (const l of lista.filter((x) => (x.tipo || 'pedido') === 'pedido')) {
    const p = l.clave ? cat.find((c) => c.clave === l.clave) : null;
    if (p && p.ultima >= d10(l.fecha)) continue; // ya se compró después de pedirlo
    const key = l.clave || `manual:${l.id}`;
    put(key, {
      key, clave: l.clave || '', pedidoId: l.id, producto: p ? p.producto : l.texto,
      mejor_super: p ? p.mejor_super : '', mejor_precio: p ? p.mejor_precio : null, unidad: p ? p.unidad : '', dueno: p ? p.dueno : '',
      pr: 2, motivo: 'pedido', detalle: `Lo pidió ${l.por || 'alguien'}${l.cantidad ? ` · ${l.cantidad}` : ''}${l.nota ? ` · ${l.nota}` : ''}`, fecha: d10(l.fecha),
    });
  }
  // Tachados mientras se compra (compartidos entre los dos); dejan de contar cuando entra una compra nueva.
  const marcas = new Map(lista.filter((x) => x.tipo === 'marcado').map((m) => [m.key, m]));
  return [...out.values()].map((r) => {
    const m = marcas.get(r.key);
    const p = r.clave ? cat.find((c) => c.clave === r.clave) : null;
    const vigente = m && !(p && p.ultima > d10(m.fecha));
    return { ...r, marcado: vigente ? m : null };
  }).sort((a, b) => a.pr - b.pr || a.producto.localeCompare(b.producto));
}

export function porCategoria(compras) {
  return [...groupBy(compras, (d) => d.categoria)].map(([categoria, f]) => ({ categoria, total: sum(f, (d) => d.total) })).sort((a, b) => b.total - a.total);
}

export function porDueno(compras, productos) {
  const dueno = new Map(productos.map((p) => [p.clave, p.dueno || 'Casa']));
  return [...groupBy(compras, (d) => dueno.get(d.clave) || 'Casa')].map(([d, f]) => ({ dueno: d, total: sum(f, (x) => x.total) })).sort((a, b) => b.total - a.total);
}

export function iva(compras, productos) {
  const mes = compras.map((r) => d10(r.fecha).slice(0, 7)).sort().pop() || '';
  const del = compras.filter((r) => d10(r.fecha).slice(0, 7) === mes);
  const part = (t) => { const l = del.filter((r) => Number(r.iva_pct) === t); const tot = sum(l, (r) => r.total); return [tot, Math.round(tot - tot / (1 + t / 100))]; };
  const [t1, i1] = part(1), [t13, i13] = part(13);
  const info = new Map(productos.map((p) => [p.clave, p]));
  const prods = [...groupBy(compras, (d) => d.clave)].map(([clave, f]) => {
    const tasa = Number(f[f.length - 1].iva_pct) || 13, total = sum(f, (d) => d.total);
    const p = info.get(clave) || {};
    return { clave, producto: p.producto || f[0].producto, tasa, total, iva: Math.round(total - total / (1 + tasa / 100)), alternativa: p.alternativa_1 || '' };
  }).filter((r) => r.tasa === 13).sort((a, b) => b.iva - a.iva);
  return { mes, total: t1 + t13, iva: i1 + i13, total_1: t1, iva_1: i1, total_13: t13, iva_13: i13, pct_13: (t1 + t13) ? t13 / (t1 + t13) : 0, ahorro_si_1: Math.round((t13 / 1.13) * 0.12), prods };
}

export { sum, groupBy };

// Productos comprados en más de un tipo de lugar, comparados por kilo, litro o unidad.
export function compararLugares(compras, productos, lugares) {
  const info = new Map(productos.map((p) => [p.clave, p]));
  const tipo = new Map(lugares.map((l) => [l.nombre, l.tipo]));
  const out = [];
  for (const [clave, filas] of groupBy(compras, (d) => d.clave)) {
    const porTipo = {};
    for (const [lugar, fl] of groupBy(filas, (d) => d.supermercado)) {
      const last = fl.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).pop();
      const t = tipo.get(lugar) || 'Supermercado';
      const r = refPrecio(last, info.get(clave));
      if (!porTipo[t] || r.v < porTipo[t].v) porTipo[t] = { v: Math.round(r.v), u: r.u, lugar };
    }
    const tipos = Object.keys(porTipo);
    if (tipos.length < 2) continue;
    const best = tipos.reduce((a, b) => (porTipo[b].v < porTipo[a].v ? b : a));
    const worst = tipos.reduce((a, b) => (porTipo[b].v > porTipo[a].v ? b : a));
    const p = info.get(clave) || {};
    out.push({ clave, producto: p.grupo || p.producto || filas[0].producto, porTipo, mejor: best, ahorro_pct: porTipo[worst].v ? (porTipo[worst].v - porTipo[best].v) / porTipo[worst].v : 0 });
  }
  return out.sort((a, b) => b.ahorro_pct - a.ahorro_pct);
}

// Cuánto duró cada compra hasta que se terminó (según los eventos).
export function duraciones(compras, eventos, clave) {
  const fechas = [...new Set(compras.filter((r) => r.clave === clave).map((r) => d10(r.fecha)))].sort();
  return eventos.filter((e) => e.clave === clave && String(e.evento).toLowerCase() === 'terminado').map((e) => {
    const desde = fechas.filter((f) => f <= d10(e.fecha)).pop();
    return desde ? { desde, hasta: d10(e.fecha), dias: daysBetween(desde, e.fecha) } : null;
  }).filter(Boolean);
}
