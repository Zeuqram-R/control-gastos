// Presupuestos sugeridos: por categoría, mirando lo que gastan, cuánto les dura la comida y los patrones (Uber, gasolina…).
import { h, crc, dayShort, todayCR, addDays, daysBetween } from './ui.js';
import * as C from './calc.js';
import { abrirHoja } from './fuente.js';

const redondear = (v, a = 1000) => Math.ceil(v / a) * a;
const DIAS_Q = 15;
const GASOLINA = /gasolin|combustible|bomba|servicentro|estaci[oó]n de servicio|\bdelta\b|\bpuma\b|\buno\b|\btotal\b|\bgulf\b/i;
const UBER = /uber|didi|indriver|taxi/i;

// Súper por rotación: cada producto que compran, cuánto cuesta y cada cuánto se acaba → costo por quincena.
function superPorRotacion(compras, productos, eventos) {
  const cat = C.catalogo(compras, productos);
  const items = [];
  for (const p of cat) {
    const filas = compras.filter((r) => r.clave === p.clave);
    const ultimaF = p.ultima;
    const costo = C.sum(filas.filter((r) => String(r.fecha).slice(0, 10) === ultimaF), (r) => Number(r.total) || 0);
    if (!costo) continue;
    const durs = C.duraciones(compras, eventos, p.clave).map((d) => d.dias).filter((d) => d > 0);
    let dias, fuente;
    if (durs.length) { dias = Math.round(C.sum(durs) / durs.length); fuente = 'les dura'; }
    else if (p.cada_dias) { dias = p.cada_dias; fuente = 'lo compran cada'; }
    else if (p.perecedero && p.vida_util_dias) { dias = p.vida_util_dias; fuente = 'dura'; }
    else { dias = 30; fuente = 'supongo'; }
    dias = Math.max(dias, 3);
    items.push({ producto: p.producto, costo, dias, fuente, porQ: (costo * DIAS_Q) / dias, perecedero: p.perecedero, vida: p.vida_util_dias, durs });
  }
  items.sort((a, b) => b.porQ - a.porQ);
  return { total: C.sum(items, (i) => i.porQ), items };
}

