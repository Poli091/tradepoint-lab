/**
 * MODULE: API / finnhub.js
 * Finnhub — 60 req/min free tier.
 *
 * Provides:
 *  · Real-time quote (price, change, change%)
 *  · Analyst price target → used to calculate upside %
 *  · Recommendation trends (Strong Buy / Buy / Hold / Sell / Strong Sell counts)
 *  · Earnings calendar
 *  · Company news
 *
 * All responses are cached. Cache checked before every call.
 */

import { API_KEYS, ENDPOINTS } from './config.js'
import { cache } from '../cache.js'

const BASE = ENDPOINTS.finnhub

async function get(path) {
  const key = API_KEYS.finnhub
  if (!key) throw new Error('Finnhub key not configured')
  const res = await fetch(`${BASE}${path}&token=${key}`)
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`)
  return res.json()
}

/* ── Quote — price, change, change% ────────────────────── */
export async function getQuote(ticker) {
  const cached = cache.getPrice(ticker)
  if (cached) return { ...cached, fromCache: true }

  const raw = await get(`/quote?symbol=${ticker}`)
  const data = {
    price:     raw.c,   // current price
    change:    raw.d,   // change $
    changePct: raw.dp,  // change %
    high:      raw.h,   // day high
    low:       raw.l,   // day low
    open:      raw.o,   // open
    prevClose: raw.pc,  // previous close
  }
  cache.setPrice(ticker, data)
  return { ...data, fromCache: false }
}

/* ── Analyst price target → upside % ───────────────────── */
export async function getAnalystTarget(ticker) {
  const cached = cache.getAnalyst(ticker)
  if (cached) return { ...cached, fromCache: true }

  const [target, recs] = await Promise.all([
    get(`/stock/price-target?symbol=${ticker}`),
    get(`/stock/recommendation?symbol=${ticker}`),
  ])

  const data = {
    targetMean:   target.targetMean,
    targetHigh:   target.targetHigh,
    targetLow:    target.targetLow,
    targetMedian: target.targetMedian,
    analystCount: target.targetMean ? recs[0]?.buy + recs[0]?.strongBuy + recs[0]?.hold + recs[0]?.sell + recs[0]?.strongSell : 0,
    // Consensus counts (most recent period)
    strongBuy:  recs[0]?.strongBuy  ?? 0,
    buy:        recs[0]?.buy        ?? 0,
    hold:       recs[0]?.hold       ?? 0,
    sell:       recs[0]?.sell       ?? 0,
    strongSell: recs[0]?.strongSell ?? 0,
  }
  cache.setAnalyst(ticker, data)
  return { ...data, fromCache: false }
}

/**
 * Calculate upside % from current price + analyst mean target.
 * Formula: (target / current - 1) × 100
 */
export function calcUpside(currentPrice, targetMean) {
  if (!currentPrice || !targetMean) return null
  return ((targetMean / currentPrice) - 1) * 100
}

/* ── Earnings calendar ──────────────────────────────────── */
export async function getEarningsCalendar(from, to) {
  const cached = cache.getEarnings()
  if (cached) return { data: cached, fromCache: true }

  const raw = await get(`/calendar/earnings?from=${from}&to=${to}`)
  const data = raw.earningsCalendar ?? []
  cache.setEarnings(data)
  return { data, fromCache: false }
}

/* ── Company news ───────────────────────────────────────── */
export async function getNews(ticker, from, to) {
  const cached = cache.getNews(ticker)
  if (cached) return { data: cached, fromCache: true }

  const raw = await get(`/company-news?symbol=${ticker}&from=${from}&to=${to}`)
  const data = (raw ?? []).slice(0, 10)  // keep top 10
  cache.setNews(ticker, data)
  return { data, fromCache: false }
}
