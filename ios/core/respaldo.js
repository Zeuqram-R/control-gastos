// Respaldo y restaurar para la app de iPhone (usa lo mismo de js/respaldo.js; el ZIP del Excel lo arma Swift).
import { ARCHIVOS, xlsxArchivos, revisarRespaldo } from '../../js/respaldo.js';

export function respaldo(D, formato, meta) {
  const datos = Object.fromEntries(ARCHIVOS.map(([k]) => [k, D[k] || []]));
  if (formato === 'json') return { texto: JSON.stringify({ _respaldo: { app: 'Control de gastos', ...meta }, ...datos }, null, 1) };
  return { archivos: xlsxArchivos(datos) };
}

export function revisar(D, texto) {
  try {
    const R = revisarRespaldo(texto, (k) => D[k] || []);
    return {
      meta: R.meta,
      partes: R.partes.map((p) => ({
        k: p.k, t: p.t, marcada: p.k !== 'tipo_cambio',
        sub: `Respaldo: ${p.n} · ahora: ${p.ahora}${p.n < p.ahora ? ` · se perderían ${p.ahora - p.n}` : p.n > p.ahora ? ` · vuelven ${p.n - p.ahora}` : ''}`,
        texto: JSON.stringify(p.datos, null, 1) + '\n',
      })),
    };
  } catch (e) { return { error: e.message }; }
}

export const claves = () => ARCHIVOS.map(([k]) => k);
