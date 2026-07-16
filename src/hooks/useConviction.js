/**
 * MODULE: HOOKS / useConviction.js
 * Fetches full Conviction v1.2 result from the Worker.
 * Architecture: Worker runs computeConviction() — React only renders.
 * Endpoint: GET /api/conviction/analyze/:ticker
 */

import { useState, useEffect, useCallback } from 'react'
import { workerAPI, getWorkerUrl } from '../utils/api/worker.js'
import { cache }                   from '../utils/cache.js'

const GRADE_META = {
  'STRONG BUY': { color:'#22C55E', bg:'rgba(34,197,94,0.07)',    stars:5 },
  'BUY':        { color:'#86EFAC', bg:'rgba(134,239,172,0.07)',  stars:4 },
  'HOLD':       { color:'#FBBF24', bg:'rgba(251,191,36,0.07)',   stars:3 },
  'SELL':       { color:'#F97316', bg:'rgba(249,115,22,0.07)',   stars:2 },
  'STRONG SELL':{ color:'#EF4444', bg:'rgba(239,68,68,0.07)',    stars:1 },
  'NOT_RATED':  { color:'#94A3B8', bg:'rgba(148,163,184,0.07)', stars:0 },
}

export function useConviction(ticker) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    setResult(null); setError(null); setLoading(false)
  }, [ticker])

  const compute = useCallback(async (forceRefresh = false, signal) => {
    if (!ticker) return
    const base = getWorkerUrl()
    if (!base) { setError('Worker not configured — add URL in Settings'); return }
    if (!forceRefresh && result?._ticker === ticker) return

    setLoading(true); setError(null)

    try {
      const resp = await fetch(`${base}/api/conviction/analyze/${ticker}`, {
        headers: { 'Content-Type': 'application/json' }, signal,
      })
      if (!resp.ok) throw new Error(`Worker error ${resp.status}`)
      const data = await resp.json()
      if (data.error) throw new Error(data.error)

      if (data.fundamentalsData) cache.setFund(ticker, data.fundamentalsData, Date.now())

      const meta = GRADE_META[data.grade] ?? GRADE_META['NOT_RATED']

      // Normalize risk breakdown: v1.2 uses flags[], v1.1 used breakdown[]
      const riskBreakdown = data.breakdown?.risk?.breakdown
        ?? (data.breakdown?.risk?.flags ?? []).map(f => ({ label: f.replace(/_/g,' ') }))

      setResult({
        ...data,
        _ticker:     ticker,
        // Grade display props (v1.2 returns grade as string, not object)
        grade:       data.grade,
        gradeLabel:  data.grade,
        gradeColor:  meta.color,
        gradeBg:     meta.bg,
        gradeStars:  meta.stars,
        // Normalize breakdown.risk for panel compatibility
        breakdown: data.breakdown ? {
          ...data.breakdown,
          risk: { ...data.breakdown.risk, breakdown: riskBreakdown },
        } : null,
      })

    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('[useConviction]', ticker, err.message)

      // Fallback to last D1 snapshot
      try {
        const history = await workerAPI.history?.(ticker)
        const last = history?.snapshots?.[history.snapshots.length - 1]
        if (last) {
          const meta = GRADE_META[last.grade] ?? GRADE_META['NOT_RATED']
          setResult({ ...last, _ticker: ticker, _stale: true,
            grade: last.grade, gradeLabel: last.grade,
            gradeColor: meta.color, gradeBg: meta.bg, gradeStars: meta.stars })
          setError(`Live data unavailable — showing snapshot from ${last.analysis_date}`)
          return
        }
      } catch {}
      setError(err.message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [ticker, result])

  useEffect(() => {
    if (!ticker) return
    const controller = new AbortController()
    compute(false, controller.signal)
    return () => controller.abort()
  }, [ticker]) // eslint-disable-line

  return { result, loading, error, recompute: () => compute(true) }
}
