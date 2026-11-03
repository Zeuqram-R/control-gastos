// Aplica la cola de cambios a un archivo de datos (lo usan la app web y la app de iPhone).
export function applyOps(rows, ops) {
  const out = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
  for (const op of ops) {
    const i = out.findIndex((r) => r.id === (op.kind === 'delete' ? op.id : op.record.id));
    if (op.kind === 'delete') { if (i >= 0) out.splice(i, 1); }
    else if (op.kind === 'patch') { if (i >= 0) out[i] = { ...out[i], ...op.record }; else out.push({ ...op.record }); }
    else if (i >= 0) out[i] = { ...op.record };
    else out.push({ ...op.record });
  }
  return out;
}
