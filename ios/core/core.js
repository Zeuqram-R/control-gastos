// Núcleo compartido con la app web: los mismos cálculos (calc.js) y la misma forma de aplicar cambios (ops.js).
// Se empaqueta con esbuild y corre dentro de JavaScriptCore en la app de iPhone.
import * as C from '../../js/calc.js';
import { applyOps } from '../../js/ops.js';

const parse = (t, d) => { if (t == null || t === '') return d; return JSON.parse(t); };

globalThis.Core = {
  version: 1,
  // Archivo del repo + cambios pendientes → texto tal como lo guarda la app web (sangría de 1 espacio).
  aplicar(baseText, opsText) {
    return JSON.stringify(applyOps(parse(baseText, []), parse(opsText, [])), null, 1) + '\n';
  },
  // Lo mismo pero compacto, para leer los datos en la app.
  datos(baseText, opsText) {
    return JSON.stringify(applyOps(parse(baseText, []), parse(opsText, [])));
  },
  // Llama cualquier función de calc.js con D (los datos) y los demás argumentos; devuelve JSON.
  calc(nombre, dText, argsText) {
    const f = C[nombre];
    if (typeof f !== 'function') throw new Error(`calc.${nombre} no existe`);
    const r = f(parse(dText, {}), ...parse(argsText, []));
    return JSON.stringify(r === undefined ? null : r);
  },
  constantes() { return JSON.stringify({ CATS: C.CATS, WINK: C.WINK, NEGOCIO: C.NEGOCIO, CAJA_NEGOCIO: C.CAJA_NEGOCIO, CATS_NEGOCIO: C.CATS_NEGOCIO }); },
};
