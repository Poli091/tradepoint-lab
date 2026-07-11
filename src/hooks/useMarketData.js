/**
 * MODULE: HOOKS / useMarketData.js
 * Fetches real-time prices from the Cloudflare Worker.
 *
 * Now includes watchlist tickers — reads them from localStorage on each fetch
 * so the watchlist always shows live prices without extra props.
 *
 * Architecture:
 *   1. Check localStorage (client cache, 5 min TTL) — instant
 *   2. If miss → Worker → KV → Finnhub
 *   3. Auto-refreshes every 5 minutes
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { workerAPI, getWorkerUrl } from '../utils/api/worker.js'
import { cache }                    from '../utils/cache.js'
import { POSITIONS }                from '../data/positions.js'
import { loadWatchlist }            from '../utils/watchlistStorage.js'

const REFRESH_INTERVAL = 5 * 60 * 1000
const BATCH_SIZE       = 5
const BATCH_DELAY      = 200

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
    if (!getWorkerUrl()) return

    setLoading(true)
    setError(null)

    try {
      // Merge portfolio tickers + watchlist tickers (deduplicated)
      const posTickers       = POSITIONS.map(p => p.ticker)
      const watchlistItems   = loadWatchlist() ?? []
      const watchlistTickers = watchlistItems.map(w => w.ticker)
      const allTickers       = [...new Set([...posTickers, ...watchlistTickers])]

      const newPrices = {}
      const toFetch   = []

      // Layer 1: localStorage cache
      for (const ticker of allTickers) {
        const cached = cache.getPrice(ticker)
        if (cached) newPrices[ticker] = cached
        else        toFetch.push(ticker)
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

  useEffect(() => {
    fetchPrices()
    timerRef.current = setInterval(fetchPrices, REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchPrices])

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

  /** Fetch price for a single arbitrary ticker immediately (e.g. from global search) */
  const fetchSingle = useCallback(async (ticker) => {
    if (!ticker || !getWorkerUrl()) return
    const t = ticker.toUpperCase()
    const cached = cache.getPrice(t)
    if (cached) { setPrices(prev => ({ ...prev, [t]: cached })); return }
    try {
      const result = await workerAPI.price(t)
      if (result?.data) {
        cache.setPrice(t, result.data)
        setPrices(prev => ({ ...prev, [t]: result.data }))
      }
    } catch (e) { console.warn('[fetchSingle]', t, e.message) }
  }, [])

  return {
    prices,
    livePositions,
    loading,
    error,
    lastUpdated,
    refresh: fetchPrices,
    fetchSingle,
  }
}
