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

  const compute = useCallback(async (forceRefresh = false) => {
    if (!ticker) return
    if (!getWorkerUrl()) {
      setError('Worker not configured — add URL in Settings')
      return
    }

    // Check local cache first — skip network call if still fresh
    if (!forceRefresh) {
      const cachedFund = cache.getFund(ticker)
      const cachedOhlcv = cache.getOHLCV(ticker, '1Y')
      const cachedSpy   = cache.getOHLCV('SPY', '1Y')
      if (cachedFund && result) {
        // Already have a result and local cache is fresh — no need to re-run
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch all data in parallel where possible
      const [fundResult, ohlcvResult, spyResult] = await Promise.all([
        workerAPI.fundamentals(ticker, forceRefresh),
        workerAPI.ohlcv(ticker, '1Y'),
        workerAPI.ohlcv('SPY', '1Y'),
      ])

      if (!fundResult?.data) throw new Error('No fundamentals data for ' + ticker)
      // Use Worker's fetchedAt so "Xd ago" reflects when KV was actually populated
      const fetchedAt = fundResult.meta?.fetchedAt ?? Date.now()
      cache.setFund(ticker, fundResult.data, fetchedAt)

      const conviction = runConviction({
        fundamentals: fundResult.data,
        ohlcv:        ohlcvResult?.data ?? [],
        spyOhlcv:     spyResult?.data   ?? [],
        prices,
      })

      setResult({ ...conviction, _ticker: ticker })

      // Auto-save to D1 — silent failure, never blocks the UI
      workerAPI.saveAnalysis(ticker, conviction).catch(() => {})

    } catch (err) {
      console.error('[useConviction]', ticker, err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ticker]) // prices intentionally omitted — recompute on ticker change only

  useEffect(() => { compute() }, [compute])

  const recompute = () => compute(true)  // force-refresh bypasses local + KV cache
  return { result, loading, error, recompute }
}
