// Página Metas: metas de ahorro, cuánto apartar cada quincena y si la proyección alcanza.
import { h, crc, dayShort, todayCR, addDays, stat, empty, fotoRuta, fotoLocal, achicarFoto, blobABase64 } from '../ui.js';
import * as C from '../calc.js';
import { abrirHoja } from '../fuente.js';
import { abrirAlcanza } from '../alcanza.js';

export function viewMetas(ctx) {
  const D = Object.fromEntries(['gastos', 'cuentas', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas', 'abonos', 'metas'].map((k) => [k, ctx.sync.data(k)]));
  const hoy = todayCR();
  const { sync, toast } = ctx;
  const cfg = sync.config;
  const metas = C.metasInfo(D, hoy);
  const P = metas.some((m) => m.falta) ? C.proyeccion(D, hoy, 24) : null;
  const nueva = (pre = {}) => {
    const err = h('p', { class: 'error-msg', hidden: true });
    const nom = h('input', { class: 'input', id: 'm-nombre', placeholder: 'Diciembre, colchón, viaje…', autocomplete: 'off' });
    const mon = h('input', { class: 'input big-num', id: 'm-monto', inputmode: 'numeric', placeholder: '0', autocomplete: 'off' });
    const fec = h('input', { class: 'input', id: 'm-fecha', type: 'date', min: addDays(hoy, 1) });
    if (pre.nombre) nom.value = pre.nombre;
    if (pre.monto) mon.value = String(pre.monto);
    const cerrar = abrirHoja({ titulo: pre.deseo ? `Meta para «${pre.nombre}»` : 'Nueva meta de ahorro', cuerpo: [
      h('div', { class: 'field' }, h('label', { for: 'm-nombre' }, '¿Para qué?'), nom),
      h('div', { class: 'field' }, h('label', { for: 'm-monto' }, 'Cuánto (₡)'), mon),
      h('div', { class: 'field' }, h('label', { for: 'm-fecha' }, '¿Para cuándo?'), fec),
      err,
      h('button', { type: 'button', class: 'btn block', onclick: async () => {
        const monto = Number(String(mon.value).replace(/[^\d]/g, ''));
        if (!nom.value.trim() || !monto || !fec.value) { err.textContent = 'Llená los tres datos.'; err.hidden = false; return; }
        const mid = `M${Date.now().toString(36)}`;
        await sync.mutate('metas', { kind: 'upsert', record: { id: mid, nombre: nom.value.trim(), monto, fecha: fec.value, creada: hoy, por: cfg.persona, aportes: [], ...(pre.deseo ? { deseo: pre.deseo } : {}) } }, `nueva meta: ${nom.value.trim()}`);
        if (pre.deseo) await sync.mutate('deseos', { kind: 'patch', record: { id: pre.deseo, estado: 'meta', meta: mid } }, `deseo → meta: ${nom.value.trim()}`);
        cerrar(); toast('Meta creada.');
      } }, 'Crear meta'),
      h('p', { class: 'note', style: { margin: '10px 0 0' } }, 'Te digo cuánto apartar cada quincena y lo resto en la proyección de las próximas.'),
    ] });
    setTimeout(() => nom.focus(), 250);
  };
  const apartar = (m) => {
    const err = h('p', { class: 'error-msg', hidden: true });
    const mon = h('input', { class: 'input big-num', id: 'm-aporte', inputmode: 'numeric', placeholder: String(m.estaQ || ''), autocomplete: 'off' });
    let de = 'Salario';
    const seg = h('div', { class: 'seg wrap' });
    const opts = [['Salario', 'De la quincena'], ['Fondo', 'Ya estaba ahorrado']];
    const paint = () => { for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === de)); };
    for (const [v, t] of opts) seg.append(h('button', { type: 'button', 'data-v': v, onclick: () => { de = v; paint(); } }, t));
    paint();
    const cerrar = abrirHoja({ titulo: `Apartar para «${m.nombre}»`, cuerpo: [
      h('div', { class: 'field' }, h('label', { for: 'm-aporte' }, 'Cuánto (₡)'), mon,
        m.estaQ ? h('p', { class: 'note', style: { margin: '6px 0 0' } }, `Lo sugerido para esta quincena: ${crc(m.estaQ)}.`) : null),
      h('div', { class: 'field' }, h('label', {}, '¿De dónde sale?'), seg,
        h('p', { class: 'note', style: { margin: '6px 0 0' } }, 'Si sale de la quincena, se resta de lo que queda libre y se suma al fondo de ahorro.')),
      err,
      h('button', { type: 'button', class: 'btn block', onclick: async () => {
        const monto = Number(String(mon.value || m.estaQ).replace(/[^\d]/g, ''));
        if (!monto) { err.textContent = 'Poné cuánto.'; err.hidden = false; return; }
        const aportes = [...(m.aportes || []), { fecha: hoy, monto, por: cfg.persona, fuente: de }];
        await sync.mutate('metas', { kind: 'patch', record: { id: m.id, aportes } }, `aparta ${crc(monto)} para ${m.nombre}`);
        const fondo = (sync.data('cuentas') || []).find((c) => c.tipo === 'ahorro' && c.moneda !== 'USD');
        if (fondo && de === 'Salario') await sync.mutate('cuentas', { kind: 'patch', record: { id: fondo.id, saldo: (Number(fondo.saldo) || 0) + monto, fecha: hoy } }, `fondo +${crc(monto)}`);
        cerrar(); toast(`Apartado ${crc(monto)} para «${m.nombre}».`);
      } }, 'Apartar'),
    ] });
    setTimeout(() => mon.focus(), 250);
  };
  const quitar = (m) => {
    abrirHoja({ titulo: `«${m.nombre}»`, cuerpo: [
      h('ul', { class: 'rows' }, m.aportes.length ? m.aportes.slice().reverse().map((a) => h('li', {}, h('div', { class: 'main' }, `${dayShort(a.fecha)} · ${a.por || ''}`, h('span', { class: 'sub' }, a.fuente === 'Fondo' ? 'Ya estaba ahorrado' : 'De la quincena')), h('span', { class: 'amt' }, crc(Number(a.monto))))) : h('li', {}, h('div', { class: 'main' }, 'Todavía no se ha apartado nada.'))),
      h('button', { type: 'button', class: 'btn secondary block', style: { marginTop: '14px' }, onclick: async () => {
        document.querySelector('.sheet-bg')?.remove();
        await sync.mutate('metas', { kind: 'patch', record: { id: m.id, estado: 'archivada' } }, `archiva meta ${m.nombre}`);
        toast(`Meta «${m.nombre}» quitada.`, { label: 'Deshacer', fn: () => sync.mutate('metas', { kind: 'patch', record: { id: m.id, estado: 'activa' } }, `vuelve meta ${m.nombre}`) });
      } }, m.lista ? 'Archivar (ya se cumplió)' : 'Quitar esta meta'),
    ] });
  };
  const F = C.fondoAhorro(D);
  const archivadas = (D.metas || []).filter((m) => m.estado === 'archivada');
  const totalAp = C.sum(metas, (m) => m.ahorrado), totalMeta = C.sum(metas, (m) => m.meta), totalQ = C.sum(metas, (m) => m.estaQ);
  return [
    h('section', { class: 'sec' },
      h('p', { class: 'note' }, 'Cada meta te dice cuánto apartar por quincena hasta la fecha. Lo apartado de la quincena se resta de lo que queda libre, y lo que falta se resta en la proyección de las próximas.'),
      metas.length ? h('div', { class: 'tiles' },
        h('div', { class: 'card tile' }, h('div', { class: 'lbl' }, 'Apartado'), h('div', { class: 'num' }, crc(totalAp)), h('div', { class: 'sub' }, `de ${crc(totalMeta)} en ${metas.length} meta(s)`)),
        h('div', { class: 'card tile' }, h('div', { class: 'lbl' }, 'Esta quincena'), h('div', { class: 'num' }, crc(totalQ)), h('div', { class: 'sub' }, totalQ ? 'Lo que falta apartar' : 'Todo al día')),
        F.cuentas.length ? h('div', { class: 'card tile' }, h('div', { class: 'lbl' }, 'Fondo de ahorro'), h('div', { class: 'num' }, crc(F.total)), h('div', { class: 'sub' }, 'Se actualiza en Resumen → Cuentas')) : null) : null,
      h('button', { type: 'button', class: 'btn block', style: { margin: '4px 0 16px' }, onclick: () => nueva() }, 'Nueva meta')),
    h('section', { id: 'r-metas', class: 'sec' },
    metas.length ? metas.map((m) => {
      // ¿La proyección se pone en negativo antes de la fecha meta (ya restando lo de la meta)?
      const neg = P ? P.futuras.find((r) => r.q.inicio <= m.fecha && r.queda < 0) : null;
      return h('div', { class: 'card meta' },
        h('div', { class: 'cuenta-h' },
          h('div', {}, h('b', {}, m.nombre), h('span', { class: 'sub' }, `${crc(m.meta)} para el ${dayShort(m.fecha)} ${m.fecha.slice(0, 4)}`)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Más opciones', onclick: () => quitar(m) }, '⋯')),
        h('div', { class: 'meta-bar' }, h('div', { style: { width: `${m.pct * 100}%` } })),
        h('div', { class: 'qgrid' },
          stat('Apartado', crc(m.ahorrado), `${Math.round(m.pct * 100)}% de la meta`),
          m.lista ? stat('¡Listo!', '🎉', 'Ya se juntó todo') : stat(m.vencida ? 'Faltó' : 'Falta', crc(m.falta), m.vencida ? 'La fecha ya pasó' : `${m.n} quincena(s) hasta el ${dayShort(m.fecha)}`, m.vencida ? 'var(--bad)' : null),
          m.lista || m.vencida ? null : stat('Esta quincena', crc(m.estaQ), m.enActual ? `Ya apartaron ${crc(m.enActual)}` : `Después, ${crc(m.porQ)} por quincena`),
          m.lista || m.vencida ? null : stat('¿Alcanza?', neg ? 'Justo no' : 'Sí', neg ? `La quincena del ${dayShort(neg.q.inicio)} quedaría en −${crc(-neg.queda)}` : 'La proyección aguanta', neg ? 'var(--warn)' : 'var(--ok)')),
        m.lista ? null : h('button', { type: 'button', class: 'btn block', style: { marginTop: '12px' }, onclick: () => apartar(m) }, 'Apartar'));
    }) : h('div', { class: 'card' }, empty('Sin metas todavía. Creá una (por ejemplo, juntar para diciembre) y te digo cuánto apartar cada quincena.'))),
    secDeseos(ctx, D, nueva),
    archivadas.length ? h('section', { class: 'card sec' },
      h('details', { class: 'pp' }, h('summary', {}, `Metas archivadas (${archivadas.length})`),
        h('ul', { class: 'rows' }, archivadas.map((m) => h('li', {},
          h('div', { class: 'main' }, m.nombre, h('span', { class: 'sub' }, `${crc(C.sum(m.aportes || [], (a) => Number(a.monto) || 0))} de ${crc(Number(m.monto) || 0)} · ${dayShort(m.fecha)}`)),
          h('button', { type: 'button', class: 'btn secondary sm', onclick: () => sync.mutate('metas', { kind: 'patch', record: { id: m.id, estado: 'activa' } }, `vuelve meta ${m.nombre}`) }, 'Reactivar')))))) : null,
  ];
}


// Lista de deseos: cosas que quieren comprar más adelante. Con un toque se vuelven meta o se revisa si alcanza.
function secDeseos(ctx, D, nueva) {
  const { sync, toast } = ctx;
  const cfg = sync.config;
  const hoy = todayCR();
  const deseos = (sync.data('deseos') || []).filter((d) => !d.estado || d.estado === 'pendiente').sort((a, b) => (a.prioridad || 2) - (b.prioridad || 2) || String(a.creado).localeCompare(String(b.creado)));
  const hechos = (sync.data('deseos') || []).filter((d) => d.estado === 'comprado' || d.estado === 'meta');
  const PRIOS = [[1, 'Ya'], [2, 'Pronto'], [3, 'Algún día']];
  const agregar = (d = null) => {
    const err = h('p', { class: 'error-msg', hidden: true });
    const nom = h('input', { class: 'input', id: 'd-nombre', placeholder: 'Zapatos, freidora de aire, viaje a la playa…', autocomplete: 'off' });
    const pre = h('input', { class: 'input big-num', id: 'd-precio', inputmode: 'numeric', placeholder: '0', autocomplete: 'off' });
    const nota = h('input', { class: 'input', id: 'd-nota', placeholder: 'Dónde lo vieron, link, para quién… (opcional)', autocomplete: 'off' });
    let prio = d?.prioridad || 2, quien = d?.para || 'Ambos';
    const segOf = (opts, get, set) => { const w = h('div', { class: 'seg wrap' }); const paint = () => { for (const b of w.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(get()))); }; for (const [v, t] of opts) w.append(h('button', { type: 'button', 'data-v': v, onclick: () => { set(v); paint(); } }, t)); paint(); return w; };
    if (d) { nom.value = d.nombre; pre.value = d.precio ? String(d.precio) : ''; nota.value = d.nota || ''; }
    // Foto: ayuda cuando el nombre es muy general ("zapatos", "lámpara").
    const ft = { blob: null, quitar: false };
    const prev = h('div', { class: 'deseo-foto' });
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { ft.blob = await achicarFoto(f); ft.quitar = false; pintarFoto(); } catch (er) { toast('No se pudo leer esa foto.'); }
    } });
    const pintarFoto = () => {
      const tiene = ft.blob || (d?.foto && !ft.quitar);
      prev.replaceChildren(
        tiene ? (ft.blob ? h('span', { class: 'thumb big-thumb' }, h('img', { src: URL.createObjectURL(ft.blob), alt: '' })) : fotoRuta(sync, d.foto, { cls: 'thumb big-thumb', title: d.nombre })) : null,
        h('div', { class: 'deseo-foto-btns' },
          h('button', { type: 'button', class: 'btn secondary sm', onclick: () => fileIn.click() }, tiene ? 'Cambiar foto' : 'Agregar foto'),
          tiene ? h('button', { type: 'button', class: 'btn secondary sm', onclick: () => { ft.blob = null; ft.quitar = true; pintarFoto(); } }, 'Quitar') : null));
    };
    pintarFoto();
    const cerrar = abrirHoja({ titulo: d ? 'Editar deseo' : 'Agregar a la lista de deseos', cuerpo: [
      h('div', { class: 'field' }, h('label', { for: 'd-nombre' }, '¿Qué?'), nom),
      h('div', { class: 'field' }, h('label', { for: 'd-precio' }, 'Precio aproximado (₡)'), pre),
      h('div', { class: 'field' }, h('label', {}, '¿Qué tan pronto?'), segOf(PRIOS, () => prio, (v) => { prio = Number(v); })),
      h('div', { class: 'field' }, h('label', {}, '¿Para quién?'), segOf([['Ambos', 'Los dos'], ['Jose', 'Jose'], ['Ali', 'Ali']], () => quien, (v) => { quien = v; })),
      h('div', { class: 'field' }, h('label', {}, 'Foto (opcional)'), prev, fileIn),
      h('div', { class: 'field' }, h('label', { for: 'd-nota' }, 'Nota'), nota),
      err,
      h('button', { type: 'button', class: 'btn block', onclick: async () => {
        if (!nom.value.trim()) { err.textContent = '¿Qué quieren comprar?'; err.hidden = false; return; }
        const precio = Math.round(Number(String(pre.value).replace(/[^\d]/g, ''))) || null;
        const rec = { id: d?.id || `W${Date.now().toString(36)}`, nombre: nom.value.trim(), precio, prioridad: prio, para: quien, nota: nota.value.trim(), creado: d?.creado || hoy, por: d?.por || cfg.persona, estado: 'pendiente', foto: ft.quitar ? null : (d?.foto || null) };
        if (ft.blob) {
          const ruta = `fotos/deseos/${rec.id}-${Date.now().toString(36)}.jpg`;
          fotoLocal(ruta, ft.blob);
          await sync.subir([{ path: ruta, b64: await blobABase64(ft.blob) }], `${cfg.persona}: foto del deseo «${rec.nombre}»`, { resumen: `Foto: ${rec.nombre}` });
          rec.foto = ruta;
        }
        await sync.mutate('deseos', { kind: 'upsert', record: rec }, `${d ? 'edita' : 'agrega'} deseo: ${rec.nombre}`);
        cerrar(); toast(d ? 'Deseo actualizado.' : 'Agregado a la lista de deseos.');
      } }, d ? 'Guardar' : 'Agregar'),
      d ? h('div', { class: 'btn-col', style: { marginTop: '10px' } },
        h('button', { type: 'button', class: 'btn secondary block', onclick: async () => { await sync.mutate('deseos', { kind: 'patch', record: { id: d.id, estado: 'comprado', comprado: hoy } }, `deseo comprado: ${d.nombre}`); cerrar(); toast(`¡Listo! «${d.nombre}» marcado como comprado.`); } }, 'Ya lo compramos'),
        h('button', { type: 'button', class: 'btn danger block', onclick: async () => { await sync.mutate('deseos', { kind: 'delete', id: d.id }, `quita deseo: ${d.nombre}`); cerrar(); toast(`Quitado: ${d.nombre}`, { label: 'Deshacer', fn: () => sync.mutate('deseos', { kind: 'upsert', record: d }, `vuelve deseo: ${d.nombre}`) }); } }, 'Quitar de la lista')) : null,
    ] });
    if (!d) setTimeout(() => nom.focus(), 250);
  };
  const total = C.sum(deseos, (d) => d.precio || 0);
  return h('section', { id: 'm-deseos', class: 'sec' },
    h('div', { class: 'sec-head card-head' }, h('h2', {}, 'Lista de deseos'), h('button', { type: 'button', class: 'btn secondary sm', onclick: () => agregar() }, 'Agregar')),
    deseos.length ? h('div', { class: 'card' },
      h('p', { class: 'note', style: { marginTop: 0 } }, `${deseos.length} cosa(s)${total ? ` · unos ${crc(total)} en total` : ''}. Tocá una para editarla; "Meta" la convierte en meta de ahorro.`),
      h('ul', { class: 'rows' }, deseos.map((d) => h('li', {},
        h('div', { class: 'deseo-img' }, fotoRuta(sync, d.foto, { title: d.nombre }), h('span', { class: `prio p${d.prioridad || 2}`, title: PRIOS.find(([v]) => v === (d.prioridad || 2))[1] })),
        h('div', { class: 'main tap', role: 'button', onclick: () => agregar(d) }, d.nombre,
          h('span', { class: 'sub' }, [PRIOS.find(([v]) => v === (d.prioridad || 2))[1], d.para && d.para !== 'Ambos' ? `para ${d.para}` : null, d.nota].filter(Boolean).join(' · '))),
        h('div', { class: 'deseo-acc' },
          h('b', {}, d.precio ? crc(d.precio) : '—'),
          h('div', { class: 'deseo-btns' },
            d.precio ? h('button', { type: 'button', class: 'btn secondary sm', onclick: () => abrirAlcanza(ctx, { monto: d.precio, nombre: d.nombre }) }, '¿Alcanza?') : null,
            h('button', { type: 'button', class: 'btn sm', onclick: () => nueva({ nombre: d.nombre, monto: d.precio, deseo: d.id }) }, 'Meta')))))),
      hechos.length ? h('details', { class: 'pp' }, h('summary', {}, `Cumplidos (${hechos.length})`),
        h('ul', { class: 'rows' }, hechos.map((d) => h('li', {}, h('div', { class: 'main' }, d.nombre, h('span', { class: 'sub' }, d.estado === 'meta' ? 'Se volvió meta de ahorro' : `Comprado el ${dayShort(d.comprado)}`)), h('span', { class: 'amt' }, d.precio ? crc(d.precio) : ''))))) : null)
      : h('div', { class: 'card' }, empty('Anoten aquí lo que quieren comprar más adelante. Cuando se decidan por algo, lo convierten en meta con un toque o revisan si les alcanza.')));
}
