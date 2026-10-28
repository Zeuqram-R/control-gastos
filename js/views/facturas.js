// Página Facturas: subir fotos de facturas, ver cómo van, y contestar las preguntas de Claude.
import { h, crc, todayCR, dayShort, empty, ago } from '../ui.js';
import { textToB64 } from '../github.js';

const fstate = { files: [], lugar: '', fuente: 'Salario', quien: null, nota: '', subiendo: false, respuestas: {} };
const FUENTES = ['Salario', 'Wink', 'BofA', 'Préstamo', 'Efectivo'];

// Achica las fotos (máx. 2000 px, JPEG) para que suban rápido y pesen poco.
async function prepararFoto(file) {
  if (!file.type.startsWith('image/')) return { blob: file, ext: (file.name.split('.').pop() || 'pdf').toLowerCase() };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return { blob: blob || file, ext: 'jpg' };
  } catch (e) {
    return { blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() };
  }
}
const blobToB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

export function preguntasAbiertas(sync) {
  return sync.data('pendientes').filter((p) => (p.estado || 'abierta') === 'abierta' && p.respuesta == null);
}

export function viewFacturas(ctx) {
  const { sync, toast, rerender } = ctx;
  const cfg = sync.config;
  if (!fstate.quien) fstate.quien = cfg.persona;
  const lugares = sync.data('lugares');
  const pend = preguntasAbiertas(sync);
  const procesadas = sync.data('facturas').slice().sort((a, b) => String(b.procesada || b.fecha).localeCompare(String(a.procesada || a.fecha)));
  const enBandeja = sync.photoPaths('bandeja/').filter((p) => p.endsWith('/factura.json')).map((p) => p.split('/')[1]);
  const enCola = sync.uploads;

  // --- Subir ---
  const fileIn = h('input', { type: 'file', id: 'fac-file', accept: 'image/*,application/pdf', multiple: true, hidden: true,
    onchange: (e) => { fstate.files.push(...e.target.files); e.target.value = ''; rerender(); } });
  const seg = (key, opts) => h('div', { class: 'seg wrap' }, opts.map((v) => h('button', { type: 'button', 'aria-pressed': String(fstate[key] === v), onclick: () => { fstate[key] = v; rerender(); } }, v)));
  const lugarIn = h('input', { class: 'input', id: 'fac-lugar', list: 'fac-lugares', placeholder: 'Walmart, el chino, la feria…', autocomplete: 'off', oninput: (e) => { fstate.lugar = e.target.value; } });
  lugarIn.value = fstate.lugar;
  const notaIn = h('input', { class: 'input', id: 'fac-nota', placeholder: 'Algo que deba saber (opcional)', autocomplete: 'off', oninput: (e) => { fstate.nota = e.target.value; } });
  notaIn.value = fstate.nota;

  const subir = async () => {
    if (!fstate.files.length) { toast('Elegí al menos una foto de la factura.'); return; }
    fstate.subiendo = true; rerender();
    try {
      const id = `${todayCR()}-${Date.now().toString(36)}`;
      const files = [], nombres = [];
      let i = 0;
      for (const f of fstate.files) {
        const { blob, ext } = await prepararFoto(f);
        const name = `foto-${++i}.${ext}`;
        nombres.push(name);
        files.push({ path: `bandeja/${id}/${name}`, b64: await blobToB64(blob) });
      }
      const ficha = { id, subida: new Date().toISOString(), subido_por: cfg.persona, dispositivo: cfg.dispositivo, lugar: fstate.lugar.trim(), fuente: fstate.fuente, quien_pago: fstate.quien, nota: fstate.nota.trim(), archivos: nombres };
      files.push({ path: `bandeja/${id}/factura.json`, b64: textToB64(JSON.stringify(ficha, null, 1) + '\n') });
      const resumen = `${ficha.lugar || 'Factura'} · ${nombres.length} foto(s) · ${ficha.fuente}`;
      await sync.subir(files, `${cfg.persona} (${cfg.dispositivo}): factura ${resumen}`, { resumen, id });
      Object.assign(fstate, { files: [], lugar: '', nota: '', subiendo: false });
      toast('Factura en camino. Te aviso aquí cuando esté lista.');
    } catch (e) {
      fstate.subiendo = false;
      toast(`No se pudo preparar la factura: ${e.message}`);
    }
    rerender();
  };

  const previews = fstate.files.map((f, i) => {
    const url = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
    return h('div', { class: 'fac-prev' },
      url ? h('img', { src: url, alt: '' }) : h('span', { class: 'fac-pdf' }, 'PDF'),
      h('button', { type: 'button', class: 'x-btn', 'aria-label': 'Quitar', onclick: () => { fstate.files.splice(i, 1); rerender(); } }, '✕'));
  });

  return [
    pend.length ? secPreguntas(ctx, pend) : null,
    h('section', { class: 'card' },
      h('h2', {}, 'Subir una factura'),
      h('p', { class: 'note' }, 'Tomale foto (o elegila de tus fotos o archivos). Claude la lee en GitHub, anota el gasto y los productos, y si tiene dudas te pregunta aquí. Funciona sin internet: se sube sola cuando vuelva.'),
      fileIn,
      h('div', { class: 'fac-prevs' }, previews,
        h('button', { type: 'button', class: 'fac-add', onclick: () => fileIn.click() }, h('span', { class: 'plus' }, '+'), fstate.files.length ? 'Otra foto' : 'Elegir foto')),
      h('div', { class: 'field' }, h('label', { for: 'fac-lugar' }, 'Dónde'), lugarIn, h('datalist', { id: 'fac-lugares' }, lugares.map((l) => h('option', { value: l.nombre })))),
      h('div', { class: 'field' }, h('label', {}, 'Cómo se pagó'), seg('fuente', FUENTES)),
      h('div', { class: 'field' }, h('label', {}, 'Quién pagó'), seg('quien', ['Jose', 'Ali'])),
      h('div', { class: 'field' }, h('label', { for: 'fac-nota' }, 'Nota'), notaIn),
      h('button', { type: 'button', class: 'btn block', disabled: fstate.subiendo || !fstate.files.length || null, onclick: subir }, fstate.subiendo ? 'Preparando…' : 'Subir factura')),
    h('section', { class: 'card' },
      h('h2', {}, 'Facturas'),
      enCola.length || enBandeja.length || procesadas.length ? h('ul', { class: 'rows' },
        enCola.map((u) => h('li', {}, h('span', { class: 'hdot wait' }), h('div', { class: 'main' }, u.meta?.resumen || 'Factura', h('span', { class: 'sub' }, `En este aparato, esperando internet · ${ago(u.at)}`)))),
        enBandeja.map((id) => h('li', {}, h('span', { class: 'hdot work' }), h('div', { class: 'main' }, `Factura ${id.slice(0, 10)}`, h('span', { class: 'sub' }, 'En GitHub, Claude la está procesando (unos minutos)')))),
        procesadas.slice(0, 20).map((f) => h('li', {},
          h('span', { class: `hdot ${f.estado === 'error' ? 'bad' : f.estado === 'con preguntas' ? 'work' : 'ok'}` }),
          h('div', { class: 'main' }, `${f.lugar || 'Factura'}${f.fecha ? ` · ${dayShort(f.fecha)}` : ''}`,
            h('span', { class: 'sub' }, [f.articulos ? `${f.articulos} artículos` : null, f.estado === 'con preguntas' ? 'tiene preguntas' : f.estado === 'error' ? (f.resumen || 'no se pudo leer') : f.resumen].filter(Boolean).join(' · '))),
          f.total != null ? h('span', { class: 'amt' }, crc(f.total)) : null))) : empty('Todavía no se ha subido ninguna factura desde la app.')),
  ];
}

