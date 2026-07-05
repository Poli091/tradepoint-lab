/**
 * MODULE: API / fmp.js
 * Financial Modeling Prep — 250 req/day free tier.
 *
 * Strategy: fetch 4 endpoints per ticker on first scan,
 * then cache for 90 days. Fundamentals only change at earnings (~quarterly).
 *
 * Cost model:
 *  · First load 12 tickers = 48 calls (19% of daily quota)
 *  · Days 2–89 = 0 calls (everything from localStorage)
 *  · Day 90 or after earnings = 48 calls again
 *  · Adding a new ticker = 4 calls only for that ticker
 *
 * Manual refresh: per-ticker only (not global) to protect the daily limit.
 */

import { API_KEYS, ENDPOINTS } from './config.js'
import { cache } from '../cache.js'

const BASE = ENDPOINTS.fmp

async function get(path) {
  const key = API_KEYS.fmp
  if (!key) throw new Error('FMP key not configured')
  const res = await fetch(`${BASE}${path}&apikey=${key}`)
  if (!res.ok) throw new Error(`FMP ${res.status}: ${path}`)
  return res.json()
}

/**
 * Fetch and cache fundamentals for one ticker (4 API calls).
 * On subsequent calls within 90 days, returns from cache (0 API calls).
 *
 * @param {string} ticker
 * @param {boolean} forceRefresh - bypass cache (manual refresh button)
 * @returns {{ data, fromCache: boolean, error?: string }}
 */
export async function getFundamentals(ticker, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = cache.getFund(ticker)
    if (cached) return { data: cached, fromCache: true }
  }

  if (!API_KEYS.fmp) {
    return { data: null, fromCache: false, error: 'FMP key not configured' }
  }

  try {
    // 4 parallel calls — uses 4 of the 250 daily quota
    const [metricsRaw, incomeRaw, earningsRaw, estimatesRaw] = await Promise.all([
      get(`/key-metrics/${ticker}?limit=4`),
      get(`/income-statement/${ticker}?limit=4`),
      get(`/earnings-surprises/${ticker}`),
      get(`/analyst-estimates/${ticker}?limit=4`),
    ])

    const m = metricsRaw[0]   ?? {}
    const i = incomeRaw[0]    ?? {}
    const e = earningsRaw[0]  ?? {}
    const est = estimatesRaw[0] ?? {}

    // Store only the fields we display — keeps localStorage usage minimal (~2KB/ticker)
    const data = {
      ticker,
      // Valuation
      pe:              m.peRatio            ?? null,
      ps:              m.priceToSalesRatio  ?? null,
      pb:              m.pbRatio            ?? null,
      evEbitda:        m.enterpriseValueOverEBITDA ?? null,
      // Profitability
      roe:             m.roe                ?? null,
      roa:             m.roa                ?? null,
      grossMargin:     m.grossProfitMargin  ?? null,
      netMargin:       m.netProfitMargin    ?? null,
      fcfYield:        m.fcfYield           ?? null,
      // Growth (YoY)
      revenueGrowth:   i.growthRevenue      ?? null,
      epsGrowth:       i.growthEPS          ?? null,
      // Balance sheet health
      debtToEquity:    m.debtToEquity       ?? null,
      currentRatio:    m.currentRatio       ?? null,
      // Earnings history
      lastEpsActual:   e.actualEarningResult   ?? null,
      lastEpsEstimate: e.estimatedEarning      ?? null,
      lastEpsBeat:     e.actualEarningResult > e.estimatedEarning,
      // Forward estimates
      epsForward:      est.estimatedEpsAvg  ?? null,
      revenueForward:  est.estimatedRevenueAvg ?? null,
    }

    cache.setFund(ticker, data)
    return { data, fromCache: false }
  } catch (err) {
    return { data: null, fromCache: false, error: err.message }
  }
}

/** Check cache status for the refresh button UI */
export function getFundamentalsInfo(ticker) {
  return cache.infoFund(ticker)
}

/** Force-clear cache for one ticker (called by the manual refresh button) */
export function clearFundamentals(ticker) {
  cache.deleteFund(ticker)
}
