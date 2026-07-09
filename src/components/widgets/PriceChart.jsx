/**
 * MODULE: WIDGETS / PriceChart.jsx
 * Shows real OHLCV data from Alpaca via the Worker.
 * Falls back to generated data if Worker is not configured.
 *
 * Data flow:
 *  1. Show generated data immediately (no loading flash)
 *  2. Check localStorage cache → swap to real data if hit
 *  3. Fetch from Worker (Alpaca) → cache → swap to real data
 */

import { useState, useEffect, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { POSITIONS }              from '../../data/positions.js'
import { genPriceData, RANGE_DAYS } from '../../utils/chartData.js'
import { cache }                  from '../../utils/cache.js'
import { workerAPI, getWorkerUrl } from '../../utils/api/worker.js'
import { fUSD, fPct }             from '../../utils/format.js'

const RANGES  = ['1W', '1M', '3M', '6M']
const GRAD_ID = 'tp-area-gradient'

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--surface-up)', border:'1px solid var(--border)',
      borderRadius:8, padding:'8px 12px',
    }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--txt)' }}>
        {fUSD(payload[0].value)}
      </div>
      <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2 }}>
        {payload[0].payload.date}
      </div>
    </div>
  )
}

export default function PriceChart({ ticker, onTickerChange, range, onRangeChange, prices = {} }) {
  const pos          = POSITIONS.find(p => p.ticker === ticker)
  const livePrice    = prices[ticker]?.price ?? pos?.currentPrice ?? 0
  const [chartData,  setChartData]  = useState(null)
  const [isLive,     setIsLive]     = useState(false)
  const [chartLoad,  setChartLoad]  = useState(false)

  /* ── Load OHLCV: cache → Worker → generated fallback ── */
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLive(false)

      // 1. Show generated data immediately (no blank state)
      const days      = RANGE_DAYS[range] || 63
      const generated = genPriceData(livePrice || 100, days)
      if (!cancelled) setChartData(generated)

      // 2. Check localStorage cache
      const cached = cache.getOHLCV(ticker, range)
      if (cached?.length > 0) {
        if (!cancelled) { setChartData(cached); setIsLive(true) }
        return
      }

      // 3. Fetch from Worker
      if (!getWorkerUrl()) return
      setChartLoad(true)
      try {
        const result = await workerAPI.ohlcv(ticker, range)
        if (!cancelled && result?.data?.length > 0) {
          cache.setOHLCV(ticker, range, result.data)
          setChartData(result.data)
          setIsLive(true)
        }
      } catch (err) {
        console.warn('[PriceChart] OHLCV fetch failed:', err.message)
      } finally {
        if (!cancelled) setChartLoad(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [ticker, range])   // eslint-disable-line react-hooks/exhaustive-deps

  const data = chartData || []
  const first = data[0]?.price ?? 0
  const last  = livePrice || (data[data.length - 1]?.price ?? 0)
  const isUp  = last >= first
  const pct   = first > 0 ? ((last - first) / first) * 100 : 0
  const color = 'var(--chart-line)'
  const priceColor = isUp ? 'var(--green)' : 'var(--red)'

  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', padding:20,
      flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:14,
    }}>
      {/* ── Price + range + status ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{
              fontFamily:'var(--mono)', fontSize:26, fontWeight:700,
              color:'var(--txt)', letterSpacing:'-0.03em',
            }}>
              {fUSD(livePrice || last)}
            </span>
            {/* Live / Simulated badge */}
            <span style={{
              fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4,
              fontFamily:'var(--mono)', letterSpacing:'0.06em', textTransform:'uppercase',
              background: isLive ? 'var(--green-dim)'    : 'var(--surface-up)',
              color:      isLive ? 'var(--green)'         : 'var(--txt-muted)',
            }}>
              {chartLoad ? '↻' : isLive ? 'Live' : 'Sim'}
            </span>
          </div>
          <div style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, color:priceColor, marginTop:4 }}>
            {isUp ? '▲' : '▼'} {fPct(Math.abs(pct))} ({range})
          </div>
        </div>

        {/* Range picker */}
        <div style={{
          display:'flex', gap:2,
          background:'var(--surface-up)', borderRadius:8, padding:2,
        }}>
          {RANGES.map(r => (
            <button key={r} onClick={() => onRangeChange(r)} style={{
              padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer',
              background: range === r ? 'var(--surface-hov)' : 'transparent',
              color:      range === r ? 'var(--txt)'          : 'var(--txt-muted)',
              fontFamily:'var(--mono)', fontSize:11, fontWeight:600, transition:'all 0.12s',
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* ── Ticker selector — horizontal scroll ── */}
      <div style={{
        display:'flex', gap:4, overflowX:'auto', paddingBottom:4,
        scrollbarWidth:'none', msOverflowStyle:'none',
      }}>
        {POSITIONS.map(p => {
          const active = ticker === p.ticker
          return (
            <button key={p.ticker} onClick={() => onTickerChange(p.ticker)} style={{
              padding:'5px 10px', borderRadius:6, cursor:'pointer', flexShrink:0,
              border:`1px solid ${active ? color : 'var(--border)'}`,
              background: active ? `${color}18` : 'transparent',
              color:      active ? color          : 'var(--txt-muted)',
              fontFamily:'var(--mono)', fontSize:11, fontWeight: active ? 700 : 500,
              transition:'all 0.11s', whiteSpace:'nowrap',
            }}>{p.ticker}</button>
          )
        })}
      </div>

      {/* ── Chart ── */}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top:4, right:6, bottom:0, left:0 }}>
          <defs>
            <linearGradient id={GRAD_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--chart-line)" stopOpacity={0.20} />
              <stop offset="95%" stopColor="var(--chart-line)" stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill:'var(--txt-muted)', fontSize:10, fontFamily:'var(--mono)' }}
            tickLine={false} axisLine={false} interval="preserveStartEnd"
          />
          <YAxis
            domain={['auto','auto']}
            tick={{ fill:'var(--txt-muted)', fontSize:10, fontFamily:'var(--mono)' }}
            tickLine={false} axisLine={false}
            tickFormatter={v => `$${Number(v).toFixed(0)}`}
            width={54}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone" dataKey="price"
            stroke="var(--chart-line)" strokeWidth={2}
            fill={`url(#${GRAD_ID})`}
            dot={false}
            activeDot={{ r:4, fill:'var(--chart-line)', stroke:'var(--bg)', strokeWidth:2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
