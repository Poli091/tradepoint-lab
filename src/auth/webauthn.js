/**
 * MODULE: AUTH / webauthn.js
 * WebAuthn passkey helpers — register and authenticate using
 * platform authenticators: Face ID, Touch ID, Windows Hello, Android biometrics.
 *
 * Multi-user model:
 *  · Each device has ONE profile (one passkey, one userId)
 *  · userId is a UUID stored in localStorage (tp_userId)
 *  · profileName stored as tp_profileName
 *  · All personal data namespaced by userId in storage utils
 *  · KV market data cache is shared (same fundamentals for all users)
 */

const LS_CRED_KEY    = 'tp_passkey_id'
const LS_USER_ID     = 'tp_userId'
const LS_PROFILE_NAME = 'tp_profileName'
const RP_NAME        = 'TradePoint Lab'

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

/* ── UUID generator ────────────────────────────────────── */
function generateUUID() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
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

export function getUserId() {
  return localStorage.getItem(LS_USER_ID)
}

export function getProfileName() {
  return localStorage.getItem(LS_PROFILE_NAME) || 'User'
}

/* ── Register a new passkey ────────────────────────────── */
export async function registerPasskey(profileName = 'User') {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn not supported on this browser')
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userIdBytes = crypto.getRandomValues(new Uint8Array(16))
  const userId = generateUUID()

  const displayName = profileName.trim() || 'TradePoint User'

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        id:   window.location.hostname,
        name: RP_NAME,
      },
      user: {
        id:          userIdBytes,
        name:        displayName.toLowerCase().replace(/\s+/g, '.'),
        displayName: displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7   },  // ES256
        { type: 'public-key', alg: -257  }, // RS256 fallback
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification:        'required',
        residentKey:             'required',
      },
      timeout:     60_000,
      attestation: 'none',
    },
  })

  if (!credential) throw new Error('Passkey registration was cancelled')

  // Store credential + generate persistent userId for data namespacing
  localStorage.setItem(LS_CRED_KEY, toBase64Url(credential.rawId))
  localStorage.setItem(LS_USER_ID, userId)
  localStorage.setItem(LS_PROFILE_NAME, displayName)

  // Migrate existing data from old non-namespaced keys to new userId-namespaced keys
  migrateLegacyData(userId)

  return credential
}

/* ── Authenticate with existing passkey ────────────────── */
export async function authenticatePasskey() {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn not supported on this browser')
  }

  const stored = localStorage.getItem(LS_CRED_KEY)
  if (!stored) throw new Error('No passkey registered on this device')

  // Ensure userId exists (migrate if this is an upgrade from old version)
  if (!localStorage.getItem(LS_USER_ID)) {
    const newId = generateUUID()
    localStorage.setItem(LS_USER_ID, newId)
    migrateLegacyData(newId)
  }

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

/* ── Migrate legacy data to namespaced keys ────────────── */
function migrateLegacyData(userId) {
  const migrations = [
    ['tp_positions_v1', `tp_${userId}_positions_v1`],
    ['tp_watchlist_v1', `tp_${userId}_watchlist_v1`],
    ['tp_earnings_v1',  `tp_${userId}_earnings_v1`],
    ['tp-theme',        `tp_${userId}_theme`],
  ]
  for (const [oldKey, newKey] of migrations) {
    const existing = localStorage.getItem(oldKey)
    if (existing && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, existing)
      // Keep old key intact as fallback
    }
  }
}

/* ── Clear passkey registration ────────────────────────── */
export function clearPasskeyRegistration() {
  // Only remove auth credentials, NOT user data
  localStorage.removeItem(LS_CRED_KEY)
}

/* ── Delete profile + all user data ───────────────────── */
export function deleteProfileAndData() {
  const userId = getUserId()
  const keysToRemove = [LS_CRED_KEY, LS_USER_ID, LS_PROFILE_NAME]

  // Remove namespaced user data
  if (userId) {
    const userPrefix = `tp_${userId}_`
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(userPrefix)) keysToRemove.push(k)
    }
  }

  // Also remove legacy non-namespaced keys
  keysToRemove.push('tp_positions_v1', 'tp_watchlist_v1', 'tp_earnings_v1', 'tp-theme')

  keysToRemove.forEach(k => localStorage.removeItem(k))
}
