/**
 * earningsStorage.js — namespaced by userId for multi-user support.
 */
import { getUserId } from '../auth/webauthn.js'

function getKey() {
  const uid = getUserId()
  return uid ? `tp_${uid}_earnings_v1` : 'tp_earnings_v1'
}

export function loadEarnings() {
  try {
    const raw = localStorage.getItem(getKey())
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveEarnings(items) {
  try { localStorage.setItem(getKey(), JSON.stringify(items)) }
  catch { /* storage full */ }
}

export function clearEarnings() { localStorage.removeItem(getKey()) }
