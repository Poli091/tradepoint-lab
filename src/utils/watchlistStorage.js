/**
 * watchlistStorage.js — namespaced by userId for multi-user support.
 */
import { getUserId } from '../auth/webauthn.js'

function getKey() {
  const uid = getUserId()
  return uid ? `tp_${uid}_watchlist_v1` : 'tp_watchlist_v1'
}

export function loadWatchlist() {
  try {
    const raw = localStorage.getItem(getKey())
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveWatchlist(items) {
  try { localStorage.setItem(getKey(), JSON.stringify(items)) }
  catch { /* storage full */ }
}

export function clearWatchlist() { localStorage.removeItem(getKey()) }
