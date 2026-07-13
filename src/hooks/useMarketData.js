/**
 * MODULE: HOOKS / useMarketData.js
 * Fetches real-time prices via the Worker batch endpoint.
 *
 * Architecture:
 *   1. Deduplicate tickers from positions + watchlist
 *   2. Check localStorage cache (5 min TTL) — instant
 *   3. Single batch request to /api/prices?tickers=... for misses
 *   4. Single state update → no partial re-renders
 *   5. AbortController cancels stale requests
 *   6. Auto-refreshes every 5 minutes
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { getWorkerUrl }  from '../utils/api/worker.js'
import { cache }         from '../utils/cache.js'
import { POSITIONS }     from '../data/positions.js'
import { loadWatchlist } from '../utils/watchlistStorage.js'
import { loadOverrides } from '../utils/positionsStorage.js'

const REFRESH_INTERVAL = 5 * 60 * 1000   // 5 min
const MAX_BATCH        = 50               // worker hard limit

/** Single batch fetch → Worker /api/prices endpoint */
async function fetchBatch(tickers, signal) {
  const base    = getWorkerUrl()?.replace(/\/$/, '')
  const joined  = tickers.join(',')
  const url     = `${base}/api/prices?tickers=${joined}`
  const res     = await fetch(url, { signal })
  if (!res.ok) throw new Error(`batch_prices HTTP ${res.status}`)
  return res.json()           // { prices, errors, meta }
}

export function useMarketData() {
  const [prices,      setPrices]      = useState({})
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const timerRef   = useRef(null)
  const abortRef   = useRef(null)   // AbortController for in-flight requests

  const fetchPrices = useCallback(async () => {
    if (!getWorkerUrl()) return

    // Cancel any previous in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    setLoading(true)
    setError(null)

    try {
      // Collect all tickers from every source
      const posTickers  = POSITIONS.map(p => p.ticker)
      const customPos   = loadOverrides() ?? []
      const custTickers = customPos.map(p => p.ticker)
      const wlTickers   = (loadWatchlist() ?? []).map(w => w.ticker)
      const allTickers  = [...new Set([...posTickers, ...custTickers, ...wlTickers])]
                            .slice(0, MAX_BATCH)

      if (!allTickers.length) { setLoading(false); return }

      const newPrices = {}
      const toFetch   = []

      // Layer 1: localStorage cache (instant, no network)
      for (const ticker of allTickers) {
        const cached = cache.getPrice(ticker)
        if (cached) newPrices[ticker] = cached
        else        toFetch.push(ticker)
      }

      // Layer 2: single batch request for misses
      if (toFetch.length > 0) {
        const t0 = performance.now()
        const result = await fetchBatch(toFetch, signal)
        const durationMs = Math.round(performance.now() - t0)

        // Log client-side telemetry
        console.log(JSON.stringify({
          event:        'batch_prices_client',
          duration_ms:  durationMs,
          requested:    result.meta?.requested,
          returned:     result.meta?.returned,
          cache_hits:   result.meta?.cacheHits,
          provider_calls: result.meta?.providerCalls,
          errors:       Object.keys(result.errors ?? {}).length,
        }))

        // Merge results — single state update below
        for (const [ticker, data] of Object.entries(result.prices ?? {})) {
          newPrices[ticker] = data
          cache.setPrice(ticker, data)
        }
      }

      // Single setState → single re-render (no partial updates)
      setPrices(newPrices)
      setLastUpdated(new Date())
    } catch (err) {
      if (err.name === 'AbortError') return   // stale request cancelled — not an error
      setError(err.message)
      console.warn('[useMarketData]', err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrices()
    timerRef.current = setInterval(fetchPrices, REFRESH_INTERVAL)
    return () => {
      clearInterval(timerRef.current)
      abortRef.current?.abort()
    }
  }, [fetchPrices])

  const livePositions = useMemo(() =>
    POSITIONS.map(pos => {
      const live = prices[pos.ticker]
      return {
        ...pos,
        currentPrice: live?.price     ?? pos.currentPrice,
        dayChange:    live?.change    ?? null,
        dayChangePct: live?.changePct ?? null,
        isLive:       !!live,
      }
    }),
    [prices]
  )

  /** Fetch a single arbitrary ticker immediately (global search, CompareView, etc.) */
  const fetchSingle = useCallback(async (ticker) => {
    if (!ticker || !getWorkerUrl()) return
    const t = ticker.toUpperCase()
    const cached = cache.getPrice(t)
    if (cached) { setPrices(prev => ({ ...prev, [t]: cached })); return }
    try {
      const result = await fetchBatch([t], null)
      const data   = result.prices?.[t]
      if (data) {
        cache.setPrice(t, data)
        setPrices(prev => ({ ...prev, [t]: data }))
      }
    } catch (e) { console.warn('[fetchSingle]', t, e.message) }
  }, [])

  return { prices, livePositions, loading, error, lastUpdated, refresh: fetchPrices, fetchSingle }
}
