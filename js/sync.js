// Motor de sincronización: copia local de los datos + cola de cambios que se suben a GitHub.
import { store } from './store.js';
import { createClient, b64ToText, textToB64, b64ToBlob, GitHubError } from './github.js';

const DATA_PREFIX = 'data/';

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

export function createSync({ onChange, onStatus, onLog }) {
  let cfg = null;
  let client = null;
  const files = new Map(); // path -> { sha, data }
  const shas = new Map(); // path -> sha (todo el repo, incluye fotos)
  let queue = [];
  let uploads = []; // commits de archivos (facturas) esperando internet
  let syncing = false;
  let again = false;
  let log = [];
  let retryTimer = null;
  let retryDelay = 4000;
  const status = { state: 'idle', lastSync: null, pending: 0, message: '' };

  const emitStatus = (patch) => {
    Object.assign(status, patch, { pending: queue.length + uploads.length });
    onStatus && onStatus({ ...status });
  };
  const emitChange = () => onChange && onChange();

  async function saveQueue() { await store.set('queue', 'ops', queue); }

  // Historial de lo que hizo este dispositivo (verde = funcionó, rojo = falló).
  async function addLog(entry) {
    const now = new Date().toISOString();
    const last = log[0];
    if (!entry.ok && last && !last.ok && last.titulo === entry.titulo) {
      last.at = now; last.veces = (last.veces || 1) + 1; last.detalle = entry.detalle;
    } else {
      log.unshift({ id: `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: now, ...entry });
      log = log.slice(0, 300);
    }
    await store.set('config', 'log', log);
    onLog && onLog();
  }
  const nombre = (path) => path.replace(DATA_PREFIX, '').replace(/\.json$/, '').replace(/_/g, ' ');

  const api = {
    get config() { return cfg; },
    get status() { return { ...status }; },
    get log() { return log.slice(); },
    get queue() { return queue.slice(); },
    get uploads() { return uploads.map((u) => ({ id: u.id, at: u.at, meta: u.meta, n: u.files.length })); },

    // Subir varios archivos juntos (una factura: fotos + ficha). Si no hay internet, queda en cola.
    async subir(files, message, meta) {
      uploads.push({ id: `U${Date.now().toString(36)}`, at: new Date().toISOString(), files, message, meta: meta || {} });
      await store.set('queue', 'uploads', uploads);
      emitStatus({});
      api.sync();
    },

    async init() {
      cfg = (await store.get('config', 'cfg')) || null;
      if (cfg) client = createClient(cfg.token);
      for (const [path, v] of await store.all('files')) {
        if (path.startsWith(DATA_PREFIX)) files.set(path, v);
      }
      const sh = (await store.get('config', 'shas')) || {};
      for (const [p, s] of Object.entries(sh)) shas.set(p, s);
      queue = (await store.get('queue', 'ops')) || [];
      uploads = (await store.get('queue', 'uploads')) || [];
      status.lastSync = (await store.get('config', 'lastSync')) || null;
      log = (await store.get('config', 'log')) || [];
      emitStatus({});
      return !!cfg;
    },

    async connect(token, persona, dispositivo) {
      const c = createClient(token);
      const access = await c.checkAccess();
      if (!access.canWrite) throw new GitHubError(403, 'El token puede leer pero no escribir. Revisá que tenga Contents: Read and write.');
      cfg = { token, persona, dispositivo };
      client = c;
      await store.set('config', 'cfg', cfg);
      emitStatus({});
    },

    // Cambia persona, nombre del aparato u otros datos de la conexión sin desconectar.
    async updateConfig(patch) {
      cfg = { ...cfg, ...patch };
      await store.set('config', 'cfg', cfg);
      emitStatus({});
    },

    tokenExpiration() { return client?.meta?.tokenExp || null; },

    // Borra la copia local (datos y fotos) y la vuelve a bajar; la cola de cambios no se toca.
    async redownload() {
      for (const [k] of await store.all('files')) await store.del('files', k);
      for (const [k] of await store.all('blobs')) await store.del('blobs', k);
      await store.del('config', 'shas');
      files.clear(); shas.clear();
      emitChange();
      await api.sync();
    },

    async clearLog() { log = []; await store.set('config', 'log', log); onLog && onLog(); },

    async storageInfo() {
      const blobs = await store.all('blobs');
      let est = null;
      try { est = await navigator.storage?.estimate?.(); } catch (e) { /* no disponible */ }
      return { archivos: files.size, fotos: blobs.length, fotosBytes: blobs.reduce((s, [, v]) => s + (v?.blob?.size || 0), 0), usado: est?.usage ?? null, cuota: est?.quota ?? null };
    },

    async disconnect() {
      await store.clearAll();
      cfg = null; client = null; files.clear(); shas.clear(); queue = []; uploads = []; log = [];
      emitStatus({ state: 'idle', lastSync: null });
      emitChange();
    },

    // Datos de un archivo con los cambios pendientes ya aplicados.
    data(name) {
      const path = `${DATA_PREFIX}${name}.json`;
      const base = files.get(path)?.data || [];
      const ops = queue.filter((o) => o.file === path);
      return ops.length ? applyOps(base, ops) : base;
    },

    hasData() { return files.size > 0; },
    pendingFor(name) { return queue.filter((o) => o.file === `${DATA_PREFIX}${name}.json`); },
    photoExists(path) { return shas.has(path); },
    photoPaths(prefix) { return [...shas.keys()].filter((p) => p.startsWith(prefix)); },

    // Un cambio hecho en este dispositivo: se guarda en la cola y se intenta subir.
    async mutate(name, op, summary) {
      queue.push({
        ...op,
        file: `${DATA_PREFIX}${name}.json`,
        uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        by: cfg ? `${cfg.persona} (${cfg.dispositivo})` : 'desconocido',
        summary: summary || '',
      });
      await saveQueue();
      emitStatus({});
      emitChange();
      api.sync();
    },

    async sync() {
      if (!client) return;
      if (syncing) { again = true; return; }
      syncing = true;
      clearTimeout(retryTimer);
      emitStatus({ state: 'checking', message: status.state === 'offline' ? 'reintento' : '' });
      try {
        await flush();
        emitStatus({ state: 'checking', message: '' });
        await pull();
        status.lastSync = new Date().toISOString();
        await store.set('config', 'lastSync', status.lastSync);
        retryDelay = 4000;
        emitStatus({ state: 'idle', message: '' });
      } catch (e) {
        const offline = e instanceof GitHubError && e.status === 0;
        const auth = e instanceof GitHubError && (e.status === 401 || e.status === 403);
        const message = auth ? 'El token ya no sirve. Creá uno nuevo en Ajustes.' : (offline ? '' : e.message);
        emitStatus({ state: offline ? 'offline' : 'error', message });
        await addLog({
          ok: false,
          tipo: offline ? 'conexion' : 'error',
          titulo: offline ? 'Sin conexión' : 'No se pudo sincronizar',
          detalle: (offline ? 'No se pudo llegar a GitHub.' : message) + (queue.length ? ` ${queue.length} cambio(s) esperan para subir.` : ''),
        });
        // Reintenta solo, más seguido al principio (4 s, 8 s, 16 s… hasta 1 min).
        if (!auth) {
          retryTimer = setTimeout(() => api.sync(), retryDelay);
          retryDelay = Math.min(retryDelay * 2, 60000);
        }
      } finally {
        syncing = false;
        if (again) { again = false; api.sync(); }
      }
    },

    async photo(path) {
      const sha = shas.get(path);
      if (!sha) return null;
      const cached = await store.get('blobs', path);
      if (cached && cached.sha === sha) return cached.blob;
      if (!client) return cached ? cached.blob : null;
      try {
        const blob = b64ToBlob(await client.blob(sha), /\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.png$/i.test(path) ? 'image/png' : 'image/webp');
        await store.set('blobs', path, { sha, blob });
        return blob;
      } catch (e) {
        return cached ? cached.blob : null;
      }
    },
  };

  async function pull() {
    const first = files.size === 0;
    const tree = await client.tree();
    const shaMap = {};
    const toGet = [];
    const seen = new Set();
    for (const f of tree) {
      shaMap[f.path] = f.sha;
      if (!f.path.startsWith(DATA_PREFIX) || !f.path.endsWith('.json')) continue;
      seen.add(f.path);
      if (files.get(f.path)?.sha !== f.sha) toGet.push(f);
    }
    let changed = false;
    for (let i = 0; i < toGet.length; i++) {
      const f = toGet[i];
      emitStatus({ state: 'downloading', message: toGet.length > 1 ? `Bajando ${i + 1} de ${toGet.length}` : `Bajando ${nombre(f.path)}` });
      const data = JSON.parse(b64ToText(await client.blob(f.sha)));
      const v = { sha: f.sha, data };
      files.set(f.path, v);
      await store.set('files', f.path, v);
      changed = true;
    }
    const removed = [];
    for (const path of [...files.keys()]) {
      if (!seen.has(path)) { files.delete(path); await store.del('files', path); removed.push(path); changed = true; }
    }
    shas.clear();
    for (const [p, s] of Object.entries(shaMap)) shas.set(p, s);
    await store.set('config', 'shas', shaMap);
    if (first && toGet.length) {
      await addLog({ ok: true, tipo: 'bajada', titulo: 'Bajó todos los datos', detalle: `${toGet.length} archivos` });
    } else {
      for (const f of toGet) {
        let quien = null;
        try { quien = await client.lastCommit(f.path); } catch (e) { /* opcional */ }
        await addLog({ ok: true, tipo: 'bajada', titulo: `Bajó cambios en ${nombre(f.path)}`, detalle: quien ? quien.message : '' });
      }
      for (const p of removed) await addLog({ ok: true, tipo: 'bajada', titulo: `Se quitó ${nombre(p)}`, detalle: '' });
    }
    if (changed) emitChange();
  }

  async function flushUploads() {
    while (uploads.length) {
      const u = uploads[0];
      emitStatus({ state: 'uploading', message: `Subiendo factura (${u.files.length} archivo${u.files.length === 1 ? '' : 's'})` });
      await client.commitFiles(u.files, u.message);
      uploads.shift();
      await store.set('queue', 'uploads', uploads);
      await addLog({ ok: true, tipo: 'subida', titulo: 'Subió una factura', detalle: u.meta?.resumen || u.message });
      emitStatus({});
    }
  }

  async function flush() {
    await flushUploads();
    while (queue.length) {
      emitStatus({ state: 'uploading', message: queue.length > 1 ? `Subiendo ${queue.length} cambios` : 'Subiendo 1 cambio' });
      const path = queue[0].file;
      const ops = queue.filter((o) => o.file === path);
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        let current = [];
        let sha = null;
        try {
          const f = await client.getFile(path);
          sha = f.sha;
          current = JSON.parse(b64ToText(f.b64));
        } catch (e) {
          if (!(e instanceof GitHubError && e.status === 404)) throw e;
        }
        const next = applyOps(current, ops);
        const who = ops[ops.length - 1].by;
        const what = ops.map((o) => o.summary).filter(Boolean).slice(0, 3).join('; ') || `${ops.length} cambio(s)`;
        try {
          const newSha = await client.putFile(path, textToB64(JSON.stringify(next, null, 1) + '\n'), sha, `${who}: ${what}`);
          const v = { sha: newSha, data: next };
          files.set(path, v);
          await store.set('files', path, v);
          done = true;
        } catch (e) {
          // 409/422: alguien más cambió el archivo; se vuelve a leer y se reintenta.
          if (!(e instanceof GitHubError && (e.status === 409 || e.status === 422))) throw e;
        }
      }
      if (!done) throw new GitHubError(409, 'No se pudo guardar por cambios al mismo tiempo; se reintenta luego.');
      const uids = new Set(ops.map((o) => o.uid));
      queue = queue.filter((o) => !uids.has(o.uid));
      await saveQueue();
      await addLog({
        ok: true,
        tipo: 'subida',
        titulo: `Subió ${ops.length === 1 ? '1 cambio' : `${ops.length} cambios`} en ${nombre(path)}`,
        detalle: ops.map((o) => o.summary).filter(Boolean).join(' · '),
      });
      emitStatus({});
    }
  }

  return api;
}
