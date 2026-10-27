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

export function createSync({ onChange, onStatus }) {
  let cfg = null;
  let client = null;
  const files = new Map(); // path -> { sha, data }
  const shas = new Map(); // path -> sha (todo el repo, incluye fotos)
  let queue = [];
  let syncing = false;
  let again = false;
  const status = { state: 'idle', lastSync: null, pending: 0, message: '' };

  const emitStatus = (patch) => {
    Object.assign(status, patch, { pending: queue.length });
    onStatus && onStatus({ ...status });
  };
  const emitChange = () => onChange && onChange();

  async function saveQueue() { await store.set('queue', 'ops', queue); }

  const api = {
    get config() { return cfg; },
    get status() { return { ...status }; },

    async init() {
      cfg = (await store.get('config', 'cfg')) || null;
      if (cfg) client = createClient(cfg.token);
      for (const [path, v] of await store.all('files')) {
        if (path.startsWith(DATA_PREFIX)) files.set(path, v);
      }
      const sh = (await store.get('config', 'shas')) || {};
      for (const [p, s] of Object.entries(sh)) shas.set(p, s);
      queue = (await store.get('queue', 'ops')) || [];
      status.lastSync = (await store.get('config', 'lastSync')) || null;
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

    async disconnect() {
      await store.clearAll();
      cfg = null; client = null; files.clear(); shas.clear(); queue = [];
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
      emitStatus({ state: 'syncing', message: '' });
      try {
        await flush();
        await pull();
        status.lastSync = new Date().toISOString();
        await store.set('config', 'lastSync', status.lastSync);
        emitStatus({ state: 'idle', message: '' });
      } catch (e) {
        const offline = e instanceof GitHubError && e.status === 0;
        const auth = e instanceof GitHubError && (e.status === 401 || e.status === 403);
        emitStatus({ state: offline ? 'offline' : 'error', message: auth ? 'El token ya no sirve. Creá uno nuevo en Ajustes.' : (offline ? '' : e.message) });
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
        const blob = b64ToBlob(await client.blob(sha), 'image/webp');
        await store.set('blobs', path, { sha, blob });
        return blob;
      } catch (e) {
        return cached ? cached.blob : null;
      }
    },
  };

  async function pull() {
    const tree = await client.tree();
    const seen = new Set();
    const shaMap = {};
    let changed = false;
    for (const f of tree) {
      shaMap[f.path] = f.sha;
      if (!f.path.startsWith(DATA_PREFIX) || !f.path.endsWith('.json')) continue;
      seen.add(f.path);
      if (files.get(f.path)?.sha === f.sha) continue;
      const data = JSON.parse(b64ToText(await client.blob(f.sha)));
      const v = { sha: f.sha, data };
      files.set(f.path, v);
      await store.set('files', f.path, v);
      changed = true;
    }
    for (const path of [...files.keys()]) {
      if (!seen.has(path)) { files.delete(path); await store.del('files', path); changed = true; }
    }
    shas.clear();
    for (const [p, s] of Object.entries(shaMap)) shas.set(p, s);
    await store.set('config', 'shas', shaMap);
    if (changed) emitChange();
  }

  async function flush() {
    while (queue.length) {
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
      emitStatus({});
    }
  }

  return api;
}
