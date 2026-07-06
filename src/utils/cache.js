/**
 * MODULE: UTILS / cache.js
 * TTL-based localStorage cache engine.
 * Used as a LOCAL layer on top of the Cloudflare KV Worker cache.
 *
 * Layer architecture:
 *   Browser localStorage  ← fastest, device-local, short-lived duplicates
 *   Cloudflare KV         ← authoritative, shared across all devices, long-lived
 *
 * The Worker is the source of truth. localStorage just avoids redundant
 * Worker calls for data that was just fetched this session.
 */

const PREFIX = 'tp_'

/* ── TTL constants (milliseconds) ── matches Worker TTLs ─── */
export const TTL = {
  PRICE:        5   * 60  * 1000,              // 5 min
  OHLCV:        24  * 60  * 60  * 1000,        // 1 day
  ANALYST:      24  * 60  * 60  * 1000,        // 1 day
  NEWS:         8   * 60  * 60  * 1000,        // 8 h
  EARNINGS_CAL: 7   * 24  * 60  * 60  * 1000,  // 7 days
  FUNDAMENTALS: 90  * 24  * 60  * 60  * 1000,  // 90 days
  MOAT:         30  * 24  * 60  * 60  * 1000,  // 30 days
  BEAR:         7   * 24  * 60  * 60  * 1000,  // 7 days
  CATALYSTS:    7   * 24  * 60  * 60  * 1000,  // 7 days
}

/* ── Core operations ────────────────────────────────────── */
export function cacheSet(key, data, ttlMs) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({
      data,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    }))
    return true
  } catch (e) {
    console.warn('[cache] set failed:', key, e.message)
    return false
  }
}

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
  } catch { return null }
}

export function cacheDelete(key) {
  try { localStorage.removeItem(PREFIX + key) } catch {}
}

export function cacheInfo(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    const now   = Date.now()
    const isExp = now > entry.expiresAt
    return {
      fetchedAt: new Date(entry.fetchedAt),
      expiresAt: new Date(entry.expiresAt),
      isExpired: isExp,
      daysSince: Math.floor((now - entry.fetchedAt) / 86_400_000),
      daysLeft:  isExp ? 0 : Math.ceil((entry.expiresAt - now) / 86_400_000),
    }
  } catch { return null }
}

export function cacheClearAll() {
  const toRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) toRemove.push(k)
  }
  toRemove.forEach(k => localStorage.removeItem(k))
}

/* ── Convenience helpers ────────────────────────────────── */
export const cache = {
  setPrice:     (t, d) => cacheSet(`price_${t}`,    d, TTL.PRICE),
  getPrice:     (t)    => cacheGet(`price_${t}`),
  setOHLCV:     (t, r, d) => cacheSet(`ohlcv_${t}_${r}`, d, TTL.OHLCV),
  getOHLCV:     (t, r)    => cacheGet(`ohlcv_${t}_${r}`),
  setAnalyst:   (t, d) => cacheSet(`analyst_${t}`,  d, TTL.ANALYST),
  getAnalyst:   (t)    => cacheGet(`analyst_${t}`),
  setNews:      (t, d) => cacheSet(`news_${t}`,     d, TTL.NEWS),
  getNews:      (t)    => cacheGet(`news_${t}`),
  setEarnings:  (d)    => cacheSet(`earnings_cal`,  d, TTL.EARNINGS_CAL),
  getEarnings:  ()     => cacheGet(`earnings_cal`),
  setFund:      (t, d) => cacheSet(`fund_${t}`,     d, TTL.FUNDAMENTALS),
  getFund:      (t)    => cacheGet(`fund_${t}`),
  deleteFund:   (t)    => cacheDelete(`fund_${t}`),
  infoFund:     (t)    => cacheInfo(`fund_${t}`),
  setMoat:      (t, d) => cacheSet(`moat_${t}`,     d, TTL.MOAT),
  getMoat:      (t)    => cacheGet(`moat_${t}`),
  setBear:      (t, d) => cacheSet(`bear_${t}`,     d, TTL.BEAR),
  getBear:      (t)    => cacheGet(`bear_${t}`),
  setCatalysts: (t, d) => cacheSet(`catalysts_${t}`, d, TTL.CATALYSTS),
  getCatalysts: (t)    => cacheGet(`catalysts_${t}`),
}
