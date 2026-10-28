// Avisos de pagos (Web Push). En iPhone/iPad funciona con la app agregada a la pantalla de inicio (iOS 16.4 o más nuevo).
import { prefs } from './prefs.js';

export const VAPID_PUBLIC = 'BA5nBvbjqJmXrV5KfNgidP3kzhp3t5i7VN9sm7SLW4boynCkVy7edef115ZG4je7P3w61phcCdnXTdSjrx3q7IU';
const toU8 = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
const idDe = (cfg) => `${cfg.persona}-${cfg.dispositivo}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const push = {
  soportado() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },
  instalada() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; },
  get activo() { return !!prefs.get('avisos', null); },

  async activar(sync) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denegado' : 'sin-permiso');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toU8(VAPID_PUBLIC) });
    const cfg = sync.config;
    const id = idDe(cfg);
    await sync.mutate('suscripciones', { kind: 'upsert', record: { id, persona: cfg.persona, dispositivo: cfg.dispositivo, sub: sub.toJSON(), creada: new Date().toISOString().slice(0, 10) } }, `activa avisos en ${cfg.dispositivo}`);
    prefs.set('avisos', { id });
  },

  async desactivar(sync) {
    const a = prefs.get('avisos', null);
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); await sub?.unsubscribe(); } catch (e) { /* ya no estaba */ }
    if (a?.id) await sync.mutate('suscripciones', { kind: 'delete', id: a.id }, `quita avisos en ${sync.config.dispositivo}`);
    prefs.set('avisos', null);
  },
};
