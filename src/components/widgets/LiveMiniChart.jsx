/**
 * MODULE: WIDGETS / LiveMiniChart.jsx
 * Real-time intraday sparkline for watchlist cards and position rows.
 *
 * Shows the last trading session's price path as a colored SVG area chart.
 * Refreshes every 5 minutes when the market is open.
 * Displays market phase badge: PRE · OPEN · AH · CLOSED
 *
 * Props:
 *  ticker    — stock symbol
 *  prices    — live price map from useMarketData (for % change)
 *  width     — chart width in px (default 72)
 *  height    — chart height in px (default 32)
 *  compact   — if true, hides the % label (for very narrow layouts)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { workerAPI, getWorkerUrl } from '../../utils/api/worker.js'
import { cache }                   from '../../utils/cache.js'

/* ── Market phase ──────────────────────────────────────────── */
function getMarketPhase() {
  const now = new Date()
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const et = new Date(etStr)
  const day = et.getDay()
  if (day === 0 || day === 6) return 'closed'
  const hhmm = et.getHours() * 100 + et.getMinutes()
  if (hhmm <  400) return 'closed'
  if (hhmm <  930) return 'pre'
  if (hhmm < 1600) return 'open'
  if (hhmm < 2000) return 'after'
  return 'closed'
}

const PHASE_META = {
  open:   { label: '●', color: '#22C55E', title: 'Market Open' },
  pre:    { label: 'PRE', color: '#818CF8', title: 'Pre-market'  },
  after:  { label: 'AH',  color: '#F59E0B', title: 'After-hours' },
  closed: { label: null,  color: 'var(--txt-muted)', title: 'Closed' },
}

/* ── Tiny SVG sparkline ────────────────────────────────────── */
function Spark({ data, color, width, height }) {
  if (!data || data.length < 2) return (
    <div style={{ width, height, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width: width * 0.7, height:1, background:'var(--border)' }} />
    </div>
  )

  const prices = data.map(d => d.price)
  const minP   = Math.min(...prices)
  const maxP   = Math.max(...prices)
  const range  = maxP - minP || 1
  const pad    = 2

  const pts = prices.map((p, i) => [
    pad + (i / (prices.length - 1)) * (width - pad * 2),
    pad + (1 - (p - minP) / range) * (height - pad * 2),
  ])

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const areaPath = [
    `M${pts[0][0].toFixed(1)},${height}`,
    ...pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`),
    `L${pts[pts.length-1][0].toFixed(1)},${height}`,
    'Z',
  ].join(' ')

  const uid = `g${Math.abs(data[0]?.price?.toFixed(0) ?? 0)}-${Math.abs(data[data.length-1]?.price?.toFixed(0) ?? 0)}`

  return (
    <svg width={width} height={height} style={{ overflow:'visible', display:'block' }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${uid})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Last price dot */}
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]}
        r={2.5} fill={color} />
    </svg>
  )
}

/* ── Main component ────────────────────────────────────────── */
export default function LiveMiniChart({ ticker, prices, width = 72, height = 32, compact = false }) {
  const [bars,    setBars]    = useState([])
  const [phase,   setPhase]   = useState(getMarketPhase)
  const timerRef = useRef(null)

  const fetchBars = useCallback(async () => {
    if (!ticker || !getWorkerUrl()) return
    const cacheKey = `${ticker}:1D`
    // Use the same localStorage cache as PriceChart
    const cached = cache.getOHLCV(ticker, '1D')
    if (cached?.length > 0) { setBars(cached); return }
    try {
      const r = await workerAPI.ohlcv(ticker, '1D')
      if (r?.data?.length > 0) {
        cache.setOHLCV(ticker, '1D', r.data)
        setBars(r.data)
      }
    } catch {}
  }, [ticker])

  useEffect(() => {
    fetchBars()
    setPhase(getMarketPhase())

    // Auto-refresh every 5 min when market is open
    const tick = () => {
      const p = getMarketPhase()
      setPhase(p)
      if (p === 'open') fetchBars()
    }
    timerRef.current = setInterval(tick, 5 * 60 * 1000)
    return () => clearInterval(timerRef.current)
  }, [fetchBars])

  // Price + change from live prices feed
  const livePrice  = prices?.[ticker]?.price     ?? null
  const changePct  = prices?.[ticker]?.changePct ?? null
  const isUp       = (changePct ?? 0) >= 0
  const lineColor  = phase === 'pre' ? '#818CF8' : phase === 'after' ? '#F59E0B' : isUp ? '#22C55E' : '#EF4444'
  const meta       = PHASE_META[phase]

  const pctStr = changePct != null
    ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
    : '—'

  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      {/* Sparkline */}
      <div style={{ position:'relative', flexShrink:0 }}>
        <Spark data={bars} color={lineColor} width={width} height={height} />
        {/* Market phase badge (top-left overlay) */}
        {meta.label && (
          <div style={{
            position:'absolute', top:-1, left:0,
            fontSize:7, fontWeight:800, fontFamily:'var(--mono)',
            color: meta.color, letterSpacing:'0.04em',
            lineHeight:1, pointerEvents:'none',
          }} title={meta.title}>
            {meta.label}
          </div>
        )}
      </div>

      {/* % change label */}
      {!compact && (
        <div style={{
          fontFamily:'var(--mono)', fontSize:10, fontWeight:700,
          color: phase === 'pre' ? '#818CF8' : phase === 'after' ? '#F59E0B' : isUp ? 'var(--green)' : 'var(--red)',
          whiteSpace:'nowrap', minWidth:46, textAlign:'right',
          lineHeight:1.3,
        }}>
          <div>{pctStr}</div>
          {phase !== 'open' && phase !== 'closed' && (
            <div style={{ fontSize:8, opacity:0.7 }}>{meta.title}</div>
          )}
        </div>
      )}
    </div>
  )
}
