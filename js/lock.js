// Bloqueo con Face ID / Touch ID (o el código del aparato), usando una "llave de acceso" (WebAuthn) que vive solo en este aparato.
// Es un candado de la app: los datos siguen guardados en el aparato como siempre.
import { prefs } from './prefs.js';

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export const lock = {
  get config() { return prefs.get('candado', null); },
  get activo() { return !!this.config?.cred; },

  async disponible() {
    try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
    catch (e) { return false; }
  },

  // Crea la llave en este aparato (iOS pide Face ID y ofrece guardarla en el Llavero).
  async activar(persona, dispositivo) {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: rand(32),
        rp: { name: 'Control de gastos', id: location.hostname },
        user: { id: rand(16), name: `${persona} · ${dispositivo}`, displayName: `${persona} (${dispositivo})` },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
      },
    });
    prefs.set('candado', { cred: b64u(cred.rawId), espera: this.config?.espera ?? 1 });
  },

  desactivar() { prefs.set('candado', null); },

  setEspera(min) { const c = this.config; if (c) prefs.set('candado', { ...c, espera: min }); },

  // Pide Face ID. Devuelve true si se verificó.
  async verificar() {
    const c = this.config;
    if (!c) return true;
    const r = await navigator.credentials.get({
      publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: fromB64u(c.cred) }], userVerification: 'required', timeout: 60000, rpId: location.hostname },
    });
    return !!r;
  },
};

// Pantalla de bloqueo.
let overlay = null, ocupado = false, ocultoEn = null;

function mostrar(onReset) {
  if (overlay) return;
  document.documentElement.classList.add('locked');
  overlay = document.createElement('div');
  overlay.className = 'lockscreen';
  overlay.innerHTML = `
    <div class="lock-box">
      <img src="icons/icon-192.png" alt="" class="lock-icon">
      <h2>Control de gastos</h2>
      <p class="lock-msg">Bloqueado</p>
      <button type="button" class="btn lock-btn">Desbloquear con Face ID</button>
      <p class="lock-err" hidden></p>
      <button type="button" class="link-btn lock-reset">¿No funciona?</button>
    </div>`;
  document.body.append(overlay);
  const btn = overlay.querySelector('.lock-btn'), err = overlay.querySelector('.lock-err');
  const intentar = async () => {
    if (ocupado) return;
    ocupado = true; err.hidden = true;
    try {
      if (await lock.verificar()) ocultar();
    } catch (e) {
      err.textContent = e.name === 'NotAllowedError' ? 'No se verificó. Tocá el botón para intentar de nuevo.' : `No se pudo usar Face ID (${e.name}).`;
      err.hidden = false;
    } finally { ocupado = false; }
  };
  btn.addEventListener('click', intentar);
  overlay.querySelector('.lock-reset').addEventListener('click', () => {
    if (confirm('Si Face ID no funciona, podés quitar el bloqueo desconectando este aparato: se borran el token y los datos guardados aquí (lo de GitHub no se toca) y tenés que volver a pegar el token. ¿Continuar?')) {
      lock.desactivar(); ocultar(); onReset && onReset();
    }
  });
  // iOS a veces deja pedir Face ID sin tocar nada; si no, queda el botón.
  setTimeout(intentar, 250);
}

function ocultar() {
  overlay?.remove(); overlay = null;
  document.documentElement.classList.remove('locked');
}

export function iniciarCandado(onReset) {
  if (lock.activo) mostrar(onReset);
  document.addEventListener('visibilitychange', () => {
    if (!lock.activo) return;
    if (document.visibilityState === 'hidden') {
      ocultoEn = Date.now();
      if ((lock.config.espera ?? 1) === 0) mostrar(onReset);
    } else if (ocultoEn && Date.now() - ocultoEn >= (lock.config.espera ?? 1) * 60000) {
      mostrar(onReset);
    }
  });
}
