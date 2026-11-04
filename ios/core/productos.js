// Lista, Productos y perfil de producto para la app de iPhone: mismos cálculos y textos que
// js/views/lista.js y js/views/productos.js, devueltos como datos. Si cambian en la web, reflejarlo aquí.
import { crc, pct, dayShort, MESES } from '../../js/ui.js';
import * as C from '../../js/calc.js';

const unitPrice = (r) => crc(r.precio_unitario) + (r.unidad === 'kg' ? '/kg' : '');
const cambio = (v) => ({ texto: `${v > 0 ? '+' : ''}${pct(v, 1)}`, dir: v > 0 ? 'up' : v < 0 ? 'down' : null });
const mini = (clave) => (clave ? `fotos/mini/${clave}.webp` : null);
const grande = (clave) => (clave ? `fotos/grande/${clave}.webp` : null);
const base = (D) => ({ compras: D.compras || [], productos: D.productos || [], eventos: D.eventos || [], lugares: D.lugares || [], lista: D.lista || [] });

// ---------- Lista ----------
export function lista(D0, hoy, persona) {
  const D = base(D0);
  const cat = C.catalogo(D.compras, D.productos);
  const rows = C.listaCompras(D.compras, cat, D.eventos, D.lista, hoy);
  const marcados = rows.filter((r) => r.marcado);
  const pendientes = rows.filter((r) => !r.marcado);
  const total = C.sum(pendientes, (r) => r.mejor_precio);
  const fila = (r) => ({
    key: r.key, clave: r.clave || null, foto: mini(r.clave), producto: r.producto, pedidoId: r.pedidoId || null, marcado: !!r.marcado,
    motivo: r.motivo,
    why: r.marcado ? `Tachado por ${r.marcado.por || '—'}` : (r.motivo === 'pronto' || r.motivo === 'vence' ? 'Pronto · ' : '') + r.detalle.replace(/(\d{4}-\d{2}-\d{2})/, (m) => dayShort(m)) + (r.dueno && r.dueno !== 'Casa' ? ` · de ${r.dueno}` : ''),
    precio: r.mejor_precio ? crc(r.mejor_precio) + (r.unidad === 'kg' ? '/kg' : '') : '—',
    // Lo que se sube al tachar (mismo formato que la web).
    tachar: JSON.stringify({ id: `M-${r.key}`, tipo: 'marcado', key: r.key, fecha: hoy, por: persona }),
    pedido: r.pedidoId ? JSON.stringify(D.lista.find((x) => x.id === r.pedidoId) || null) : null,
  });
  const grupos = new Map();
  for (const r of pendientes) {
    const k = r.mejor_super || 'Sin precio todavía';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  const lineas = [`🛒 Lista del súper (${dayShort(hoy)})`];
  for (const [store, list] of grupos) {
    const t = C.sum(list, (r) => r.mejor_precio);
    lineas.push('', `*${store}*${t ? ` (≈ ${crc(t)})` : ''}`);
    for (const r of list) lineas.push(`• ${r.producto}${r.cantidad ? ` — ${r.cantidad}` : ''}`);
  }
  if (total) lineas.push('', `Total aprox.: ${crc(total)}`);
  const cmp = pendientes.length ? C.compararLista(pendientes, D.compras) : null;
  return {
    nota: rows.length
      ? `${pendientes.length} por comprar${pendientes.length ? ` · unos ${crc(total)} con los mejores precios conocidos` : ''}${marcados.length ? ` · ${marcados.length} tachado(s)` : ''}. Tocá un producto para tacharlo; Ali y vos ven lo mismo.`
      : 'Por ahora no falta nada que yo sepa. Agregá lo que necesitás aquí abajo.',
    vacia: !rows.length,
    pendientes: pendientes.length,
    grupos: [...grupos].map(([store, list]) => ({ lugar: store, total: C.sum(list, (r) => r.mejor_precio) ? `≈ ${crc(C.sum(list, (r) => r.mejor_precio))}` : null, filas: list.map(fila) })),
    marcados: marcados.map(fila),
    manualesTachados: marcados.filter((r) => r.pedidoId).map((r) => ({ pedidoId: r.pedidoId, key: r.key, producto: r.producto })),
    texto: lineas.join('\n'),
    cmp: cmp && cmp.porLugar.length ? {
      nota: `Con los últimos precios conocidos de ${cmp.conPrecio} producto(s)${cmp.sinPrecio ? ` (${cmp.sinPrecio} sin precio todavía)` : ''}, una unidad de cada uno.`,
      filas: [
        ...cmp.porLugar.map((l, i) => ({ titulo: `Todo en ${l.lugar}`, sub: l.faltan.length ? `Tiene ${l.n} de ${cmp.conPrecio}; no conocemos precio ahí de: ${l.faltan.slice(0, 3).join(', ')}${l.faltan.length > 3 ? '…' : ''}` : `Tiene precio de todo${i === 0 && cmp.porLugar.length > 1 ? ' · la mejor opción en un solo lugar' : ''}`, monto: crc(l.total), bueno: false })),
        ...(cmp.lugaresMejor.length > 1 ? [{ titulo: 'Cada cosa donde sale más barata', sub: `Repartido en ${cmp.lugaresMejor.join(', ')}`, monto: crc(cmp.mejor), bueno: true }] : []),
      ],
      unLugar: cmp.porLugar.length === 1 ? 'Por ahora solo conocemos precios de un lugar. Con facturas de otros súper, el chino o la feria, aquí se comparan solos.' : null,
    } : null,
    sugerencias: D.productos.map((p) => p.producto).filter(Boolean),
  };
}

// Agregar algo a mano: si coincide con un producto conocido, queda ligado a él.
export function agregarLista(D0, texto, cantidad, hoy, persona, id) {
  const D = base(D0);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const t = String(texto || '').trim();
  if (!t) return { error: 'Escribí qué hace falta.' };
  const p = D.productos.find((x) => norm(x.producto) === norm(t)) || D.productos.find((x) => norm(x.grupo || '') === norm(t));
  const rec = { id, tipo: 'pedido', clave: p ? p.clave : '', texto: p ? p.producto : t, cantidad: String(cantidad || '').trim(), fecha: hoy, por: persona };
  return { recText: JSON.stringify(rec), summary: `agrega "${rec.texto}"` };
}

// ---------- Productos ----------
const TIPOS = ['Supermercado', 'Chino', 'Feria', 'Pulpería'];
export function productos(D0, hoy) {
  const D = base(D0);
  const cat = C.catalogo(D.compras, D.productos);
  const venc = C.vencimientos(cat, D.eventos).map((r) => {
    const dias = Math.round((Date.parse(r.vence) - Date.parse(hoy)) / 864e5);
    return {
      clave: r.clave, foto: mini(r.clave), producto: r.producto,
      sub: `${r.sobras ? `Sobras cocinadas el ${dayShort(r.desde)}` : r.refri ? `En la refri desde el ${dayShort(r.desde)}` : `Comprado ${dayShort(r.ultima)}`} · dura ~${r.dias} días${r.ubicacion ? ` · ${r.ubicacion}` : ''}`,
      cuando: dias < 0 ? `Venció hace ${-dias} día${dias === -1 ? '' : 's'}` : dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`,
      nivel: dias <= 0 ? 'bad' : dias <= 2 ? 'warn' : null,
    };
  });
  const comparar = C.compararLugares(D.compras, D.productos, D.lugares).map((r) => ({
    clave: r.clave, producto: r.producto, ahorro: `−${pct(r.ahorro_pct)}`,
    tipos: TIPOS.filter((t) => r.porTipo[t]).map((t) => ({ texto: `${t}: ${crc(r.porTipo[t].v)}/${r.porTipo[t].u}`, mejor: t === r.mejor })),
  }));
  const lista = cat.map((p) => ({
    clave: p.clave, foto: mini(p.clave), producto: p.producto, dueno: p.dueno,
    sub: [`${crc(p.mejor_ref)}/${p.ref_u}`, p.mejor_super + (p.n_supers > 1 ? ` (de ${p.n_supers})` : ''), p.dueno !== 'Casa' ? `de ${p.dueno}` : null].filter(Boolean).join(' · '),
    precio: crc(p.mejor_precio) + (p.unidad === 'kg' ? '/kg' : ''),
    cambio: p.compras > 1 ? cambio(p.cambio_pct) : null,
    buscar: `${p.producto} ${p.categoria} ${p.otros_nombres.join(' ')} ${p.nombres_lugar.map((n) => n.nombre).join(' ')}`,
    orden: { ref: p.mejor_ref, cambio: p.cambio_pct, gasto: p.gasto_total },
  }));
  const I = C.iva(D.compras, D.productos);
  const info = new Map(D.productos.map((p) => [p.clave, p]));
  const compras = D.compras.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.id).localeCompare(String(b.id))).map((r) => {
    const ref = C.refPrecio(r, info.get(r.clave));
    const qty = r.unidad === 'kg' ? `${Number(r.cantidad).toFixed(3)} kg` : `${r.cantidad} ×`;
    return { clave: r.clave, foto: mini(r.clave), producto: r.producto, sub: `${dayShort(r.fecha)} · ${r.supermercado} · ${qty} ${crc(r.precio_unitario)}${r.unidad === 'kg' ? '/kg' : ''} · ${crc(ref.v)}/${ref.u}`, monto: crc(r.total), buscar: `${r.producto} ${r.categoria} ${r.supermercado}` };
  });
  const mes = I.mes ? MESES[Number(I.mes.slice(5, 7)) - 1] : 'el mes';
  return {
    venc, comparar, lista, total: cat.length, compras,
    porCategoria: C.porCategoria(D.compras).map((r) => ({ label: r.categoria, total: r.total })),
    porDueno: C.porDueno(D.compras, D.productos).map((r) => ({ label: r.dueno, total: r.total })),
    iva: {
      titulo: `IVA pagado en ${mes}`,
      stats: [
        { lbl: 'IVA del mes', num: crc(I.iva), sub: `de ${crc(I.total)} en compras de súper` },
        { lbl: 'Canasta básica (1%)', num: crc(I.iva_1), sub: `sobre ${crc(I.total_1)} (${pct(1 - I.pct_13)} de lo comprado)` },
        { lbl: 'Resto (13%)', num: crc(I.iva_13), sub: `sobre ${crc(I.total_13)} (${pct(I.pct_13)} de lo comprado)` },
        { lbl: 'Si todo fuera del 1%', num: crc(I.ahorro_si_1), sub: 'Lo que se ahorrarían en impuesto' },
      ],
      pct13: I.pct_13,
      prods: I.prods.map((p) => ({ producto: p.producto, alternativa: p.alternativa ? `Alternativa del 1%: ${p.alternativa}` : null, monto: crc(p.iva) })),
    },
  };
}

// ---------- Perfil de un producto ----------
const EV_TXT = { terminado: 'Se acabó', congelado: 'Se congeló', refrigerado: 'Se guardó en la refri', cocinado: 'Se cocinó', botado: 'Se botó' };
const UBICACIONES = ['Refri', 'Congelador', 'Alacena', 'Afuera', 'Baño'];

export function producto(D0, hoy, clave) {
  const D = base(D0);
  const cat = C.catalogo(D.compras, D.productos);
  const p = cat.find((r) => r.clave === clave);
  if (!p) return { error: 'Producto no encontrado.' };
  const info = D.productos.find((r) => r.clave === clave) || {};
  const rows = D.compras.filter((r) => r.clave === clave).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.id).localeCompare(String(b.id)));
  const evs = D.eventos.filter((e) => e.clave === clave).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  // Cómo se llama en cada lugar.
  const porNombre = new Map();
  const add = (lugar, nombre) => {
    if (!nombre) return;
    const k = lugar || 'Otros';
    if (!porNombre.has(k)) porNombre.set(k, new Set());
    if (String(nombre).toLowerCase() !== p.producto.toLowerCase()) porNombre.get(k).add(String(nombre));
  };
  for (const r of rows) add(r.supermercado, r.codigo_ticket);
  for (const n of p.nombres_lugar || []) add(n.lugar, n.nombre);
  for (const n of (p.otros_nombres || []).filter((n) => ![...porNombre.values()].some((set) => set.has(n)))) add('Otros nombres', n);
  const dur = C.duraciones(D.compras, D.eventos, clave);
  const otras = cat.filter((r) => r.grupo && r.grupo === p.grupo).sort((a, b) => a.mejor_ref - b.mejor_ref);
  const lugares = new Map(D.lugares.map((l) => [l.nombre, l.tipo]));
  const enLista = D.lista.some((l) => (l.tipo || 'pedido') === 'pedido' && l.clave === clave && String(l.fecha) > p.ultima);
  return {
    clave, id: info.id || clave, producto: p.producto, foto: grande(clave), mini: mini(clave),
    tags: [p.categoria, p.iva ? `IVA ${p.iva}%` : null, p.perecedero && p.vida_util_dias ? `Perecedero · ~${p.vida_util_dias} días` : null].filter(Boolean),
    nombres: [...porNombre].filter(([, set]) => set.size).map(([lugar, set]) => ({ lugar, nombres: [...set].join(' · ') })),
    stats: [
      { lbl: 'Mejor precio', num: crc(p.mejor_precio) + (p.unidad === 'kg' ? '/kg' : ''), sub: `${crc(p.mejor_ref)}/${p.ref_u} · en ${p.mejor_super}${p.n_supers > 1 ? ` · ahorrás ${crc(p.ahorro)} vs. el más caro` : ''}` },
      { lbl: 'Cambio de precio', num: p.compras > 1 ? `${p.cambio_pct > 0 ? '+' : ''}${pct(p.cambio_pct, 1)}` : '—', sub: p.compras > 1 ? `desde el ${dayShort(p.primera)}` : 'Necesita al menos 2 compras', color: p.compras > 1 ? (p.cambio_pct > 0 ? 'bad' : p.cambio_pct < 0 ? 'ok' : null) : null },
      { lbl: 'Veces comprado', num: String(p.compras), sub: `Gastado en total: ${crc(p.gasto_total)}` },
      { lbl: 'Se compra cada', num: p.cada_dias ? `${p.cada_dias} días` : '—', sub: p.cada_dias ? 'promedio entre compras' : 'Necesita al menos 2 compras' },
    ],
    eventos: evs.slice(0, 5).map((e) => ({ titulo: EV_TXT[String(e.evento).toLowerCase()] || e.evento, sub: [dayShort(e.fecha), e.por, e.nota].filter(Boolean).join(' · ') })),
    evTxt: EV_TXT,
    enLista,
    refri: { sugerido: p.vida_refri_dias || p.vida_util_dias || 7, conocido: !!p.vida_refri_dias,
      nota: p.vida_refri_dias ? `En la refri suele durar unos ${p.vida_refri_dias} días. Si ya está abierto o muy maduro, poné menos.` : 'Todavía no tengo cuánto dura este en la refri; poné tu mejor estimado y queda guardado para la próxima.' },
    puntos: rows.map((r) => ({ fecha: String(r.fecha).slice(0, 10), precio: Number(r.precio_unitario) || 0, lugar: r.supermercado })),
    porLugar: [...C.groupBy(rows, (r) => r.supermercado)].map(([s, f]) => {
      const a = Number(f[0].precio_unitario), b = Number(f[f.length - 1].precio_unitario);
      return { lugar: s + (lugares.get(s) ? ` · ${lugares.get(s)}` : ''), sub: f.length > 1 ? `Primero ${unitPrice(f[0])} (${dayShort(f[0].fecha)}) · último ${unitPrice(f[f.length - 1])} (${dayShort(f[f.length - 1].fecha)})` : `${unitPrice(f[0])} el ${dayShort(f[0].fecha)}`, cambio: f.length > 1 ? cambio((b - a) / a) : null };
    }),
    dueno: p.dueno, ubicacion: p.ubicacion || '',
    ubicaciones: [...new Set([...UBICACIONES, ...D.productos.map((x) => x.ubicacion).filter(Boolean)])],
    duraciones: dur.map((d) => ({ titulo: `${d.dias} días`, sub: `del ${dayShort(d.desde)} al ${dayShort(d.hasta)}` })),
    otras: otras.length > 1 ? otras.map((o, i) => ({ clave: o.clave, titulo: o.producto + (o.clave === clave ? ' (este)' : ''), este: o.clave === clave, monto: `${crc(o.mejor_ref)}/${o.ref_u}`, mejor: i === 0 })) : [],
    otrasVacio: `Cuando compren otro tamaño de este producto, aquí comparo cuál sale más barato por ${p.ref_u === 'un' ? 'unidad' : p.ref_u}.`,
    historial: rows.slice().reverse().map((r) => ({ titulo: `${dayShort(r.fecha)} · ${r.supermercado}`, sub: `${r.unidad === 'kg' ? `${Number(r.cantidad).toFixed(3)} kg` : `${r.cantidad} ×`} ${unitPrice(r)}`, monto: crc(r.total) })),
  };
}
