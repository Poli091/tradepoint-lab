/**
 * positionsStorage.js — namespaced by userId for multi-user support.
 */
import { getUserId } from '../auth/webauthn.js'

function getKey() {
  const uid = getUserId()
  return uid ? `tp_${uid}_positions_v1` : 'tp_positions_v1'
}

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(getKey())
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveOverrides(positions) {
  try { localStorage.setItem(getKey(), JSON.stringify(positions)) }
  catch { /* storage full */ }
}

export function clearOverrides() { localStorage.removeItem(getKey()) }
