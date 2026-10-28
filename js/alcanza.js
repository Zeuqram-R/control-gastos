// "¿Me alcanza?": antes de comprar algo, ver cómo quedarían esta quincena y las próximas.
import { h, crc, dayShort, todayCR, privacy } from './ui.js';
import * as C from './calc.js';
import { abrirHoja } from './fuente.js';

const CLAVES = ['gastos', 'cuentas', 'presupuestos', 'ingresos', 'saldos', 'tipo_cambio', 'recurrentes', 'deudas', 'pagos_recurrentes', 'pagos_deudas', 'abonos', 'metas', 'negocio'];
export const datosDe = (sync) => Object.fromEntries(CLAVES.map((k) => [k, sync.data(k) || []]));

const signo = (v) => `${v < 0 && !privacy.hide ? '−' : ''}${crc(Math.abs(v))}`;

export function abrirAlcanza(ctx, pre = {}) {
  const D = datosDe(ctx.sync);
  const hoy = todayCR();
  const B = C.balanceQuincena(D, hoy);
  const P = C.proyeccion(D, hoy, 6);
  const F = C.fondoAhorro(D);
  const metas = C.metasInfo(D, hoy).filter((m) => m.estaQ > 0 && !m.vencida);
  const st = { cuando: 'ahora' };
  const res = h('div', { class: 'alc-res' });
  const monto = h('input', { class: 'input big-num', id: 'a-monto', inputmode: 'numeric', placeholder: '0', autocomplete: 'off', oninput: () => pintar() });
  if (pre.monto) monto.value = String(pre.monto);
  const seg = h('div', { class: 'seg wrap' });
  const opts = [['ahora', 'Esta quincena'], ['proxima', `La próxima (${dayShort(P.futuras[0].q.inicio)})`]];
  for (const [v, t] of opts) seg.append(h('button', { type: 'button', 'data-v': v, onclick: () => { st.cuando = v; pintar(); } }, t));

  function pintar() {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === st.cuando));
    const n = Math.round(Number(String(monto.value).replace(/[^\d.]/g, ''))) || 0;
    if (!n) { res.replaceChildren(h('p', { class: 'note' }, 'Escribí cuánto cuesta y te digo cómo quedan las cuentas.')); return; }
    // Si se compra ahora, baja lo libre de esta quincena y se arrastra a las siguientes; si es la próxima, desde esa.
    const ahora = st.cuando === 'ahora';
    const quedaAhora = B.queda - (ahora ? n : 0);
    const futuras = P.futuras.map((r) => ({ ...r, despues: r.queda - n }));
    const primeraRoja = futuras.find((r) => r.despues < 0);
    const peorAntes = Math.min(B.queda, ...P.futuras.map((r) => r.queda));
    let veredicto, cls;
    if ((ahora && quedaAhora < 0) || (!ahora && futuras[0].despues < 0)) { veredicto = 'No alcanza'; cls = 'bad'; }
    else if (primeraRoja) { veredicto = 'Alcanza, pero aprieta'; cls = 'warn'; }
    else { veredicto = 'Sí alcanza'; cls = 'ok'; }
    const metaTxt = metas.length && ((ahora && quedaAhora < C.sum(metas, (m) => m.estaQ)) || primeraRoja)
      ? `Ojo con las metas: lo que toca apartar (${crc(C.sum(metas, (m) => m.estaQ))} esta quincena) quedaría más difícil.` : null;
    const fila = (lbl, antes, despues) => h('li', {},
      h('div', { class: 'main' }, lbl),
      h('span', { class: 'alc-antes' }, signo(antes)),
      h('span', { class: 'alc-flecha' }, '→'),
      h('b', { style: { color: despues < 0 ? 'var(--bad)' : null } }, signo(despues)));
    res.replaceChildren(...[
      h('div', { class: `alc-ver ${cls}` }, veredicto),
      h('p', { class: 'note', style: { margin: '6px 0 10px' } }, primeraRoja
        ? `La quincena del ${dayShort(primeraRoja.q.inicio)} quedaría en ${signo(primeraRoja.despues)}.${F.total && primeraRoja.despues + F.total >= 0 ? ` El fondo de ahorro (${crc(F.total)}) lo cubriría.` : ''}`
        : peorAntes - n >= 0 ? `Después de comprarlo, la quincena más apretada de las próximas quedaría en ${signo(Math.min(ahora ? quedaAhora : Infinity, ...futuras.map((r) => r.despues)))}.` : ''),
      h('ul', { class: 'rows alc-rows' },
        ahora ? fila(`Esta quincena (hasta el ${dayShort(B.q.fin)})`, B.queda, quedaAhora) : null,
        futuras.map((r) => fila(`${dayShort(r.q.inicio)} – ${dayShort(r.q.fin)}`, r.queda, r.despues))),
      metaTxt ? h('p', { class: 'note', style: { margin: '10px 0 0' } }, metaTxt) : null,
      h('p', { class: 'note', style: { margin: '10px 0 0' } }, 'Es la misma proyección de Resumen (salario, pagos con fecha, Wink y el gasto del día a día estimado), restando esta compra.')].filter(Boolean));
  }
  abrirHoja({ titulo: pre.nombre ? `¿Me alcanza para «${pre.nombre}»?` : '¿Me alcanza?', kicker: 'Antes de comprar', cuerpo: [
    h('div', { class: 'field' }, h('label', { for: 'a-monto' }, '¿Cuánto cuesta? (₡)'), monto),
    h('div', { class: 'field' }, h('label', {}, '¿Cuándo lo comprarían?'), seg),
    res,
  ] });
  pintar();
  if (!pre.monto) setTimeout(() => monto.focus(), 250);
}
