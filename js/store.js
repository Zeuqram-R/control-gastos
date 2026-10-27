// Almacenamiento local (IndexedDB): configuración, archivos en caché y cola de cambios.
const DB_NAME = 'control-gastos';
const DB_VERSION = 1;
const STORES = ['config', 'files', 'queue', 'blobs'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const store = {
  async get(storeName, key) {
    const db = await openDb();
    return wrap(db.transaction(storeName).objectStore(storeName).get(key));
  },
  async set(storeName, key, value) {
    return tx(storeName, 'readwrite', (s) => { s.put(value, key); });
  },
  async del(storeName, key) {
    return tx(storeName, 'readwrite', (s) => { s.delete(key); });
  },
  async all(storeName) {
    const db = await openDb();
    const s = db.transaction(storeName).objectStore(storeName);
    const [keys, values] = await Promise.all([wrap(s.getAllKeys()), wrap(s.getAll())]);
    return keys.map((k, i) => [k, values[i]]);
  },
  async clearAll() {
    const db = await openDb();
    await Promise.all(STORES.map((name) => new Promise((resolve, reject) => {
      const t = db.transaction(name, 'readwrite');
      t.objectStore(name).clear();
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    })));
  },
};
