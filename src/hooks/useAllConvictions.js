/**
 * MODULE: HOOKS / useAllConvictions.js
 * Runs the conviction engine for every position in the portfolio.
 * Used by the Model Diagnostics view.
 *
 * Fetches SPY OHLCV once (shared) then processes tickers sequentially
 * with a small delay between each to respect API rate limits.
 * All data goes through KV cache → subsequent runs are instant.
 */

import { useState, useEffect, useCallback } from 'react'
import { workerAPI, getWorkerUrl } from '../utils/api/worker.js'
import { runConviction }           from '../conviction/index.js'

const TICKER_DELAY_MS = 250   // delay between tickers on first cold run

export function useAllConvictions(positions = [], prices = {}) {
  const [results,  setResults]  = useState({})    // { [ticker]: convictionResult }
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error,    setError]    = useState(null)

  const compute = useCallback(async () => {
    if (!positions.length) return
    if (!getWorkerUrl()) {
      setError('Worker not configured — add URL in Settings → Data Sync')
      return
    }

    setLoading(true)
    setError(null)
    setProgress({ done: 0, total: positions.length })

    try {
      // Fetch SPY OHLCV once — shared across all ticker RS calculations
      const spyResult = await workerAPI.ohlcv('SPY', '1Y').catch(() => null)
      const spyOhlcv  = spyResult?.data ?? []

      const newResults = {}

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        try {
          const [fundResult, ohlcvResult] = await Promise.all([
            workerAPI.fundamentals(pos.ticker),
            workerAPI.ohlcv(pos.ticker, '1Y'),
          ])

          if (fundResult?.data) {
            newResults[pos.ticker] = runConviction({
              fundamentals: fundResult.data,
              ohlcv:        ohlcvResult?.data ?? [],
              spyOhlcv,
              prices,
            })
          }
        } catch (err) {
          console.warn('[useAllConvictions]', pos.ticker, err.message)
        }

        setProgress({ done: i + 1, total: positions.length })

        // Small stagger between requests on cache miss runs
        if (i < positions.length - 1) {
          await new Promise(r => setTimeout(r, TICKER_DELAY_MS))
        }
      }

      setResults(newResults)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [positions, prices]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { compute() }, [compute])

  return { results, loading, progress, error, recompute: compute }
}

/* ── Aggregate statistics across all results ──────────────── */
export function calcDiagnostics(results) {
  const tickers = Object.keys(results)
  if (!tickers.length) return null

  const DIMS = [
    { key: 'growth',    max: 25, label: 'Growth'    },
    { key: 'quality',   max: 20, label: 'Quality'   },
    { key: 'strength',  max: 15, label: 'Strength'  },
    { key: 'valuation', max: 15, label: 'Valuation' },
    { key: 'technical', max: 15, label: 'Technical' },
  ]

  // Per-dimension average % of max
  const dimStats = DIMS.map(({ key, max, label }) => {
    const available = tickers
      .map(t => results[t].breakdown[key])
      .filter(b => b?.score != null && !b.skipped)

    const avgPct  = available.length > 0
      ? available.reduce((s, b) => s + (b.score / max) * 100, 0) / available.length
      : null
    const avgLoss = avgPct != null ? max * (1 - avgPct / 100) : null

    return { key, label, max, avgPct, avgLoss, n: available.length }
  })

  // Sort by avgPct ascending → biggest limiter first
  const rankingByLimit = [...dimStats]
    .filter(d => d.avgPct != null)
    .sort((a, b) => a.avgPct - b.avgPct)

  // Gate activation counts
  let gate1Count = 0, gate2Count = 0
  let riskPenaltyTotal = 0
  let nullFieldsTotal  = 0

  for (const ticker of tickers) {
    const r = results[ticker]
    if (r.activeGate === 'gate1') gate1Count++
    if (r.activeGate === 'gate2') gate2Count++
    riskPenaltyTotal += r.riskPenalty ?? 0
    nullFieldsTotal  += Object.values(r.breakdown)
      .reduce((s, b) => s + (b.nullFields ?? 0), 0)
  }

  // Score distribution
  const scores      = tickers.map(t => results[t].finalScore)
  const avgScore    = scores.reduce((a, b) => a + b, 0) / scores.length
  const gradeCounts = { 'STRONG BUY': 0, 'BUY': 0, 'HOLD': 0, 'SELL': 0, 'STRONG SELL': 0 }
  tickers.forEach(t => {
    const g = results[t].grade
    if (gradeCounts[g] !== undefined) gradeCounts[g]++
  })

  return {
    dimStats,
    rankingByLimit,
    gate1Count,
    gate2Count,
    riskPenaltyTotal,
    nullFieldsTotal,
    avgScore:  Math.round(avgScore * 10) / 10,
    gradeCounts,
    tickerCount: tickers.length,
  }
}
