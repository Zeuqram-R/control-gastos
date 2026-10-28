// Respaldo descargable: todos los datos en un Excel (una hoja por archivo) o en JSON completo.
// El Excel se arma aquí mismo (un .xlsx es un ZIP con XML adentro), sin librerías.

export const ARCHIVOS = [
  ['gastos', 'Gastos'], ['pagos_recurrentes', 'Recurrentes pagados'], ['recurrentes', 'Recurrentes'], ['deudas', 'Deudas'],
  ['pagos_deudas', 'Deudas pagadas'], ['abonos', 'Abonos'], ['cuentas', 'Cuentas'], ['metas', 'Metas'], ['deseos', 'Lista de deseos'], ['negocio', 'Santo Coco ventas'], ['saldos', 'Saldos'],
  ['ingresos', 'Ingresos'], ['presupuestos', 'Presupuestos'], ['compras', 'Compras'], ['productos', 'Productos'],
  ['eventos', 'Eventos'], ['lista', 'Lista'], ['lugares', 'Lugares'], ['facturas', 'Facturas'], ['pendientes', 'Preguntas de Claude'], ['notas', 'Notas'], ['tipo_cambio', 'Tipo de cambio'],
];
const PRIMERO = ['id', 'fecha', 'nombre', 'comercio', 'concepto', 'producto', 'categoria', 'monto', 'monto_crc', 'moneda', 'fuente', 'tipo'];

function columnas(rows) {
  const set = new Set();
  for (const r of rows) for (const k of Object.keys(r || {})) set.add(k);
  return [...PRIMERO.filter((k) => set.has(k)), ...[...set].filter((k) => !PRIMERO.includes(k))];
}
const celda = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v);

// --- ZIP sin compresión ---
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let off = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), c = crc32(d);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, c, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true); lh.setUint16(26, n.length, true);
    parts.push(new Uint8Array(lh.buffer), n, d);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, c, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, n.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), n);
    off += 30 + n.length + d.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// --- XLSX ---
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function hoja(rows) {
  const cols = columnas(rows);
  const fila = (vals, r, bold) => `<row r="${r}">${vals.map((v, i) => {
    const ref = `${colName(i)}${r}`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${bold ? ' s="1"' : ''}><v>${v}</v></c>`;
    if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
    return v === '' ? '' : `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`;
  const widths = cols.map((c) => Math.min(48, Math.max(c.length, ...rows.slice(0, 200).map((r) => String(celda(r[c])).length)) + 2));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + (cols.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '')
    + `<sheetData>${fila(cols, 1, true)}${rows.map((r, i) => fila(cols.map((c) => celda(r[c])), i + 2)).join('')}</sheetData></worksheet>`;
}
export function excel(datos) {
  const hojas = ARCHIVOS.filter(([k]) => datos[k]);
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map(([, t], i) => `<sheet name="${esc(t)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ...hojas.map(([k], i) => [`xl/worksheets/sheet${i + 1}.xml`, hoja(datos[k])]),
  ];
  return zip(files);
}

export function bajar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function respaldar(sync, formato, hoy) {
  const datos = Object.fromEntries(ARCHIVOS.map(([k]) => [k, sync.data(k) || []]));
  if (formato === 'json') {
    const meta = { app: 'Control de gastos', fecha: new Date().toISOString(), por: sync.config?.persona, dispositivo: sync.config?.dispositivo };
    bajar(new Blob([JSON.stringify({ _respaldo: meta, ...datos }, null, 1)], { type: 'application/json' }), `control-de-gastos-${hoy}.json`);
  } else bajar(excel(datos), `control-de-gastos-${hoy}.xlsx`);
}

// Lee un respaldo .json y dice qué trae, comparado con lo que hay ahora.
export async function leerRespaldo(file, sync) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch (e) { throw new Error('Ese archivo no es un respaldo JSON válido.'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Ese archivo no es un respaldo de la app.');
  const partes = ARCHIVOS.filter(([k]) => Array.isArray(obj[k])).map(([k, t]) => ({ k, t, n: obj[k].length, ahora: (sync.data(k) || []).length, datos: obj[k] }));
  if (!partes.length) throw new Error('Ese archivo no trae datos de la app (¿es el Excel? Para restaurar se usa la copia JSON).');
  const malos = partes.filter((p) => p.datos.some((r) => !r || typeof r !== 'object' || r.id == null));
  if (malos.length) throw new Error(`El respaldo parece dañado (${malos.map((p) => p.t).join(', ')}).`);
  return { meta: obj._respaldo || null, partes };
}
