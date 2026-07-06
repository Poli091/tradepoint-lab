/**
 * MODULE: API / worker.js
 * Browser-side client for the Cloudflare Worker.
 *
 * All data requests go through the Worker, which:
 *  1. Checks KV cache (returns immediately if hit)
 *  2. Calls Finnhub / FMP / Alpaca / Groq if cache miss
 *  3. Stores result in KV (shared across all devices)
 *  4. Returns data + Data Freshness metadata
 *
 * Worker URL is stored in localStorage (tp_worker_url) or .env.local.
 * API keys are forwarded as request headers — Worker uses its own secrets
 * if configured (Cloudflare dashboard), otherwise uses the browser headers.
 */

import { getApiKeys } from './config.js'

/* ── Worker URL ─────────────────────────────────────────── */
export const LS_WORKER_URL = 'tp_worker_url'

export function getWorkerUrl() {
  return localStorage.getItem(LS_WORKER_URL)
    || import.meta.env.VITE_WORKER_URL
    || null
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

/** Core GET call to the Worker */
export async function workerGet(path) {
  const base = getWorkerUrl()
  if (!base) throw new Error('Worker URL not configured — add it in Settings → Data Sync')

  const url = `${base.replace(/\/$/, '')}${path}`
  const res = await fetch(url, { headers: buildHeaders() })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Worker ${res.status}: ${path}`)
  }
  return res.json()   // { data, meta }
}

/* ── Typed API methods ──────────────────────────────────── */
export const workerAPI = {
  /** Health check — use to verify Worker is reachable */
  status: () =>
    workerGet('/api/status'),

  /** Full fundamentals: Finnhub (growth, quality, strength, valuation, consensus)
   *  + FMP (ROIC, PEG, beat history). Cached 90 days in KV. */
  fundamentals: (ticker, forceRefresh = false) =>
    workerGet(`/api/fundamentals/${ticker}${forceRefresh ? '?refresh=1' : ''}`),

  /** Real-time quote from Finnhub. Cached 5 min in KV. */
  price: (ticker) =>
    workerGet(`/api/price/${ticker}`),

  /** OHLCV bars from Alpaca. Cached 24h in KV.
   *  range: '1W' | '1M' | '3M' | '6M' | '1Y' */
  ohlcv: (ticker, range = '3M') =>
    workerGet(`/api/ohlcv/${ticker}/${range}`),

  /** Company news from Finnhub. Cached 8h in KV. */
  news: (ticker) =>
    workerGet(`/api/news/${ticker}`),

  /** Groq AI — economic moat analysis. Cached 30 days. */
  moat: (ticker) =>
    workerGet(`/api/moat/${ticker}`),

  /** Groq AI — bear case risks. Cached 7 days. */
  bear: (ticker) =>
    workerGet(`/api/bear/${ticker}`),

  /** Groq AI — near-term catalysts. Cached 7 days. */
  catalysts: (ticker) =>
    workerGet(`/api/catalysts/${ticker}`),

  /** Earnings calendar from Finnhub. Cached 7 days. */
  earnings: () =>
    workerGet('/api/earnings'),

  /**
   * Data Freshness info for a ticker — returns KV metadata for each
   * data type (fundamentals, price, ohlcv, news, moat, bear, catalysts).
   * Zero API calls — reads only KV metadata.
   */
  cacheInfo: (ticker) =>
    workerGet(`/api/cache/info/${ticker}`),

  /** Clear all KV cache for a ticker (manual refresh). */
  cacheClear: (ticker) =>
    workerGet(`/api/cache/clear/${ticker}`),
}
