/**
 * earningsStorage.js — localStorage persistence for earnings calendar
 */
const LS_KEY = 'tp_earnings_v1'

export function loadEarnings() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveEarnings(items) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) }
  catch { /* storage full */ }
}

export function clearEarnings() { localStorage.removeItem(LS_KEY) }
