/**
 * MODULE: HOOKS / useMarketData.js
 * Fetches real-time prices from the Cloudflare Worker (which caches in KV).
 *
 * Architecture:
 *   1. Check localStorage (client cache, 5 min TTL) — instant
 *   2. If miss → call Worker → Worker checks KV → if miss → calls Finnhub
 *   3. Store result in localStorage for future renders
 *   4. Auto-refreshes every 5 minutes
 *
 * Falls back to static mock prices if Worker is not configured.
 * Processes in batches of 5 to respect Finnhub rate limits.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { workerAPI, getWorkerUrl } from '../utils/api/worker.js'
import { cache }                    from '../utils/cache.js'
import { POSITIONS }                from '../data/positions.js'

const REFRESH_INTERVAL = 5 * 60 * 1000   // 5 min auto-refresh
const BATCH_SIZE       = 5               // max parallel Finnhub calls per batch
const BATCH_DELAY      = 200             // ms between batches

async function batchFetch(tickers) {
  const results = {}
  const batches = []
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    batches.push(tickers.slice(i, i + BATCH_SIZE))
  }
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const settled = await Promise.allSettled(
      batch.map(t => workerAPI.price(t))
    )
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value?.data) {
        results[batch[i]] = r.value.data
      }
    })
    if (b < batches.length - 1) {
      await new Promise(res => setTimeout(res, BATCH_DELAY))
    }
  }
  return results
}

export function useMarketData() {
  const [prices,      setPrices]      = useState({})
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const timerRef = useRef(null)

  const fetchPrices = useCallback(async () => {
    if (!getWorkerUrl()) return   // Worker not configured — use mock data

    setLoading(true)
    setError(null)

    try {
      const newPrices = {}
      const toFetch   = []

      // Layer 1: localStorage cache
      for (const pos of POSITIONS) {
        const cached = cache.getPrice(pos.ticker)
        if (cached) newPrices[pos.ticker] = cached
        else        toFetch.push(pos.ticker)
      }

      // Layer 2: Worker (→ KV → Finnhub)
      if (toFetch.length > 0) {
        const fetched = await batchFetch(toFetch)
        for (const [ticker, data] of Object.entries(fetched)) {
          newPrices[ticker] = data
          cache.setPrice(ticker, data)
        }
      }

      setPrices(newPrices)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
      console.warn('[useMarketData]', err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchPrices()
    timerRef.current = setInterval(fetchPrices, REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchPrices])

  /**
   * POSITIONS merged with live prices.
   * Falls back to static currentPrice if live data not yet available.
   */
  const livePositions = useMemo(() =>
    POSITIONS.map(pos => {
      const live = prices[pos.ticker]
      return {
        ...pos,
        currentPrice: live?.price      ?? pos.currentPrice,
        dayChange:    live?.change     ?? null,
        dayChangePct: live?.changePct  ?? null,
        isLive:       !!live,
      }
    }),
    [prices]
  )

  return {
    prices,
    livePositions,
    loading,
    error,
    lastUpdated,
    refresh: fetchPrices,
  }
}
