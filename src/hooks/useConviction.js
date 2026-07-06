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

export function useConviction(ticker, prices = {}) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const compute = useCallback(async () => {
    if (!ticker) return
    if (!getWorkerUrl()) {
      setError('Worker not configured — add URL in Settings')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch all data in parallel where possible
      const [fundResult, ohlcvResult, spyResult] = await Promise.all([
        workerAPI.fundamentals(ticker),
        workerAPI.ohlcv(ticker, '1Y'),
        workerAPI.ohlcv('SPY', '1Y'),
      ])

      if (!fundResult?.data) throw new Error('No fundamentals data for ' + ticker)

      const conviction = runConviction({
        fundamentals: fundResult.data,
        ohlcv:        ohlcvResult?.data ?? [],
        spyOhlcv:     spyResult?.data   ?? [],
        prices,
      })

      setResult(conviction)
    } catch (err) {
      console.error('[useConviction]', ticker, err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ticker]) // prices intentionally omitted — recompute on ticker change only

  useEffect(() => { compute() }, [compute])

  return { result, loading, error, recompute: compute }
}
