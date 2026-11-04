// Núcleo compartido con la app web: los mismos cálculos (calc.js) y la misma forma de aplicar cambios (ops.js).
// Se empaqueta con esbuild y corre dentro de JavaScriptCore en la app de iPhone.
import * as C from '../../js/calc.js';
import { applyOps } from '../../js/ops.js';
import { privacy } from '../../js/ui.js';
import { opcionesGasto, armarGasto } from '../../js/gastoRec.js';
import * as V from './resumen.js';
import * as P from './productos.js';

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
  // Vistas ya armadas (textos y números) para que la app solo las dibuje. ocultar = montos con puntitos.
  vista(nombre, dText, argsText, ocultar) {
    const fns = { lista: P.lista, agregarLista: P.agregarLista, productos: P.productos, producto: P.producto, resumen: V.resumen, categoria: V.categoria, alcanza: V.alcanza, opcionesGasto: (D) => opcionesGasto(D.gastos || []), armarGasto: (D, st, extra) => {
      const r = armarGasto(st, { tipo_cambio: D.tipo_cambio || [], cuentas: D.cuentas || [], ...extra });
      // Los registros van como texto JSON para que la app los suba sin cambiar el orden de los campos.
      return r.error ? r : { ...r, recText: JSON.stringify(r.rec), cuentaText: r.cuenta ? JSON.stringify(r.cuenta.record) : null, undoText: r.cuenta ? JSON.stringify(r.cuenta.undo) : null };
    } };
    const f = fns[nombre];
    if (!f) throw new Error(`vista ${nombre} no existe`);
    privacy.hide = ['armarGasto', 'agregarLista'].includes(nombre) ? false : !!ocultar; // lo que se guarda nunca lleva puntitos
    try { return JSON.stringify(f(parse(dText, {}), ...parse(argsText, []))); }
    finally { privacy.hide = false; }
  },
  constantes() { return JSON.stringify({ CATS: C.CATS, WINK: C.WINK, NEGOCIO: C.NEGOCIO, CAJA_NEGOCIO: C.CAJA_NEGOCIO, CATS_NEGOCIO: C.CATS_NEGOCIO }); },
};
