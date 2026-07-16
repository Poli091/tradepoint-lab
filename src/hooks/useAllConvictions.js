/**
 * MODULE: HOOKS / useAllConvictions.js  — v1.2
 * Calls Worker /api/conviction/analyze/:ticker for each position.
 * No local engine — canonical v1.2 runs server-side.
 */

import { useState, useEffect, useCallback } from 'react'
import { getWorkerUrl } from '../utils/api/worker.js'

const GRADE_META = {
  'STRONG BUY': { color:'#22C55E', bg:'rgba(34,197,94,0.07)',    stars:5 },
  'BUY':        { color:'#86EFAC', bg:'rgba(134,239,172,0.07)',  stars:4 },
  'HOLD':       { color:'#FBBF24', bg:'rgba(251,191,36,0.07)',   stars:3 },
  'SELL':       { color:'#F97316', bg:'rgba(249,115,22,0.07)',   stars:2 },
  'STRONG SELL':{ color:'#EF4444', bg:'rgba(239,68,68,0.07)',    stars:1 },
  'NOT_RATED':  { color:'#94A3B8', bg:'rgba(148,163,184,0.07)', stars:0 },
}

const TICKER_DELAY_MS = 200

export function useAllConvictions(positions = []) {
  const [results,  setResults]  = useState({})
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState({ done:0, total:0 })
  const [error,    setError]    = useState(null)

  const compute = useCallback(async (signal) => {
    const base = getWorkerUrl()
    if (!positions.length) return
    if (!base) { setError('Worker not configured — add URL in Settings'); return }

    // Deduplicate before setting total (Combined may merge same ticker twice)
    const tickers = [...new Set(positions.map(p => p.ticker).filter(Boolean))]
    if (!tickers.length) return

    setLoading(true); setError(null)
    setProgress({ done:0, total:tickers.length })

    const newResults = {}

    for (let i = 0; i < tickers.length; i++) {
      if (signal?.aborted) return  // bail if positions changed mid-loop

      const ticker = tickers[i]
      try {
        const resp = await fetch(`${base}/api/conviction/analyze/${ticker}`, {
          headers: { 'Content-Type': 'application/json' },
          signal,
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        if (data.error) throw new Error(data.error)

        const meta = GRADE_META[data.grade] ?? GRADE_META['NOT_RATED']
        const riskBreakdown = data.breakdown?.risk?.breakdown
          ?? (data.breakdown?.risk?.flags ?? []).map(f => ({ label: f.replace(/_/g,' ') }))

        newResults[ticker] = {
          ...data,
          grade: data.grade, gradeLabel: data.grade,
          gradeColor: meta.color, gradeBg: meta.bg, gradeStars: meta.stars,
          breakdown: data.breakdown ? {
            ...data.breakdown,
            risk: { ...data.breakdown.risk, breakdown: riskBreakdown },
          } : null,
          nextEarningsDate:   data.fundamentalsData?.nextEarningsDate   ?? null,
          earningsDateSource: data.fundamentalsData?.earningsDateSource ?? null,
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        console.warn('[useAllConvictions]', ticker, err.message)
        // newResults[ticker] intentionally left unset — previous result preserved below
      }

      if (!signal?.aborted) setProgress({ done: i+1, total: tickers.length })
      if (i < tickers.length - 1 && !signal?.aborted) {
        await new Promise(r => setTimeout(r, TICKER_DELAY_MS))
      }
    }

    if (signal?.aborted) return

    // Merge: keep previous result for any ticker that errored this round
    setResults(prev => {
      const next = {}
      for (const ticker of tickers) {
        next[ticker] = newResults[ticker] ?? prev[ticker] ?? undefined
      }
      // Remove tickers no longer in position list
      return Object.fromEntries(Object.entries(next).filter(([,v]) => v != null))
    })
    setLoading(false)
  }, [positions]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const controller = new AbortController()
    compute(controller.signal)
    return () => controller.abort()
  }, [compute])

  return { results, loading, progress, error, recompute: () => compute() }
}

/* ── Aggregate statistics ──────────────────────────────────── */
export function calcDiagnostics(results) {
  const tickers = Object.keys(results)
  if (!tickers.length) return null

  const DIMS = [
    { key:'growth',    max:25, label:'Growth'    },
    { key:'quality',   max:20, label:'Quality'   },
    { key:'strength',  max:15, label:'Strength'  },
    { key:'valuation', max:15, label:'Valuation' },
    { key:'technical', max:15, label:'Technical' },
  ]

  const dimStats = DIMS.map(({ key, max, label }) => {
    const available = tickers
      .map(t => results[t].breakdown?.[key])
      .filter(b => b?.score != null && !b.skipped)
    const avgPct  = available.length > 0
      ? available.reduce((s, b) => s + (b.score / max) * 100, 0) / available.length : null
    const avgLoss = avgPct != null ? max * (1 - avgPct / 100) : null
    return { key, label, max, avgPct, avgLoss, n: available.length }
  })

  const rankingByLimit = [...dimStats].filter(d => d.avgPct != null).sort((a,b) => a.avgPct - b.avgPct)

  let gate1Count=0, gate2Count=0, riskPenaltyTotal=0, nullFieldsTotal=0
  for (const ticker of tickers) {
    const r = results[ticker]
    if (r.activeGate === 'gate1') gate1Count++
    if (r.activeGate === 'gate2') gate2Count++
    riskPenaltyTotal += r.riskPenalty ?? 0
    nullFieldsTotal  += Object.values(r.breakdown ?? {}).reduce((s,b) => s+(b?.nullFields??0), 0)
  }

  const scores   = tickers.map(t => results[t].finalScore).filter(Number.isFinite)
  const avgScore = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null

  const gradeCounts = { 'STRONG BUY':0,'BUY':0,'HOLD':0,'SELL':0,'STRONG SELL':0,'NOT_RATED':0 }
  tickers.forEach(t => { const g=results[t].grade; if(g in gradeCounts) gradeCounts[g]++ })

  return {
    dimStats, rankingByLimit, gate1Count, gate2Count,
    riskPenaltyTotal, nullFieldsTotal,
    avgScore: Number.isFinite(avgScore) ? Math.round(avgScore*10)/10 : null,
    gradeCounts, tickerCount: tickers.length,
  }
}