export function analizar(D, hoy) {
  const movs = C.movimientos(D).filter((m) => !m.negocio);
  const q0 = C.quincenaDe(hoy);
  const fechas = movs.map((m) => m.fecha).sort();
  const ini = fechas.length ? C.quincenaDe(fechas[0]).inicio : q0.inicio;
  const cerradas = [];
  for (let q = C.quincenaDe(ini); q.inicio < q0.inicio; q = C.quincenaDe(addDays(q.fin, 1))) cerradas.push(q);
  const variables = movs.filter((m) => m.gtipo === 'Variable');
  const cats = [...new Set([...['Súper', 'Transporte', 'Salidas', 'Weed', 'Vapos'], ...variables.map((m) => m.categoria)])];
  const rot = superPorRotacion(D.compras || [], D.productos || [], D.eventos || []);
  const filas = cats.map((c) => {
    const porQ = cerradas.map((q) => C.sum(variables.filter((m) => m.categoria === c && m.fecha >= q.inicio && m.fecha <= q.fin), (m) => m.monto));
    const actualQ = C.sum(variables.filter((m) => m.categoria === c && m.fecha >= q0.inicio && m.fecha <= q0.fin), (m) => m.monto);
    const prom = porQ.length ? C.sum(porQ) / porQ.length : null;
    let sugerido = null, por = '';
    if (porQ.length >= 2) {
      sugerido = redondear(prom * 1.1);
      por = `Promedio de ${porQ.length} quincenas (${crc(prom)}) + 10% de margen.`;
      const max = Math.max(...porQ);
      if (max > prom * 1.5) por += ` Varía bastante: una quincena llegó a ${crc(max)}.`;
    }
    if (c === 'Súper' && rot.items.length) {
      const r = redondear(rot.total);
      const txtRot = `Por lo que compran y cada cuánto se acaba, el súper anda en ${crc(rot.total)} por quincena.`;
      if (sugerido == null) { sugerido = r; por = txtRot; }
      else { sugerido = redondear(Math.max(sugerido, rot.total)); por += ` ${txtRot}`; }
    }
    if (sugerido == null && actualQ) { por = `Van ${crc(actualQ)} esta quincena; con 2 quincenas cerradas te sugiero un monto.`; }
    return { categoria: c, sugerido, por, actualQ, vigente: C.presupuestoVigente(D.presupuestos || [], c, q0.inicio) };
  }).filter((f) => f.sugerido != null || f.actualQ || f.vigente);

  // Lo que noté (patrones).
  const hallazgos = [];
  if (rot.items.length) {
    const top = rot.items.slice(0, 3).map((i) => `${i.producto} (${i.fuente === 'supongo' ? 'supongo un mes' : `${i.fuente} ~${i.dias} días`})`).join(', ');
    hallazgos.push(`En el súper lo que más pesa por quincena: ${top}.`);
    const rapidos = rot.items.filter((i) => i.durs.length && i.vida && Math.min(...i.durs) < i.vida * 0.7);
    if (rapidos.length) hallazgos.push(`Se les acaba más rápido de lo que dura: ${rapidos.slice(0, 3).map((i) => i.producto).join(', ')}. Compren un poco más o más seguido.`);
    const lentos = rot.items.filter((i) => i.durs.length && i.vida && Math.max(...i.durs) > i.vida * 1.2);
    if (lentos.length) hallazgos.push(`Les dura más de lo esperado (podrían comprar menos o más pequeño): ${lentos.slice(0, 3).map((i) => i.producto).join(', ')}.`);
  }
  const trans = movs.filter((m) => m.tipo === 'gasto' && (m.categoria === 'Transporte' || UBER.test(`${m.titulo} ${m.sub}`) || GASOLINA.test(`${m.titulo} ${m.sub}`)));
  const ubers = trans.filter((m) => UBER.test(`${m.titulo} ${m.sub}`));
  if (ubers.length >= 4) {
    const finde = ubers.filter((m) => [0, 6].includes(new Date(`${m.fecha}T12:00:00Z`).getUTCDay()));
    const pct = finde.length / ubers.length;
    if (pct >= 0.5) hallazgos.push(`El ${Math.round(pct * 100)}% de los viajes en Uber son de fin de semana (${crc(C.sum(finde, (m) => m.monto))}).`);
    const semanas = new Map();
    for (const m of ubers) { const d = new Date(`${m.fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); semanas.set(k, (semanas.get(k) || 0) + m.monto); }
    if (semanas.size >= 3) {
      const vals = [...semanas.values()], prom = C.sum(vals) / vals.length;
      const [ks, vs] = [...semanas].sort((a, b) => b[1] - a[1])[0];
      if (vs > prom * 1.5) hallazgos.push(`La semana del ${dayShort(ks)} gastaron ${crc(vs)} en Uber, bastante más que el promedio (${crc(prom)} por semana).`);
    }
  } else if (ubers.length) hallazgos.push(`Uber: ${ubers.length} viaje(s) por ${crc(C.sum(ubers, (m) => m.monto))}. Con más viajes te digo qué días o semanas se dispara.`);
  const gas = trans.filter((m) => GASOLINA.test(`${m.titulo} ${m.sub}`));
  if (gas.length) hallazgos.push(`Gasolina (cuando les prestan el carro): ${gas.length} vez/veces, en promedio ${crc(C.sum(gas, (m) => m.monto) / gas.length)} cada una.`);
  if (cerradas.length < 2) hallazgos.push(`Van ${cerradas.length} de 2 quincenas cerradas: con más datos los montos se ajustan solos a lo que de verdad gastan.`);
  return { filas, hallazgos, cerradas: cerradas.length, q0 };
}

export function abrirPresupuestos(ctx, D) {
  const { sync, toast } = ctx;
  const hoy = todayCR();
  const A = analizar(D, hoy);
  const inputs = new Map();
  const guardar = async (f) => {
    const v = Math.round(Number(String(inputs.get(f.categoria).value).replace(/[^\d]/g, '')));
    if (!v) { toast('Poné un monto.'); return false; }
    const slug = f.categoria.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
    await sync.mutate('presupuestos', { kind: 'upsert', record: { id: `PR-${slug}-${A.q0.inicio}`, categoria: f.categoria, monto: v, desde: A.q0.inicio, por: sync.config.persona } }, `presupuesto ${f.categoria}: ${crc(v)}`);
    return true;
  };
  abrirHoja({ titulo: 'Presupuestos por quincena', kicker: 'Sugeridos', cuerpo: [
    h('p', { class: 'note' }, 'Un tope por quincena para cada tipo de gasto del día a día. Te sugiero un monto según lo que gastan y lo que compran; cambialo si querés y guardalo. Las barras de "Por tipo de gasto" lo usan.'),
    A.hallazgos.length ? h('div', { class: 'card sug-hall' }, h('b', {}, 'Lo que noté'), h('ul', {}, A.hallazgos.map((t) => h('li', {}, t)))) : null,
    A.filas.length ? A.filas.map((f) => {
      const input = h('input', { class: 'input', inputmode: 'numeric', placeholder: f.sugerido ? String(f.sugerido) : '0', autocomplete: 'off' });
      input.value = f.vigente ? String(f.vigente) : f.sugerido ? String(f.sugerido) : '';
      inputs.set(f.categoria, input);
      return h('div', { class: 'sug-row' },
        h('div', { class: 'sug-h' }, h('b', {}, f.categoria),
          f.vigente ? h('span', { class: 'pill rec' }, `Ahora: ${crc(f.vigente)}`) : f.sugerido ? h('span', { class: 'pill' }, `Sugerido: ${crc(f.sugerido)}`) : null),
        f.por ? h('p', { class: 'note', style: { margin: '4px 0 6px' } }, f.por) : null,
        h('div', { class: 'row-add' }, input, h('button', { type: 'button', class: 'btn sm', onclick: async () => { if (await guardar(f)) toast(`Presupuesto de ${f.categoria} guardado.`); } }, 'Guardar')));
    }) : h('p', { class: 'note' }, 'Todavía no hay gastos del día a día para sugerir.'),
    A.filas.length > 1 ? h('button', { type: 'button', class: 'btn block', style: { marginTop: '14px' }, onclick: async () => {
      let n = 0;
      for (const f of A.filas) if (inputs.get(f.categoria).value.trim() && await guardar(f)) n++;
      document.querySelector('.sheet-bg')?.remove();
      toast(`${n} presupuesto(s) guardado(s).`);
    } }, 'Guardar todos') : null,
  ] });
}
