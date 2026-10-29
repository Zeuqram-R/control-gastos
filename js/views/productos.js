// Página Productos (catálogo, comparar lugares) y perfil de cada producto.
import { h, crc, pct, todayCR, dayShort, addDays, thumb, openPhoto, empty, stat } from '../ui.js';
import * as C from '../calc.js';
import { abrirHoja } from '../fuente.js';
import { secVencimientos, secSuper, secIva, secCompras } from './resumen.js';

const state = { buscar: '', dueno: '', orden: 'nombre' };
const DUENOS = ['Casa', 'Ali', 'Jose'];
const UBICACIONES = ['Refri', 'Congelador', 'Alacena', 'Afuera', 'Baño'];
const TIPOS = ['Supermercado', 'Chino', 'Feria', 'Pulpería'];

const unitPrice = (r) => crc(r.precio_unitario) + (r.unidad === 'kg' ? '/kg' : '');
const cambio = (v) => h('span', { class: v > 0 ? 'up' : v < 0 ? 'down' : 'muted' }, `${v > 0 ? '+' : ''}${pct(v, 1)}`);

function datos(sync) {
  const compras = sync.data('compras'), productos = sync.data('productos');
  return { compras, productos, eventos: sync.data('eventos'), lugares: sync.data('lugares'), cat: C.catalogo(compras, productos) };
}

