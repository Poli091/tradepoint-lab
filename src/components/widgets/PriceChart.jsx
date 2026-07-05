/**
 * MODULE: WIDGETS / PriceChart.jsx
 * Interactive price chart with ticker selector and time range picker.
 * Uses recharts AreaChart. Swap genPriceData() for a live API to go live.
 */

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { POSITIONS } from '../../data/positions.js'
import { genPriceData, RANGE_DAYS } from '../../utils/chartData.js'
import { fUSD, fPct } from '../../utils/format.js'

const RANGES = ['1W', '1M', '3M', '6M']
const GRAD_ID = 'tp-area-gradient'

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  const d = payload[0].payload.date
  return (
    <div style={{
      background: 'var(--surface-up)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '8px 12px',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>
        {fUSD(v)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--txt-muted)', marginTop: 2 }}>{d}</div>
    </div>
  )
}

export default function PriceChart({ ticker, onTickerChange, range, onRangeChange }) {
  const pos = POSITIONS.find(p => p.ticker === ticker)

  const data = useMemo(
    () => genPriceData(pos?.currentPrice ?? 100, RANGE_DAYS[range] ?? 63),
    [ticker, range] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const first      = data[0]?.price ?? 0
  const last       = data[data.length - 1]?.price ?? 0
  const isUp       = last >= first
  const lineColor  = 'var(--chart-line)'   // always purple — the lab aesthetic
  const priceColor = isUp ? 'var(--green)' : 'var(--red)'  // green/red for the price indicator only
  const pct        = first > 0 ? ((last - first) / first) * 100 : 0

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: 20,
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* ── Price + range row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700,
            color: 'var(--txt)', lineHeight: 1, letterSpacing: '-0.03em',
          }}>
            {pos ? fUSD(pos.currentPrice) : '—'}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: priceColor, marginTop: 4 }}>
            {isUp ? '▲' : '▼'} {fPct(Math.abs(pct))} ({range})
          </div>
        </div>

        {/* Range picker */}
        <div style={{
          display: 'flex', gap: 2,
          background: 'var(--surface-up)',
          borderRadius: 8,
          padding: 2,
        }}>
          {RANGES.map(r => (
            <button key={r} onClick={() => onRangeChange(r)} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: range === r ? 'var(--surface-hov)' : 'transparent',
              color: range === r ? 'var(--txt)' : 'var(--txt-muted)',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
              transition: 'all 0.12s',
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* ── Ticker selector ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {POSITIONS.map(p => {
          const active = ticker === p.ticker
          return (
            <button key={p.ticker} onClick={() => onTickerChange(p.ticker)} style={{
              padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--chart-line)' : 'var(--border)'}`,
              background: active ? 'var(--chart-dim)' : 'transparent',
              color: active ? 'var(--chart-line)' : 'var(--txt-muted)',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
              transition: 'all 0.11s',
            }}>{p.ticker}</button>
          )
        })}
      </div>

      {/* ── Chart ── */}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={GRAD_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--chart-line)" stopOpacity={0.20} />
              <stop offset="95%" stopColor="var(--chart-line)" stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--txt-muted)', fontSize: 10, fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--txt-muted)', fontSize: 10, fontFamily: 'var(--mono)' }}
            tickLine={false} axisLine={false}
            tickFormatter={v => `$${Number(v).toFixed(0)}`}
            width={54}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="price"
            stroke={lineColor}
            strokeWidth={2}
            fill={`url(#${GRAD_ID})`}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--chart-line)', stroke: 'var(--bg)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
