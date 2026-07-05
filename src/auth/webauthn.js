/**
 * MODULE: AUTH / webauthn.js
 * WebAuthn passkey helpers — register and authenticate using
 * platform authenticators: Face ID, Touch ID, Windows Hello, Android biometrics.
 *
 * Security model:
 *  · Credential ID stored in localStorage (tp_passkey_id)
 *  · Session flag stored in sessionStorage (tp_session)
 *  · sessionStorage is automatically cleared on page reload and tab close
 *  · visibilitychange event locks the app when screen/tab is hidden
 *
 * Note: WebAuthn requires HTTPS or localhost.
 * Cloudflare Pages always serves HTTPS — production works out of the box.
 */

const LS_CRED_KEY  = 'tp_passkey_id'
const RP_NAME      = 'TradePoint Lab'

/* ── Encoding helpers ──────────────────────────────────── */
function toBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(str) {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

/* ── Feature detection ─────────────────────────────────── */
export function isWebAuthnSupported() {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials?.create &&
    navigator.credentials?.get
  )
}

export function hasRegisteredPasskey() {
  return !!localStorage.getItem(LS_CRED_KEY)
}

/* ── Register a new passkey ────────────────────────────── */
export async function registerPasskey() {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn not supported on this browser')
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId    = crypto.getRandomValues(new Uint8Array(16))

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        id:   window.location.hostname,
        name: RP_NAME,
      },
      user: {
        id:          userId,
        name:        'tradepoint-user',
        displayName: 'TradePoint User',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7   },  // ES256 — ECDSA P-256 (preferred)
        { type: 'public-key', alg: -257  }, // RS256 — RSA fallback
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',  // built-in only: Face ID / Touch ID / Windows Hello
        userVerification:        'required',
        residentKey:             'required',
      },
      timeout:     60_000,
      attestation: 'none',
    },
  })

  if (!credential) throw new Error('Passkey registration was cancelled')

  // Persist credential ID for future authentications
  localStorage.setItem(LS_CRED_KEY, toBase64Url(credential.rawId))
  return credential
}

/* ── Authenticate with existing passkey ────────────────── */
export async function authenticatePasskey() {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn not supported on this browser')
  }

  const stored = localStorage.getItem(LS_CRED_KEY)
  if (!stored) throw new Error('No passkey registered on this device')

  const challenge = crypto.getRandomValues(new Uint8Array(32))

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{
        type: 'public-key',
        id:   fromBase64Url(stored),
      }],
      userVerification: 'required',
      timeout:          60_000,
    },
  })

  if (!assertion) throw new Error('Authentication was cancelled')
  return assertion
}

/* ── Clear passkey registration ────────────────────────── */
export function clearPasskeyRegistration() {
  localStorage.removeItem(LS_CRED_KEY)
}
