// Arma el registro de un gasto anotado a mano (lo usan la app web y la app de iPhone, así quedan iguales).
import { crc, usd, nombrePropio } from './ui.js';
import * as C from './calc.js';

export const FUENTES = ['Salario', 'Wink', 'BofA', 'Préstamo', 'Efectivo'];
export const TIPOS = [['Variable', 'Variable', 'Súper, comida, transporte…'], ['Una vez', 'De una vez', 'Algo puntual']];

// Viajes (Uber, DiDi, taxi): el detalle queda como "origen → destino".
// "Walmart Río Oro a la casa" → "Walmart Río Oro → casa"; "Casa a donde Jesse" → "Casa → Jesse".
export const VIAJE = /^(uber|didi|indrive|indriver|in[ -]drive|in driver|taxi|bus|autob[uú]s|buseta|tren)\b/i;
// Gasolina: no lleva ruta; se marca para ver cuánto se va cuando les prestan el carro.
export const GASOLINA = /(gasolin|combustible|bomba|servicentro|estaci[oó]n de servicio|\bdelta\b|\bpuma\b|\buno\b|\btotal\b|\bgulf\b)/i;
export const subViaje = (c) => (/^(bus|autob[uú]s|buseta)/i.test(c) ? 'Bus' : /^tren/i.test(c) ? 'Tren' : /^taxi/i.test(c) ? 'Taxi' : /^didi/i.test(c) ? 'DiDi' : /^in/i.test(c) ? 'InDrive' : 'Uber');
export function ruta(txt) {
  let t = String(txt || '').trim();
  if (!t) return t;
  if (t.includes('→')) return t.split('→').map((x) => nombrePropio(x)).join(' → ');
  t = t.replace(/^(de|desde)\s+(la\s+|el\s+)?/i, '').replace(/^(a\s*)?donde\s+/i, '');
  const m = t.match(/^(.+?)\s+(?:a|al|adonde|hacia|hasta|para|->|-)\s+(?:la\s+|el\s+)?(.+)$/i);
  if (!m) return t;
  const dest = m[2].trim().replace(/^(a\s*)?donde\s+/i, '');
  return `${nombrePropio(m[1])} → ${nombrePropio(dest)}`;
}

// Opciones del formulario: categorías, comercios conocidos y lo último anotado en cada comercio (para adivinar la categoría).
export function opcionesGasto(gastos) {
  const porComercio = {};
  for (const g of gastos.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))) if (g.comercio) porComercio[g.comercio.toLowerCase()] = { categoria: g.categoria, tipo: g.tipo, negocio: !!g.negocio };
  return {
    catsCasa: [...new Set([...C.CATS, 'Transporte', ...gastos.filter((g) => !g.negocio).map((g) => g.categoria).filter(Boolean)])],
    catsNeg: [...new Set([...C.CATS_NEGOCIO, ...gastos.filter((g) => g.negocio).map((g) => g.categoria).filter(Boolean)])],
    comercios: [...new Set(gastos.map((g) => g.comercio).filter(Boolean))],
    porComercio,
    fuentes: FUENTES, fuentesNeg: [C.CAJA_NEGOCIO, ...FUENTES], cajaNegocio: C.CAJA_NEGOCIO, tipos: TIPOS,
  };
}

// st: { monto, moneda, comercio, desc, categoria, tipo, fuente, quien, fecha, negocio }
// Devuelve { error } o { rec, summary, montoCRC, cuenta: { record, antes, summary, undo } | null }.
export function armarGasto(st, { persona, tipo_cambio = [], cuentas = [], hoy, id }) {
  const n = Number(String(st.monto).replace(/[^\d.]/g, ''));
  if (!n) return { error: 'Poné el monto.', campo: 'monto' };
  if (!String(st.comercio || '').trim()) return { error: '¿En qué fue? (el lugar o a quién se le pagó)', campo: 'comercio' };
  if (!st.categoria) return { error: 'Elegí la categoría.', campo: 'categoria' };
  const tc = C.ultimoTC(tipo_cambio);
  if (st.moneda === 'USD' && !tc) return { error: 'No tengo tipo de cambio para pasarlo a colones.', campo: 'monto' };
  const montoCRC = st.moneda === 'USD' ? Math.round(n * Number(tc.venta)) : Math.round(n);
  const com = String(st.comercio).trim();
  const viaje = VIAJE.test(com);
  const rec = {
    id: id || `GM-${Date.now().toString(36)}`, fecha: st.fecha, comercio: viaje && !/\s/.test(com) ? subViaje(com) : nombrePropio(st.comercio), categoria: st.categoria, subcategoria: viaje ? subViaje(com) : (st.categoria === 'Transporte' && GASOLINA.test(st.comercio)) ? 'Gasolina' : '',
    descripcion: viaje ? ruta(st.desc) : String(st.desc || '').trim(), monto: montoCRC, tipo: st.tipo, fuente: st.fuente, metodo_pago: st.fuente === 'Efectivo' ? 'Efectivo' : '',
    nota: [`Anotado en la app por ${persona}`, st.quien !== persona ? `pagó ${st.quien}` : null, st.moneda === 'USD' ? `${usd(n)} al tipo de cambio de ${crc(Number(tc.venta))}` : null].filter(Boolean).join(' · '),
    quien_pago: st.quien,
    ...(st.negocio ? { negocio: C.NEGOCIO } : {}),
  };
  // Si salió de una cuenta (BofA), se descuenta del saldo.
  const cta = cuentas.find((c) => c.fuente === st.fuente);
  let cuenta = null;
  if (cta) {
    const antes = Number(cta.saldo) || 0;
    const resta = cta.moneda === 'USD' ? (st.moneda === 'USD' ? n : Math.round((n / Number(tc?.venta || 1)) * 100) / 100) : montoCRC;
    cuenta = { record: { id: cta.id, saldo: Math.round((antes - resta) * 100) / 100, fecha: hoy }, undo: { id: cta.id, saldo: antes }, antes, summary: `saldo de ${cta.nombre} por gasto`, undoSummary: `saldo de ${cta.nombre}` };
  }
  return { rec, montoCRC, summary: `gasto: ${rec.comercio} ${crc(montoCRC)}`, undoSummary: `deshace gasto ${rec.comercio}`, cuenta };
}
