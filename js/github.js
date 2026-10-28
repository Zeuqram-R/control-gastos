// Acceso al repo privado de datos por la API de GitHub.
export const REPO = { owner: 'Zeuqram-R', repo: 'control-gastos-datos', branch: 'main' };

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Texto UTF-8 <-> base64 (la API de GitHub manda y recibe contenido en base64).
export function b64ToText(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function textToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function b64ToBlob(b64, type) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type });
}

export function createClient(token) {
  const meta = { tokenExp: null };
  async function call(path, opts = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        ...opts,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.headers || {}),
        },
      });
    } catch (e) {
      throw new GitHubError(0, 'Sin conexión');
    }
    // GitHub manda cuándo vence el token (si el navegador deja leerlo).
    const exp = res.headers.get('github-authentication-token-expiration');
    if (exp) meta.tokenExp = exp;
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch (e) { /* sin cuerpo */ }
      throw new GitHubError(res.status, msg);
    }
    return res.status === 204 ? null : res.json();
  }

  const base = `/repos/${REPO.owner}/${REPO.repo}`;

  return {
    meta,
    // Revisa que el token sirva y pueda escribir.
    async checkAccess() {
      const r = await call(base);
      return { canWrite: !!(r.permissions && r.permissions.push), private: r.private };
    },
    // Lista de todos los archivos del repo con su sha.
    async tree() {
      const r = await call(`${base}/git/trees/${REPO.branch}?recursive=1`);
      return r.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, sha: e.sha, size: e.size }));
    },
    async blob(sha) {
      const r = await call(`${base}/git/blobs/${sha}`);
      return r.content;
    },
    async getFile(path) {
      const r = await call(`${base}/contents/${encodeURI(path)}?ref=${REPO.branch}`);
      return { sha: r.sha, b64: r.content };
    },
    // Último cambio de un archivo: quién lo hizo y desde dónde (va en el mensaje del commit).
    async lastCommit(path) {
      const r = await call(`${base}/commits?path=${encodeURIComponent(path)}&sha=${REPO.branch}&per_page=1`);
      return r[0] ? { message: r[0].commit.message.split('\n')[0], at: r[0].commit.author.date } : null;
    },
    // Varios archivos en un solo commit (así la factura y su ficha llegan juntas).
    async commitFiles(files, message) {
      const ref = await call(`${base}/git/ref/heads/${REPO.branch}`);
      const parent = ref.object.sha;
      const pc = await call(`${base}/git/commits/${parent}`);
      const tree = [];
      for (const f of files) {
        const b = await call(`${base}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.b64, encoding: 'base64' }) });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
      }
      const t = await call(`${base}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: pc.tree.sha, tree }) });
      const c = await call(`${base}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [parent] }) });
      await call(`${base}/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
      return c.sha;
    },
    async putFile(path, b64, sha, message) {
      const r = await call(`${base}/contents/${encodeURI(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: b64, branch: REPO.branch, ...(sha ? { sha } : {}) }),
      });
      return r.content.sha;
    },
  };
}
