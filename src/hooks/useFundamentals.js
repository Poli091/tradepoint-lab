/**
 * MODULE: HOOKS / useFundamentals.js
 * Fetches real fundamentals for a ticker via the Cloudflare Worker.
 *
 * Cache hierarchy:
 *  1. localStorage (tp_fund_TICKER) — 90 days, instant
 *  2. Cloudflare KV (via Worker)    — 90 days, shared across devices
 *  3. Finnhub (2 calls) + FMP (2 calls) — only on first ever scan
 *
 * After the first scan of a ticker, fundamentals cost 0 API calls
 * for the next 90 days on any device.
 */

import { useState, useEffect, useCallback } from 'react'
import { workerAPI, getWorkerUrl } from '../utils/api/worker.js'
import { cache }                    from '../utils/cache.js'

export function useFundamentals(ticker) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [freshness, setFreshness] = useState(null)

  const load = useCallback(async (forceRefresh = false) => {
    if (!ticker) return

    setError(null)

    // Layer 1: localStorage (instant, no network)
    if (!forceRefresh) {
      const cached = cache.getFund(ticker)
      if (cached) {
        setData(cached)
        setFreshness(cache.infoFund(ticker))
        return
      }
    }

    // Layer 2: Worker (KV → Finnhub + FMP)
    if (!getWorkerUrl()) {
      setError('Worker not configured — add URL in Settings → Data Sync')
      return
    }

    setLoading(true)
    try {
      const result = await workerAPI.fundamentals(ticker, forceRefresh)
      if (result?.data) {
        cache.setFund(ticker, result.data)
        setData(result.data)
        setFreshness(cache.infoFund(ticker))
      } else {
        setError('No data returned from Worker')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ticker])

  // Fetch when ticker changes
  useEffect(() => { load(false) }, [load])

  const refresh = useCallback(() => {
    cache.deleteFund(ticker)
    load(true)
  }, [ticker, load])

  return { data, loading, error, freshness, refresh }
}
