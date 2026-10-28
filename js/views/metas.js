// Página Metas: metas de ahorro, cuánto apartar cada quincena y si la proyección alcanza.
import { h, crc, dayShort, todayCR, addDays, stat, empty } from '../ui.js';
import * as C from '../calc.js';
import { abrirHoja } from '../fuente.js';

export function viewMetas(ctx) {
  const D = Object.fromEntries(['gastos', 'cuentas', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas', 'abonos', 'metas'].map((k) => [k, ctx.sync.data(k)]));
  const hoy = todayCR();
  const { sync, toast } = ctx;
  const cfg = sync.config;
  const metas = C.metasInfo(D, hoy);
  const P = metas.some((m) => m.falta) ? C.proyeccion(D, hoy, 24) : null;
  const nueva = () => {
    const err = h('p', { class: 'error-msg', hidden: true });
    const nom = h('input', { class: 'input', id: 'm-nombre', placeholder: 'Diciembre, colchón, viaje…', autocomplete: 'off' });
    const mon = h('input', { class: 'input big-num', id: 'm-monto', inputmode: 'numeric', placeholder: '0', autocomplete: 'off' });
    const fec = h('input', { class: 'input', id: 'm-fecha', type: 'date', min: addDays(hoy, 1) });
    const cerrar = abrirHoja({ titulo: 'Nueva meta de ahorro', cuerpo: [
      h('div', { class: 'field' }, h('label', { for: 'm-nombre' }, '¿Para qué?'), nom),
      h('div', { class: 'field' }, h('label', { for: 'm-monto' }, 'Cuánto (₡)'), mon),
      h('div', { class: 'field' }, h('label', { for: 'm-fecha' }, '¿Para cuándo?'), fec),
      err,
      h('button', { type: 'button', class: 'btn block', onclick: async () => {
        const monto = Number(String(mon.value).replace(/[^\d]/g, ''));
        if (!nom.value.trim() || !monto || !fec.value) { err.textContent = 'Llená los tres datos.'; err.hidden = false; return; }
        await sync.mutate('metas', { kind: 'upsert', record: { id: `M${Date.now().toString(36)}`, nombre: nom.value.trim(), monto, fecha: fec.value, creada: hoy, por: cfg.persona, aportes: [] } }, `nueva meta: ${nom.value.trim()}`);
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
      h('button', { type: 'button', class: 'btn block', style: { margin: '4px 0 16px' }, onclick: nueva }, 'Nueva meta')),
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
    archivadas.length ? h('section', { class: 'card sec' },
      h('details', { class: 'pp' }, h('summary', {}, `Metas archivadas (${archivadas.length})`),
        h('ul', { class: 'rows' }, archivadas.map((m) => h('li', {},
          h('div', { class: 'main' }, m.nombre, h('span', { class: 'sub' }, `${crc(C.sum(m.aportes || [], (a) => Number(a.monto) || 0))} de ${crc(Number(m.monto) || 0)} · ${dayShort(m.fecha)}`)),
          h('button', { type: 'button', class: 'btn secondary sm', onclick: () => sync.mutate('metas', { kind: 'patch', record: { id: m.id, estado: 'activa' } }, `vuelve meta ${m.nombre}`) }, 'Reactivar')))))) : null,
  ];
}

