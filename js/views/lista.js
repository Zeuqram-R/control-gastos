// Página Lista: lo que falta en la casa, agrupado por el lugar donde salió más barato.
// Tachar y agregar se comparte entre los dispositivos (se guarda en data/lista.json).
import { h, crc, todayCR, dayShort, thumb, empty } from '../ui.js';
import * as C from '../calc.js';

export function viewLista(ctx) {
  const { sync, toast } = ctx;
  const cfg = sync.config;
  const compras = sync.data('compras'), productos = sync.data('productos'), eventos = sync.data('eventos'), lista = sync.data('lista');
  const hoy = todayCR();
  const cat = C.catalogo(compras, productos);
  const rows = C.listaCompras(compras, cat, eventos, lista, hoy);
  const marcados = rows.filter((r) => r.marcado);
  const pendientes = rows.filter((r) => !r.marcado);
  const total = C.sum(pendientes, (r) => r.mejor_precio);

  const pendIds = new Set(sync.pendingFor('lista').map((o) => (o.kind === 'delete' ? o.id : o.record.id)));

  const toggle = (r) => {
    const id = `M-${r.key}`;
    if (r.marcado) sync.mutate('lista', { kind: 'delete', id }, `destacha "${r.producto}"`);
    else sync.mutate('lista', { kind: 'upsert', record: { id, tipo: 'marcado', key: r.key, fecha: hoy, por: cfg.persona } }, `tacha "${r.producto}"`);
  };
  const quitar = async (r) => {
    await sync.mutate('lista', { kind: 'delete', id: r.pedidoId }, `quita "${r.producto}" de la lista`);
    if (r.marcado) await sync.mutate('lista', { kind: 'delete', id: `M-${r.key}` }, '');
    toast(`Quitado: ${r.producto}`, { label: 'Deshacer', fn: () => sync.mutate('lista', { kind: 'upsert', record: lista.find((x) => x.id === r.pedidoId) }, `vuelve a agregar "${r.producto}"`) });
  };
  const limpiar = async () => {
    const manuales = marcados.filter((r) => r.pedidoId);
    for (const r of manuales) {
      await sync.mutate('lista', { kind: 'delete', id: r.pedidoId }, `compró "${r.producto}"`);
      await sync.mutate('lista', { kind: 'delete', id: `M-${r.key}` }, '');
    }
    toast(manuales.length ? `Listo: ${manuales.length} quitado(s) de la lista.` : 'Lo demás tachado se quita solo cuando entre la factura.');
  };

  // Agregar a mano, con sugerencias del catálogo.
  const input = h('input', { class: 'input', id: 'lista-add', type: 'text', list: 'lista-sug', placeholder: 'Agregar algo a la lista…', autocomplete: 'off', enterkeyhint: 'done' });
  const nota = h('input', { class: 'input', id: 'lista-cant', type: 'text', placeholder: 'Cantidad (opcional)', autocomplete: 'off' });
  const add = async () => {
    const texto = input.value.trim();
    if (!texto) { input.focus(); return; }
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const p = productos.find((x) => norm(x.producto) === norm(texto)) || productos.find((x) => norm(x.grupo || '') === norm(texto));
    const cantidad = nota.value.trim();
    input.value = ''; nota.value = '';
    await sync.mutate('lista', { kind: 'upsert', record: { id: `P${Date.now().toString(36)}`, tipo: 'pedido', clave: p ? p.clave : '', texto: p ? p.producto : texto, cantidad, fecha: hoy, por: cfg.persona } }, `agrega "${p ? p.producto : texto}"`);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  nota.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  const row = (r) => {
    const whyTxt = (r.motivo === 'pronto' || r.motivo === 'vence' ? 'Pronto · ' : '') + r.detalle.replace(/(\d{4}-\d{2}-\d{2})/, (m) => dayShort(m)) + (r.dueno && r.dueno !== 'Casa' ? ` · de ${r.dueno}` : '');
    const pend = pendIds.has(`M-${r.key}`) || (r.pedidoId && pendIds.has(r.pedidoId));
    return h('li', { class: 'lst-row' + (r.marcado ? ' done' : '') + (pend ? ' pending' : '') },
      h('button', { type: 'button', class: 'lst-hit', 'aria-pressed': String(!!r.marcado), 'aria-label': `${r.marcado ? 'Destachar' : 'Tachar'} ${r.producto}`, onclick: () => toggle(r) },
        h('span', { class: 'check', 'aria-hidden': 'true' }),
        thumb(sync, r.clave),
        h('span', { class: 'main' },
          h('span', { class: 'lst-name' }, r.producto),
          h('span', { class: `lst-why ${r.marcado ? '' : r.motivo}` }, r.marcado ? `Tachado por ${r.marcado.por || '—'}` : whyTxt)),
        h('span', { class: 'lst-price' }, r.mejor_precio ? crc(r.mejor_precio) + (r.unidad === 'kg' ? '/kg' : '') : '—')),
      r.pedidoId ? h('button', { type: 'button', class: 'x-btn', 'aria-label': `Quitar ${r.producto} de la lista`, onclick: () => quitar(r) }, '✕') : null);
  };

  const grupos = new Map();
  for (const r of pendientes) {
    const k = r.mejor_super || 'Sin precio todavía';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }

  // Compartir por WhatsApp, ordenada por lugar.
  const textoLista = () => {
    const lineas = [`🛒 Lista del súper (${dayShort(hoy)})`];
    for (const [store, list] of grupos) {
      const t = C.sum(list, (r) => r.mejor_precio);
      lineas.push('', `*${store}*${t ? ` (≈ ${crc(t)})` : ''}`);
      for (const r of list) lineas.push(`• ${r.producto}${r.cantidad ? ` — ${r.cantidad}` : ''}`);
    }
    if (total) lineas.push('', `Total aprox.: ${crc(total)}`);
    return lineas.join('\n');
  };
  const compartir = async (via) => {
    const txt = textoLista();
    if (via === 'nativo' && navigator.share) { try { await navigator.share({ text: txt }); } catch (e) { /* cancelado */ } return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  };
  const cmp = pendientes.length ? C.compararLista(pendientes, compras) : null;

  return [
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Lista para el próximo súper'),
        pendientes.length ? h('div', { class: 'head-r' },
          h('button', { type: 'button', class: 'btn sm wa', onclick: () => compartir('wa') }, 'WhatsApp'),
          navigator.share ? h('button', { type: 'button', class: 'btn secondary sm', 'aria-label': 'Compartir de otra forma', onclick: () => compartir('nativo') }, 'Compartir') : null) : null),
      h('p', { class: 'note' }, rows.length
        ? `${pendientes.length} por comprar${pendientes.length ? ` · unos ${crc(total)} con los mejores precios conocidos` : ''}${marcados.length ? ` · ${marcados.length} tachado(s)` : ''}. Tocá un producto para tacharlo; Ali y vos ven lo mismo.`
        : 'Por ahora no falta nada que yo sepa. Agregá lo que necesitás aquí abajo.'),
      h('div', { class: 'lst-add' }, input, nota, h('button', { class: 'btn', type: 'button', onclick: add }, 'Agregar')),
      h('datalist', { id: 'lista-sug' }, productos.map((p) => h('option', { value: p.producto })))),
    ...[...grupos].map(([store, list]) => h('section', { class: 'card' },
      h('h3', { class: 'lst-store' }, h('span', {}, store), C.sum(list, (r) => r.mejor_precio) ? h('span', { class: 'muted' }, `≈ ${crc(C.sum(list, (r) => r.mejor_precio))}`) : null),
      h('ul', { class: 'lst' }, list.map(row)))),
    cmp && cmp.porLugar.length ? h('section', { class: 'card' },
      h('h2', {}, '¿Dónde sale más barata?'),
      h('p', { class: 'note' }, `Con los últimos precios conocidos de ${cmp.conPrecio} producto(s)${cmp.sinPrecio ? ` (${cmp.sinPrecio} sin precio todavía)` : ''}, una unidad de cada uno.`),
      h('ul', { class: 'rows' },
        cmp.porLugar.map((l, i) => h('li', {},
          h('div', { class: 'main' }, `Todo en ${l.lugar}`, h('span', { class: 'sub' }, l.faltan.length ? `Tiene ${l.n} de ${cmp.conPrecio}; no conocemos precio ahí de: ${l.faltan.slice(0, 3).join(', ')}${l.faltan.length > 3 ? '…' : ''}` : `Tiene precio de todo${i === 0 && cmp.porLugar.length > 1 ? ' · la mejor opción en un solo lugar' : ''}`)),
          h('span', { class: 'amt' }, crc(l.total)))),
        cmp.lugaresMejor.length > 1 ? h('li', {},
          h('div', { class: 'main' }, 'Cada cosa donde sale más barata', h('span', { class: 'sub' }, `Repartido en ${cmp.lugaresMejor.join(', ')}`)),
          h('span', { class: 'amt', style: { color: 'var(--ok)' } }, crc(cmp.mejor))) : null),
      cmp.porLugar.length === 1 ? h('p', { class: 'note', style: { margin: '8px 0 0' } }, 'Por ahora solo conocemos precios de un lugar. Con facturas de otros súper, el chino o la feria, aquí se comparan solos.') : null) : null,
    marcados.length ? h('section', { class: 'card' },
      h('h3', { class: 'lst-store' }, h('span', {}, `Tachado (${marcados.length})`),
        h('button', { type: 'button', class: 'btn secondary sm', onclick: limpiar }, 'Limpiar tachados')),
      h('ul', { class: 'lst' }, marcados.map(row))) : null,
    !rows.length ? h('section', { class: 'card' }, empty('La lista está vacía.')) : null,
    h('section', { class: 'card' },
      h('h2', {}, 'Cómo se arma'),
      h('ul', { class: 'lista-ayuda' },
        h('li', {}, h('b', {}, 'Se acabó: '), 'me dijiste que se terminó y no se ha vuelto a comprar.'),
        h('li', {}, h('b', {}, 'Pronto: '), 'según cada cuánto lo compran, se acaba en los próximos 7 días; o es perecedero y vence en los próximos 3.'),
        h('li', {}, h('b', {}, 'Lo pidió: '), 'alguien lo agregó aquí o me lo pidió.')),
      h('p', { class: 'note' }, 'Cuando entra una factura, lo que compraron sale solo de la lista y se quitan los tachados.')),
  ];
}
