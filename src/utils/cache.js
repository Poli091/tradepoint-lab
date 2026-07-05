/**
 * MODULE: UTILS / cache.js
 * TTL-based localStorage cache engine.
 * Persists across page refreshes, tab switches, and browser restarts.
 * Data survives the TradePoint Lab lock/unlock cycle since localStorage
 * is tied to the origin, not the session.
 *
 * Key format: "tp_{type}_{ticker}" e.g. "tp_fund_NVDA"
 */

const PREFIX = 'tp_'

/* ── TTL constants (milliseconds) ──────────────────────── */
export const TTL = {
  PRICE:          5   * 60  * 1000,       // 5 min   — precio cambia constantemente
  OHLCV:          24  * 60  * 60 * 1000,  // 24 h    — día cerrado no cambia
  ANALYST:        14  * 24  * 60 * 60 * 1000, // 14 d — analistas revisan mensual
  NEWS:           4   * 60  * 60 * 1000,  // 4 h     — flujo continuo
  EARNINGS_CAL:   7   * 24  * 60 * 60 * 1000, // 7 d  — fechas estables
  FUNDAMENTALS:   90  * 24  * 60 * 60 * 1000, // 90 d — solo cambian en earnings
}

/* ── Core operations ────────────────────────────────────── */

/** Store data with expiry. Returns true on success. */
export function cacheSet(key, data, ttlMs) {
  try {
    const entry = {
      data,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    }
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
    return true
  } catch (e) {
    // localStorage full or unavailable
    console.warn('[cache] set failed:', key, e.message)
    return false
  }
}

/** Get cached data. Returns null if missing or expired. */
export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(PREFIX + key)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

/** Delete a specific cache entry (manual refresh trigger). */
export function cacheDelete(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {}
}

/**
 * Get metadata about a cached entry — used for the UI refresh indicator.
 * Returns null if entry doesn't exist.
 */
export function cacheInfo(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    const now = Date.now()
    const isExpired = now > entry.expiresAt
    const msFetched = now - entry.fetchedAt
    const msLeft    = entry.expiresAt - now
    return {
      fetchedAt:  new Date(entry.fetchedAt),
      expiresAt:  new Date(entry.expiresAt),
      isExpired,
      daysSince:  Math.floor(msFetched / (24 * 60 * 60 * 1000)),
      daysLeft:   isExpired ? 0 : Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
    }
  } catch {
    return null
  }
}

/** List all TradePoint cache keys (for debugging / stats). */
export function cacheList() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length))
  }
  return keys
}

/** Clear ALL TradePoint cache entries. */
export function cacheClearAll() {
  const toRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) toRemove.push(k)
  }
  toRemove.forEach(k => localStorage.removeItem(k))
}

/* ── Convenience helpers by data type ──────────────────── */

export const cache = {
  /* Price */
  setPrice:        (ticker, data) => cacheSet(`price_${ticker}`,     data, TTL.PRICE),
  getPrice:        (ticker)       => cacheGet(`price_${ticker}`),

  /* OHLCV chart data */
  setOHLCV:        (ticker, range, data) => cacheSet(`ohlcv_${ticker}_${range}`, data, TTL.OHLCV),
  getOHLCV:        (ticker, range)       => cacheGet(`ohlcv_${ticker}_${range}`),

  /* Analyst targets + consensus */
  setAnalyst:      (ticker, data) => cacheSet(`analyst_${ticker}`,   data, TTL.ANALYST),
  getAnalyst:      (ticker)       => cacheGet(`analyst_${ticker}`),

  /* News */
  setNews:         (ticker, data) => cacheSet(`news_${ticker}`,      data, TTL.NEWS),
  getNews:         (ticker)       => cacheGet(`news_${ticker}`),

  /* Earnings calendar */
  setEarnings:     (data)         => cacheSet(`earnings_cal`,        data, TTL.EARNINGS_CAL),
  getEarnings:     ()             => cacheGet(`earnings_cal`),

  /* Fundamentals — 90 days, per ticker, manually refreshable */
  setFund:         (ticker, data) => cacheSet(`fund_${ticker}`,      data, TTL.FUNDAMENTALS),
  getFund:         (ticker)       => cacheGet(`fund_${ticker}`),
  deleteFund:      (ticker)       => cacheDelete(`fund_${ticker}`),
  infoFund:        (ticker)       => cacheInfo(`fund_${ticker}`),
}