// Preguntas que Claude deja al procesar (¿es recurrente?, ¿de quién es?, nombres nuevos…).
function secPreguntas(ctx, pend) {
  const { sync, toast } = ctx;
  const cfg = sync.config;
  const responder = async (p, respuesta) => {
    if (!String(respuesta || '').trim()) return;
    await sync.mutate('pendientes', { kind: 'patch', record: { id: p.id, respuesta: String(respuesta).trim(), respondido_por: cfg.persona, respondido_en: new Date().toISOString(), estado: 'respondida' } }, `responde: ${p.pregunta.slice(0, 50)}`);
    delete fstate.respuestas[p.id];
    toast('Respuesta enviada. Claude la aplica en unos minutos.');
  };
  return h('section', { class: 'card preguntas' },
    h('h2', {}, `Preguntas de Claude (${pend.length})`),
    h('p', { class: 'note' }, 'Contestá aquí; cualquiera de los dos puede hacerlo.'),
    pend.map((p) => {
      const txt = h('input', { class: 'input', id: `pq-${p.id}`, placeholder: 'Otra respuesta…', autocomplete: 'off', oninput: (e) => { fstate.respuestas[p.id] = e.target.value; } });
      txt.value = fstate.respuestas[p.id] || '';
      txt.addEventListener('keydown', (e) => { if (e.key === 'Enter') responder(p, txt.value); });
      return h('div', { class: 'pq' },
        h('div', { class: 'pq-q' }, p.pregunta),
        p.detalle ? h('div', { class: 'pq-d' }, p.detalle) : null,
        p.opciones?.length ? h('div', { class: 'pq-ops' }, p.opciones.map((o) => h('button', { type: 'button', class: 'btn secondary sm', onclick: () => responder(p, o) }, o))) : null,
        p.permite_texto !== false ? h('div', { class: 'row-add' }, txt, h('button', { type: 'button', class: 'btn sm', onclick: () => responder(p, txt.value) }, 'Enviar')) : null);
    }));
}
