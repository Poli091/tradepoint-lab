/**
 * MODULE: API / worker.js
 * Browser-side client for the Cloudflare Worker.
 */

import { getApiKeys } from './config.js'

/* ── Worker URL ─────────────────────────────────────────── */
export const LS_WORKER_URL = 'tp_worker_url'

export function getWorkerUrl() {
  return localStorage.getItem(LS_WORKER_URL)
    || import.meta.env.VITE_WORKER_URL
    || 'https://tradepoint-worker.cpolinotto.workers.dev'
}

export function setWorkerUrl(url) {
  const trimmed = url?.trim() || ''
  if (trimmed) localStorage.setItem(LS_WORKER_URL, trimmed)
  else         localStorage.removeItem(LS_WORKER_URL)
}

/* ── Request builder ────────────────────────────────────── */
function buildHeaders() {
  const k = getApiKeys()
  const h = {}
  if (k.finnhub)      h['X-Finnhub-Key']    = k.finnhub
  if (k.fmp)          h['X-FMP-Key']         = k.fmp
  if (k.alpacaKey)    h['X-Alpaca-Key']      = k.alpacaKey
  if (k.alpacaSecret) h['X-Alpaca-Secret']   = k.alpacaSecret
  if (k.groq)         h['X-Groq-Key']        = k.groq
  return h
}

export async function workerGet(path) {
  const base = getWorkerUrl()
  if (!base) throw new Error('Worker URL not configured — add it in Settings → Data Sync')
  const url = `${base.replace(/\/$/, '')}${path}`
  const res = await fetch(url, { headers: buildHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Worker ${res.status}: ${path}`)
  }
  return res.json()
}

/* ── Typed API methods ──────────────────────────────────── */
export const workerAPI = {
  /** Health check */
  status: () =>
    workerGet('/api/status'),

  /** Save conviction result to D1 */
  saveAnalysis: async (ticker, result) => {
    const base = getWorkerUrl()
    if (!base) return null
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/save/${ticker}`, {
        method:  'POST',
        headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(result),
      })
      return res.ok ? res.json() : null
    } catch { return null }
  },

  /** Company news (8h KV cache) */
  news: (ticker) =>
    workerGet(`/api/news/${ticker}`),

  /** Full fundamentals (90d KV cache) */
  fundamentals: (ticker, forceRefresh = false) =>
    workerGet(`/api/fundamentals/${ticker}${forceRefresh ? '?refresh=1' : ''}`),

  /** Real-time quote (5min KV cache) */
  price: (ticker) =>
    workerGet(`/api/price/${ticker}`),

  /** OHLCV bars from Alpaca (24h KV cache) */
  ohlcv: (ticker, range = '3M') =>
    workerGet(`/api/ohlcv/${ticker}/${range}`),

  /** Groq AI — quantitative strengths (30d cache) */
  moat: (ticker) =>
    workerGet(`/api/moat/${ticker}`),

  /** Groq AI — current constraints (7d cache) */
  bear: (ticker) =>
    workerGet(`/api/bear/${ticker}`),

  /** Groq AI — potential score drivers (7d cache) */
  catalysts: (ticker) =>
    workerGet(`/api/catalysts/${ticker}`),

  /** Earnings calendar (7d cache) */
  earnings: () =>
    workerGet('/api/earnings'),

  /** KV cache metadata for a ticker */
  cacheInfo: (ticker) =>
    workerGet(`/api/cache/info/${ticker}`),

  /** Clear KV cache for a ticker */
  cacheClear: (ticker) =>
    workerGet(`/api/cache/clear/${ticker}`),

  /** Score history from D1 weekly snapshots */
  getHistory: (ticker, limit = 52) =>
    workerGet(`/api/snapshots/${ticker}?limit=${limit}`),

  /** Market Intelligence — narrative + drivers + market vs model (6h cache) */
  marketIntelligence: (ticker) =>
    workerGet(`/api/market-intelligence/${ticker}`),
}
