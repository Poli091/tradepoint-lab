/**
 * MODULE: HOOKS / useConviction.js
 * Fetches full Conviction v1.2 result from the Worker.
 *
 * Architecture v1.2:
 *   Worker runs computeConviction() canónico (v1.2)
 *   React only renders — no local engine
 *
 * Endpoint: GET /api/conviction/analyze/:ticker
 *   Returns: full conviction result + fundamentalsData + ohlcv (for swing)
 */

import { useState, useEffect, useCallback } from 'react'
import { workerAPI, getWorkerUrl } from '../utils/api/worker.js'
import { cache }                   from '../utils/cache.js'

export function useConviction(ticker) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Clear stale result immediately when ticker changes
  useEffect(() => {
    setResult(null)
    setError(null)
    setLoading(false)
  }, [ticker])

  const compute = useCallback(async (forceRefresh = false, signal) => {
    if (!ticker) return
    const base = getWorkerUrl()
    if (!base) {
      setError('Worker not configured — add URL in Settings')
      return
    }

    // Use cached result if still fresh and same ticker
    if (!forceRefresh && result?._ticker === ticker) return

    setLoading(true)
    setError(null)

    try {
      // Single call to Worker — canonical v1.2 engine runs server-side
      const resp = await fetch(`${base}/api/conviction/analyze/${ticker}`, {
        headers: { 'Content-Type': 'application/json' },
        signal,
      })
      if (!resp.ok) throw new Error(`Worker error ${resp.status}`)
      const data = await resp.json()
      if (data.error) throw new Error(data.error)

      // Cache fundamentals locally for display components
      if (data.fundamentalsData) {
        cache.setFund(ticker, data.fundamentalsData, Date.now())
      }

      setResult({
        ...data,
        _ticker:    ticker,
        grade:      data.grade,
        gradeLabel: data.grade,
      })

    } catch (err) {
      // Ignore AbortError — just a ticker change, not a real error
      if (err.name === 'AbortError') return

      console.error('[useConviction]', ticker, err.message)

      // Fallback: try to show last D1 snapshot if Worker call fails
      try {
        const history = await workerAPI.history?.(ticker)
        const last = history?.snapshots?.[history.snapshots.length - 1]
        if (last) {
          setResult({ ...last, _ticker: ticker, _stale: true })
          setError(`Live data unavailable — showing snapshot from ${last.analysis_date}`)
          return
        }
      } catch {}

      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ticker, result])

  // AbortController prevents stale responses from overwriting newer ticker
  useEffect(() => {
    if (!ticker) return
    const controller = new AbortController()
    compute(false, controller.signal)
    return () => controller.abort()
  }, [ticker]) // eslint-disable-line

  const recompute = () => compute(true)
  return { result, loading, error, recompute }
}
