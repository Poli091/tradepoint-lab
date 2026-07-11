/**
 * MODULE: HOOKS / useConviction.js
 * Fetches fundamentals + OHLCV (ticker + SPY) then runs the conviction engine.
 *
 * Data sources:
 *   fundamentals → Worker /api/fundamentals/:ticker (KV 90d cache)
 *   ohlcv        → Worker /api/ohlcv/:ticker/1Y      (KV 24h cache)
 *   spyOhlcv     → Worker /api/ohlcv/SPY/1Y           (KV 24h cache, shared)
 *
 * The result is memoized in React state. Re-runs when ticker changes.
 */

import { useState, useEffect, useCallback } from 'react'
import { workerAPI, getWorkerUrl } from '../utils/api/worker.js'
import { runConviction }           from '../conviction/index.js'
import { cache }                   from '../utils/cache.js'

export function useConviction(ticker, prices = {}) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Clear stale result immediately when ticker changes
  // This prevents showing NVDA data while loading AVGO
  useEffect(() => {
    setResult(null)
    setError(null)
    setLoading(false)
  }, [ticker])

  const compute = useCallback(async (forceRefresh = false) => {
    if (!ticker) return
    if (!getWorkerUrl()) {
      setError('Worker not configured — add URL in Settings')
      return
    }

    // Skip re-fetch only if we already have a valid result FOR THIS TICKER
    // and the local cache is still fresh. Never skip for a different ticker.
    if (!forceRefresh) {
      const cachedFund = cache.getFund(ticker)
      if (cachedFund && result?._ticker === ticker) {
        // Already computed this ticker and cache is fresh — nothing to do
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const [fundResult, ohlcvResult, spyResult] = await Promise.all([
        workerAPI.fundamentals(ticker, forceRefresh),
        workerAPI.ohlcv(ticker, '1Y'),
        workerAPI.ohlcv('SPY', '1Y'),
      ])

      if (!fundResult?.data) throw new Error('No fundamentals data for ' + ticker)

      const fetchedAt = fundResult.meta?.fetchedAt ?? Date.now()
      cache.setFund(ticker, fundResult.data, fetchedAt)

      const conviction = runConviction({
        fundamentals: fundResult.data,
        ohlcv:        ohlcvResult?.data ?? [],
        spyOhlcv:     spyResult?.data   ?? [],
        prices,
      })

      // Tag result with ticker so we can detect stale results
      setResult({ ...conviction, _ticker: ticker })

      // Auto-save to D1 — silent failure
      workerAPI.saveAnalysis(ticker, conviction).catch(() => {})

    } catch (err) {
      console.error('[useConviction]', ticker, err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ticker, result]) // result included so the cache check sees current value

  useEffect(() => { compute() }, [ticker]) // eslint-disable-line

  const recompute = () => compute(true)
  return { result, loading, error, recompute }
}
