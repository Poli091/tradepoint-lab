/**
 * MODULE: VIEWS / PositionsView.jsx
 * Full-page positions view with summary bar + sortable table.
 */

import { useMemo, useState }  from 'react'
import PositionsTable          from '../components/widgets/PositionsTable.jsx'
import TickerDetailPanel       from '../components/widgets/TickerDetailPanel.jsx'
import { calcPnL }             from '../utils/finance.js'
import { fUSD, fPct }          from '../utils/format.js'
import { getGrade }            from '../conviction/grade/index.js'

/* ── Stat pill ─────────────────────────────────────────── */
function Pill({ label, value, valueColor, sub }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius:'var(--radius-lg)', padding: '10px 16px', flexShrink: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--txt-muted)', textTransform: 'uppercase',
        letterSpacing: '0.07em', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700,
        color: valueColor ?? 'var(--txt)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/* ── Grade distribution bar ─────────────────────────────── */
function GradeBar({ counts, total }) {
  const GRADES = [
    { label: 'STRONG BUY', short: 'SB', color: 'var(--grade-strong-buy)' },
    { label: 'BUY',        short: 'B',  color: 'var(--grade-buy)' },
    { label: 'HOLD',       short: 'H',  color: 'var(--grade-hold)' },
    { label: 'SELL',       short: 'S',  color: 'var(--grade-sell)' },
    { label: 'STRONG SELL',short: 'SS', color: 'var(--grade-strong-sell)' },
  ]
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius:'var(--radius-lg)', padding: '10px 16px', flexShrink: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--txt-muted)', textTransform: 'uppercase',
        letterSpacing: '0.07em', fontWeight: 600, marginBottom: 8 }}>Grade distribution</div>
      {/* Bar */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1, marginBottom: 6 }}>
        {GRADES.map(g => {
          const n = counts[g.label] ?? 0
          if (!n) return null
          return <div key={g.label} title={`${g.label}: ${n}`}
            style={{ width: `${total > 0 ? (n/total)*100 : 0}%`, background: g.color, minWidth: 4 }} />
        })}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', gap: 10 }}>
        {GRADES.map(g => {
          const n = counts[g.label] ?? 0
          if (!n) return null
          return (
            <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{g.short} {n}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main view ─────────────────────────────────────────── */
export default function PositionsView({
  visiblePositions, sortBy, sortDir, handleSort,
  ticker, setTicker,
  convictionResults = {}, convictionLoading = false,
  prices = {},
  onManagePositions,
}) {
  const [detailOpen, setDetailOpen] = useState(false)

  const handleSelect = (t) => {
    setTicker(t)
    setDetailOpen(true)
  }

  /* ── Summary stats ── */
  const stats = useMemo(() => {
    if (!visiblePositions.length) return null

    let totalValue = 0, totalCost = 0, bestGain = -Infinity, worstGain = Infinity
    let bestTicker = null, worstTicker = null
    const gradeCounts = {}

    for (const pos of visiblePositions) {
      const { gain, gainPct } = calcPnL(pos)
      const value = pos.currentPrice * pos.qty
      totalValue += value
      totalCost  += pos.avgPrice * pos.qty

      if (gainPct > bestGain)  { bestGain  = gainPct; bestTicker  = pos.ticker }
      if (gainPct < worstGain) { worstGain = gainPct; worstTicker = pos.ticker }

      const cv = convictionResults[pos.ticker]
      if (cv?.grade) gradeCounts[cv.grade] = (gradeCounts[cv.grade] ?? 0) + 1
    }

    const totalGain = totalValue - totalCost
    const gainPct   = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0

    // Avg conviction from engine
    const scores = Object.values(convictionResults).map(r => r.finalScore).filter(s => s != null)
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length * 10) / 10
      : null
    const avgGrade = avgScore != null ? getGrade(avgScore) : null

    return {
      totalValue, totalGain, gainPct,
      bestTicker, bestGain,
      worstTicker, worstGain,
      gradeCounts,
      avgScore, avgGrade,
      total: visiblePositions.length,
    }
  }, [visiblePositions, convictionResults])

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Title ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>
          All positions
        </h1>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize: 11, color: 'var(--txt-muted)', fontFamily: 'var(--mono)' }}>
            {visiblePositions.length} holdings
          </span>
          <button onClick={onManagePositions} style={{
            padding:'4px 12px', borderRadius:6,
            border:'1px solid var(--border)', background:'transparent',
            cursor:'pointer', fontSize:11, color:'var(--accent)',
            fontWeight:600,
          }}>⚙ Manage</button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Pill
            label="Total value"
            value={fUSD(stats.totalValue)}
            sub={`${stats.totalGain >= 0 ? '+' : ''}${fUSD(stats.totalGain)} all-time`}
          />
          <Pill
            label="Total return"
            value={fPct(stats.gainPct)}
            valueColor={stats.gainPct >= 0 ? 'var(--green)' : 'var(--red)'}
          />
          {stats.avgScore != null && (
            <Pill
              label="Avg conviction"
              value={`${stats.avgScore}/100`}
              valueColor={stats.avgGrade?.color}
              sub={stats.avgGrade?.label}
            />
          )}
          {stats.bestTicker && (
            <Pill
              label="Best performer"
              value={stats.bestTicker}
              valueColor="var(--green)"
              sub={`+${stats.bestGain.toFixed(1)}%`}
            />
          )}
          {stats.worstTicker && (
            <Pill
              label="Weakest"
              value={stats.worstTicker}
              valueColor={stats.worstGain < 0 ? 'var(--red)' : 'var(--amber)'}
              sub={`${stats.worstGain >= 0 ? '+' : ''}${stats.worstGain.toFixed(1)}%`}
            />
          )}
          {Object.keys(stats.gradeCounts).length > 0 && (
            <GradeBar counts={stats.gradeCounts} total={stats.total} />
          )}
        </div>
      )}

      {/* ── Table ── */}
      <PositionsTable
        positions={visiblePositions}
        sortBy={sortBy} sortDir={sortDir} onSort={handleSort}
        selectedTicker={ticker}
        onSelectTicker={handleSelect}
        convictionResults={convictionResults}
        convictionLoading={convictionLoading}
      />

      {/* ── Detail panel ── */}
      {detailOpen && (
        <TickerDetailPanel
          ticker={ticker}
          prices={prices}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  )
}
