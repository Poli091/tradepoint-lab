/**
 * watchlistStorage.js — localStorage persistence for watchlist
 */
const LS_KEY = 'tp_watchlist_v1'

export function loadWatchlist() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveWatchlist(items) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) }
  catch { /* storage full */ }
}

export function clearWatchlist() { localStorage.removeItem(LS_KEY) }