export function viewProductos(ctx) {
  const { sync, openProduct } = ctx;
  const D = datos(sync);
  const list = h('ul', { class: 'rows prod-list' });
  const count = h('p', { class: 'note', style: { margin: '0 0 6px' } });
  const fill = () => {
    const q = state.buscar.trim().toLowerCase();
    let rows = D.cat.filter((p) => (!state.dueno || p.dueno === state.dueno)
      && (!q || `${p.producto} ${p.categoria} ${p.otros_nombres.join(' ')} ${p.nombres_lugar.map((n) => n.nombre).join(' ')}`.toLowerCase().includes(q)));
    const by = {
      nombre: (a, b) => a.producto.localeCompare(b.producto),
      ref: (a, b) => b.mejor_ref - a.mejor_ref,
      cambio: (a, b) => b.cambio_pct - a.cambio_pct,
      gasto: (a, b) => b.gasto_total - a.gasto_total,
    }[state.orden];
    rows = rows.slice().sort(by);
    count.textContent = `${rows.length} de ${D.cat.length} productos`;
    list.replaceChildren(...rows.map((p) => h('li', { class: 'tap', onclick: () => openProduct(p.clave) },
      thumb(sync, p.clave),
      h('div', { class: 'main' }, p.producto,
        h('span', { class: 'sub' }, [`${crc(p.mejor_ref)}/${p.ref_u}`, p.mejor_super + (p.n_supers > 1 ? ` (de ${p.n_supers})` : ''), p.dueno !== 'Casa' ? `de ${p.dueno}` : null].filter(Boolean).join(' · '))),
      h('div', { class: 'amt-col' },
        h('span', { class: 'amt' }, crc(p.mejor_precio) + (p.unidad === 'kg' ? '/kg' : '')),
        p.compras > 1 ? cambio(p.cambio_pct) : null),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))));
    if (!rows.length) list.append(empty('Nada coincide.'));
  };
  fill();
  const search = h('input', { class: 'input', id: 'prod-buscar', type: 'search', placeholder: 'Buscar producto…', oninput: (e) => { state.buscar = e.target.value; fill(); } });
  search.value = state.buscar;
  const chips = h('div', { class: 'chips filt' }, [['', 'Todos'], ...DUENOS.map((d) => [d, d])].map(([v, t]) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(state.dueno === v),
    onclick: (e) => { state.dueno = v; for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); fill(); },
  }, t)));
  const orden = h('select', { class: 'input', id: 'prod-orden', 'aria-label': 'Ordenar', onchange: (e) => { state.orden = e.target.value; fill(); } },
    [['nombre', 'Por nombre'], ['ref', 'Más caros por kg/L'], ['cambio', 'Más subieron de precio'], ['gasto', 'Más gastado']].map(([v, t]) => h('option', { value: v, selected: state.orden === v || null }, t)));

  const cmp = secComparar(D, openProduct);
  const hoy = todayCR();
  return [
    h('nav', { class: 'chips', 'aria-label': 'Ir a' },
      [['venc', 'Por vencerse'], ['prods', 'Productos'], ['comparar', 'Comparar lugares'], ['super', 'Súper'], ['iva', 'IVA'], ['compras', 'Compras']]
        .map(([id, t]) => h('button', { type: 'button', class: 'chip', onclick: () => document.getElementById(id === 'prods' || id === 'comparar' ? `p-${id}` : `r-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, t))),
    secVencimientos(ctx, D.cat, D.eventos, hoy),
    cmp.dataset.has ? cmp : null,
    h('section', { id: 'p-prods', class: 'card sec' },
      h('h2', {}, 'Productos'),
      h('p', { class: 'note' }, 'Precio del empaque y por kilo, litro o unidad (el que sirve para comparar tamaños y lugares). Tocá uno para ver su perfil.'),
      h('div', { class: 'field' }, search),
      h('div', { class: 'prod-ctrl' }, chips, orden),
      count, list),
    cmp.dataset.has ? null : cmp,
    h('div', { class: 'sec-head', style: { marginTop: '8px' } }, h('h2', {}, 'Análisis del súper')),
    secSuper(D),
    secIva(D),
    secCompras(ctx, D),
  ];
}

// Cómo se llama este producto en cada lugar (de los tiquetes y de los nombres que se le han asociado).
function secNombres(p, rows) {
  const porLugar = new Map();
  const add = (lugar, nombre) => {
    if (!nombre) return;
    const k = lugar || 'Otros';
    if (!porLugar.has(k)) porLugar.set(k, new Set());
    if (String(nombre).toLowerCase() !== p.producto.toLowerCase()) porLugar.get(k).add(String(nombre));
  };
  for (const r of rows) add(r.supermercado, r.codigo_ticket);
  for (const n of p.nombres_lugar || []) add(n.lugar, n.nombre);
  const sueltos = (p.otros_nombres || []).filter((n) => ![...porLugar.values()].some((set) => set.has(n)));
  if (sueltos.length) for (const n of sueltos) add('Otros nombres', n);
  const filas = [...porLugar].filter(([, set]) => set.size);
  if (!filas.length) return null;
  return h('section', { class: 'card' },
    h('h2', {}, 'Cómo se llama en cada lugar'),
    h('p', { class: 'note' }, 'El nombre de arriba es el normalizado; estos son los que salen en los tiquetes o como lo llaman en cada lugar.'),
    h('ul', { class: 'rows' }, filas.map(([lugar, set]) => h('li', {},
      h('div', { class: 'main' }, lugar, h('span', { class: 'sub' }, [...set].join(' · ')))))));
}

function secComparar(D, openProduct) {
  const rows = C.compararLugares(D.compras, D.productos, D.lugares);
  return h('section', { id: 'p-comparar', class: 'card sec', 'data-has': rows.length ? '1' : null },
    h('h2', {}, 'Súper vs. chino vs. feria vs. pulpería'),
    rows.length ? [
      h('p', { class: 'note' }, 'Productos comprados en más de un tipo de lugar, por kilo, litro o unidad. En verde, dónde sale más barato.'),
      h('ul', { class: 'rows' }, rows.map((r) => h('li', { class: 'tap', onclick: () => openProduct(r.clave) },
        h('div', { class: 'main' }, r.producto,
          h('div', { class: 'cmp' }, TIPOS.filter((t) => r.porTipo[t]).map((t) => h('span', { class: t === r.mejor ? 'best' : '' }, `${t}: ${crc(r.porTipo[t].v)}/${r.porTipo[t].u}`)))),
        h('span', { class: 'amt good' }, `−${pct(r.ahorro_pct)}`)))),
    ] : empty('Todavía todo viene de Walmart. Cuando compren en el chino, la feria o una pulpería algo que ya compraron en el súper (plátanos, huevos, ajo…), aquí sale cuál conviene y cuánto se ahorran.'));
}

// ---------- Perfil ----------
export function viewProducto(ctx) {
  const { sync, toast, openProduct, clave } = ctx;
  const D = datos(sync);
  const p = D.cat.find((r) => r.clave === clave);
  if (!p) return h('section', { class: 'card' }, empty('Producto no encontrado.'));
  const info = D.productos.find((r) => r.clave === clave) || {};
  const rows = D.compras.filter((r) => r.clave === clave).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.id).localeCompare(String(b.id)));
  const evs = D.eventos.filter((e) => e.clave === clave).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const hoy = todayCR();
  const cfg = sync.config;

  const foto = thumb(sync, clave, { cls: 'ph', open: true, big: true, title: p.producto });
  const tags = [p.categoria, p.iva ? `IVA ${p.iva}%` : null, p.perecedero && p.vida_util_dias ? `Perecedero · ~${p.vida_util_dias} días` : null].filter(Boolean);

  // Lo que ustedes pueden cambiar desde aquí: de quién es y dónde se guarda.
  const patch = (rec, summary) => sync.mutate('productos', { kind: 'patch', record: { id: info.id || clave, ...rec } }, summary);
  const duenoSeg = h('div', { class: 'seg' }, DUENOS.map((d) => h('button', { type: 'button', 'aria-pressed': String(p.dueno === d), onclick: () => p.dueno !== d && patch({ dueno: d }, `${p.producto}: de ${d}`) }, d)));
  const ubiIn = h('input', { class: 'input', id: 'pf-ubi', type: 'text', list: 'pf-ubis', value: p.ubicacion || '', placeholder: 'Refri, congelador, alacena…', autocomplete: 'off' });
  ubiIn.addEventListener('change', () => { const v = ubiIn.value.trim(); if (v !== (p.ubicacion || '')) patch({ ubicacion: v }, `${p.producto}: se guarda en ${v || '—'}`); });
  ubiIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') ubiIn.blur(); });

  // Avisar qué pasó con el producto (sirve para la lista y para los perecederos).
  const evento = async (tipo, extra = {}) => {
    const rec = { id: `E${Date.now().toString(36)}`, fecha: hoy, clave, evento: tipo, vida_dias: extra.vida_dias ?? null, nota: extra.nota || '', por: cfg.persona };
    await sync.mutate('eventos', { kind: 'upsert', record: rec }, `${p.producto}: ${EV_TXT[tipo].toLowerCase()}`);
    toast(`Anotado: ${EV_TXT[tipo]}`, { label: 'Deshacer', fn: () => sync.mutate('eventos', { kind: 'delete', id: rec.id }, `deshace: ${p.producto}`) });
  };
  // "Lo guardamos en la refri": cuenta los días que dura en la refri desde hoy (se pueden ajustar).
  const guardarRefri = () => {
    const sug = p.vida_refri_dias || p.vida_util_dias || 7;
    const dias = h('input', { class: 'input big-num', id: 'refri-dias', inputmode: 'numeric', autocomplete: 'off' });
    dias.value = String(sug);
    const venceTxt = h('p', { class: 'note', style: { margin: '6px 0 0' } });
    const pintar = () => { const n = Math.max(1, Number(dias.value) || 0); venceTxt.textContent = `Vencería aprox. el ${dayShort(addDays(hoy, n))}.`; };
    dias.addEventListener('input', pintar); pintar();
    const cerrar = abrirHoja({ titulo: 'Guardado en la refri', kicker: p.producto, cuerpo: [
      h('p', { class: 'note' }, p.vida_refri_dias ? `En la refri suele durar unos ${p.vida_refri_dias} días. Si ya está abierto o muy maduro, poné menos.` : 'Todavía no tengo cuánto dura este en la refri; poné tu mejor estimado y queda guardado para la próxima.'),
      h('div', { class: 'field' }, h('label', { for: 'refri-dias' }, '¿Cuántos días dura en la refri?'), dias, venceTxt),
      h('button', { type: 'button', class: 'btn block', onclick: async () => {
        const n = Math.max(1, Math.round(Number(dias.value) || 0));
        if (!p.vida_refri_dias) await sync.mutate('productos', { kind: 'patch', record: { id: clave, vida_refri_dias: n } }, `${p.producto}: dura ${n} días en la refri`);
        cerrar();
        await evento('refrigerado', { vida_dias: n });
      } }, 'Guardar'),
    ] });
  };
  const enLista = sync.data('lista').some((l) => (l.tipo || 'pedido') === 'pedido' && l.clave === clave && String(l.fecha) > p.ultima);

  const dur = C.duraciones(D.compras, D.eventos, clave);
  const otras = D.cat.filter((r) => r.grupo && r.grupo === p.grupo).sort((a, b) => a.mejor_ref - b.mejor_ref);
  const lugares = new Map(D.lugares.map((l) => [l.nombre, l.tipo]));
  const porLugar = [...C.groupBy(rows, (r) => r.supermercado)];

  return [
    h('section', { class: 'phead' },
      foto,
      h('div', { class: 'phead-info' },
        h('h2', {}, p.producto),
        h('div', { class: 'tags' }, tags.map((t) => h('span', { class: 'pill' }, t))))),
    secNombres(p, rows),

    h('section', { class: 'card' },
      h('div', { class: 'qgrid' },
        stat('Mejor precio', crc(p.mejor_precio) + (p.unidad === 'kg' ? '/kg' : ''), `${crc(p.mejor_ref)}/${p.ref_u} · en ${p.mejor_super}${p.n_supers > 1 ? ` · ahorrás ${crc(p.ahorro)} vs. el más caro` : ''}`),
        stat('Cambio de precio', p.compras > 1 ? `${p.cambio_pct > 0 ? '+' : ''}${pct(p.cambio_pct, 1)}` : '—', p.compras > 1 ? `desde el ${dayShort(p.primera)}` : 'Necesita al menos 2 compras', p.compras > 1 ? (p.cambio_pct > 0 ? 'var(--bad)' : p.cambio_pct < 0 ? 'var(--ok)' : null) : null),
        stat('Veces comprado', String(p.compras), `Gastado en total: ${crc(p.gasto_total)}`),
        stat('Se compra cada', p.cada_dias ? `${p.cada_dias} días` : '—', p.cada_dias ? 'promedio entre compras' : 'Necesita al menos 2 compras'))),

    h('section', { class: 'card' },
      h('h2', {}, '¿Qué pasó con él?'),
      h('p', { class: 'note' }, 'Avisá aquí y se actualizan la lista y los perecederos (antes había que decírmelo a mí).'),
      h('div', { class: 'ev-btns' },
        h('button', { type: 'button', class: 'btn secondary wide', onclick: () => guardarRefri() }, '🧊 Lo guardamos en la refri'),
        h('button', { type: 'button', class: 'btn secondary', onclick: () => evento('terminado') }, 'Se acabó'),
        h('button', { type: 'button', class: 'btn secondary', onclick: () => evento('congelado') }, 'Lo congelamos'),
        h('button', { type: 'button', class: 'btn secondary', onclick: () => evento('cocinado', { vida_dias: 3 }) }, 'Lo cocinamos'),
        h('button', { type: 'button', class: 'btn secondary', onclick: () => evento('botado') }, 'Se botó')),
      h('button', { type: 'button', class: 'btn block', style: { marginTop: '10px' }, disabled: enLista || null,
        onclick: () => sync.mutate('lista', { kind: 'upsert', record: { id: `P${Date.now().toString(36)}`, tipo: 'pedido', clave, texto: p.producto, cantidad: '', fecha: hoy, por: cfg.persona } }, `agrega "${p.producto}"`).then(() => toast('Agregado a la lista.')) },
        enLista ? 'Ya está en la lista' : 'Agregar a la lista'),
      evs.length ? h('ul', { class: 'rows', style: { marginTop: '8px' } }, evs.slice(0, 5).map((e) => h('li', {},
        h('div', { class: 'main' }, EV_TXT[String(e.evento).toLowerCase()] || e.evento, h('span', { class: 'sub' }, [dayShort(e.fecha), e.por, e.nota].filter(Boolean).join(' · ')))))) : null),

    h('section', { class: 'card' },
      h('h2', {}, 'Precio por lugar'),
      h('p', { class: 'note' }, 'Precio por unidad (o por kilo) en cada compra; una línea por lugar.'),
      priceChart(rows),
      h('ul', { class: 'rows' }, porLugar.map(([s, f]) => {
        const a = Number(f[0].precio_unitario), b = Number(f[f.length - 1].precio_unitario);
        return h('li', {},
          h('div', { class: 'main' }, s + (lugares.get(s) ? ` · ${lugares.get(s)}` : ''),
            h('span', { class: 'sub' }, f.length > 1 ? `Primero ${unitPrice(f[0])} (${dayShort(f[0].fecha)}) · último ${unitPrice(f[f.length - 1])} (${dayShort(f[f.length - 1].fecha)})` : `${unitPrice(f[0])} el ${dayShort(f[0].fecha)}`)),
          f.length > 1 ? cambio((b - a) / a) : h('span', { class: 'muted' }, '—'));
      }))),

    h('section', { class: 'card' },
      h('h2', {}, 'De quién es y dónde se guarda'),
      h('div', { class: 'field' }, h('label', {}, 'De'), duenoSeg),
      h('div', { class: 'field', style: { marginBottom: '0' } }, h('label', { for: 'pf-ubi' }, 'Se guarda en'), ubiIn,
        h('datalist', { id: 'pf-ubis' }, [...new Set([...UBICACIONES, ...D.productos.map((x) => x.ubicacion).filter(Boolean)])].map((u) => h('option', { value: u }))))),

    h('section', { class: 'grid2' },
      h('div', { class: 'card' },
        h('h2', {}, 'Cuánto dura'),
        dur.length ? h('ul', { class: 'rows' }, dur.map((d) => h('li', {}, h('div', { class: 'main' }, `${d.dias} días`, h('span', { class: 'sub' }, `del ${dayShort(d.desde)} al ${dayShort(d.hasta)}`)))))
          : empty('Cuando avisen que se acabó, aquí sale cuántos días duró.')),
      h('div', { class: 'card' },
        h('h2', {}, 'Otras presentaciones'),
        otras.length > 1 ? h('ul', { class: 'rows' }, otras.map((o, i) => h('li', { class: o.clave === clave ? 'cur' : 'tap', onclick: o.clave === clave ? null : () => openProduct(o.clave) },
          h('div', { class: 'main' }, o.producto + (o.clave === clave ? ' (este)' : '')),
          h('span', { class: `amt${i === 0 ? ' good' : ''}` }, `${crc(o.mejor_ref)}/${o.ref_u}`))))
          : empty(`Cuando compren otro tamaño de este producto, aquí comparo cuál sale más barato por ${p.ref_u === 'un' ? 'unidad' : p.ref_u}.`))),

    h('section', { class: 'card' },
      h('h2', {}, 'Historial de compras'),
      h('ul', { class: 'rows' }, rows.slice().reverse().map((r) => h('li', {},
        h('div', { class: 'main' }, `${dayShort(r.fecha)} · ${r.supermercado}`, h('span', { class: 'sub' }, `${r.unidad === 'kg' ? `${Number(r.cantidad).toFixed(3)} kg` : `${r.cantidad} ×`} ${unitPrice(r)}`)),
        h('span', { class: 'amt' }, crc(r.total)))))),
  ];
}

const EV_TXT = { terminado: 'Se acabó', congelado: 'Se congeló', refrigerado: 'Se guardó en la refri', cocinado: 'Se cocinó', botado: 'Se botó' };

// Gráfico de precio en el tiempo, una línea por lugar (SVG sencillo, sin librerías).
function priceChart(rows) {
  if (!rows.length) return null;
  const W = 400, H = 200, m = { t: 24, r: 12, b: 24, l: 58 };
  const pts = rows.map((r) => ({ t: Date.parse(String(r.fecha).slice(0, 10)), p: Number(r.precio_unitario), s: r.supermercado, r }));
  const stores = [...new Set(pts.map((p) => p.s))];
  const COLORS = ['var(--accent)', 'var(--orange)', '#4f8fe8', '#d46fb4', '#c9a227'];
  const col = (s) => COLORS[stores.indexOf(s) % COLORS.length];
  let x0 = Math.min(...pts.map((p) => p.t)), x1 = Math.max(...pts.map((p) => p.t));
  if (x0 === x1) { x0 -= 15 * 864e5; x1 += 15 * 864e5; }
  let y0 = Math.min(...pts.map((p) => p.p)), y1 = Math.max(...pts.map((p) => p.p));
  const pad = Math.max((y1 - y0) * 0.25, y1 * 0.15);
  y0 = Math.max(0, y0 - pad); y1 += pad;
  const X = (t) => m.l + ((t - x0) / (x1 - x0)) * (W - m.l - m.r);
  const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pchart', role: 'img', 'aria-label': 'Precio en el tiempo' });
  for (let i = 0; i <= 3; i++) {
    const v = y0 + ((y1 - y0) * i) / 3;
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'grid' }));
    svg.append(el('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'ax' }, crc(v)));
  }
  const dates = [...new Set(pts.map((p) => p.t))];
  for (const t of dates.slice(0, 6)) svg.append(el('text', { x: X(t), y: H - 6, 'text-anchor': 'middle', class: 'ax' }, dayShort(new Date(t).toISOString())));
  const placed = [];
  for (const s of stores) {
    const ser = pts.filter((p) => p.s === s);
    if (ser.length > 1) svg.append(el('path', { d: ser.map((p, i) => `${i ? 'L' : 'M'}${X(p.t)},${Y(p.p)}`).join(''), fill: 'none', stroke: col(s), 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    for (const p of ser) { const c = el('circle', { cx: X(p.t), cy: Y(p.p), r: 5, fill: col(s) }); c.append(el('title', {}, `${s} · ${dayShort(p.r.fecha)} · ${unitPrice(p.r)}`)); svg.append(c); }
    const last = ser[ser.length - 1];
    let ly = Y(last.p) - 12;
    while (placed.some((v) => Math.abs(v - ly) < 16)) ly -= 16;
    placed.push(ly);
    svg.append(el('text', { x: Math.min(Math.max(X(last.t), m.l + 55), W - m.r - 55), y: Math.max(ly, 14), 'text-anchor': 'middle', fill: col(s), class: 'lbl' }, `${s} ${crc(last.p)}`));
  }
  return h('div', { class: 'pchart-box' }, svg);
}
