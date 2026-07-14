/**
 * MODULE: WIDGETS / PositionsTable.jsx
 * Sortable positions table with real conviction rings + grade labels.
 *
 * Columns: Symbol · Price · Day % · P&L · Upside ↑ · Conviction
 */

import { useState, useMemo }    from 'react'
import { useBreakpoint } from '../../hooks/useBreakpoint.js'
import { RotateCcw }             from 'lucide-react'
import ConvictionRing             from '../ui/ConvictionRing.jsx'
import { calcPnL }               from '../../utils/finance.js'
import { fUSD, fPct, fSignedUSD } from '../../utils/format.js'
import LiveMiniChart from './LiveMiniChart.jsx'
import { getFundamentalsInfo, clearFundamentals } from '../../utils/api/index.js'
import { getGradeColor } from '../../conviction/grade/index.js'

const SORT_COLS = [
  { key: 'ticker',       label: 'Symbol',     align: 'left',   minW: 100 },
  { key: 'price',        label: 'Price',      align: 'right',  minW: 90  },
  { key: 'dayChangePct', label: 'Day %',      align: 'right',  minW: 70  },
  { key: 'value',        label: 'Mkt Value',  align: 'right',  minW: 100 },
  { key: 'chart',        label: 'Today',      align: 'center', minW: 95, noSort: true },
  { key: 'gain',         label: 'All-time P&L', align: 'right', minW: 130 },
  { key: 'conviction',   label: 'Conviction', align: 'right',  minW: 90  },
]

/* ── Refresh button ─────────────────────────────────── */
function RefreshBtn({ ticker, onRefreshed }) {
  const [loading, setLoading] = useState(false)
  const info    = getFundamentalsInfo(ticker)
  const stale   = info?.daysSince > 30

  const handleClick = async (e) => {
    e.stopPropagation()
    setLoading(true)
    clearFundamentals(ticker)
    await new Promise(r => setTimeout(r, 300))
    setLoading(false)
    onRefreshed?.()
  }

  if (!info) return <span style={{ fontSize:10, color:'var(--txt-muted)' }}>○</span>

  return (
    <button onClick={handleClick} title={`${info.daysSince}d ago`}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 2,
        color: stale ? 'var(--amber)' : 'var(--green)',
        display: 'flex', alignItems: 'center',
        animation: loading ? 'tp-spin 1s linear infinite' : 'none',
      }}>
      <RotateCcw size={12} />
    </button>
  )
}

/* ── Main component ─────────────────────────────────── */
export default function PositionsTable({
  positions, sortBy, sortDir, onSort,
  selectedTicker, onSelectTicker,
  convictionResults = {},
  convictionLoading = false,
  prices = {},
}) {
  const { isMobile } = useBreakpoint()
    const [refreshTick, setRefreshTick] = useState(0)

  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => {
      if (sortBy === 'gain') {
        const va = calcPnL(a).gainPct, vb = calcPnL(b).gainPct
        return sortDir === 'desc' ? vb - va : va - vb
      }
      if (sortBy === 'ticker') return sortDir === 'desc'
        ? b.ticker.localeCompare(a.ticker)
        : a.ticker.localeCompare(b.ticker)
      if (sortBy === 'value') {
        const va = calcPnL(a).value, vb = calcPnL(b).value
        return sortDir === 'desc' ? vb - va : va - vb
      }
      // dayChangePct: nulls sort to bottom regardless of direction
      if (sortBy === 'dayChangePct') {
        const va = a.dayChangePct ?? (sortDir === 'desc' ? -Infinity : Infinity)
        const vb = b.dayChangePct ?? (sortDir === 'desc' ? -Infinity : Infinity)
        return sortDir === 'desc' ? vb - va : va - vb
      }
      const va = a[sortBy] ?? 0, vb = b[sortBy] ?? 0
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [positions, sortBy, sortDir, refreshTick])

  return (
    <div style={{
      flex: 1, background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
      overflow: 'hidden', minWidth: 0,
    }}>
      {/* Table header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Positions</span>
        <span style={{
          fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'var(--mono)',
          background: 'var(--surface-up)', padding: '2px 8px', borderRadius: 4,
        }}>
          {positions.length} HOLDINGS
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 0 : 800 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {SORT_COLS.map(col => {
                // Hide less critical columns on mobile
                if (isMobile && ['chart'].includes(col.key)) return null
                const active = sortBy === col.key
                return (
                  <th key={col.key} onClick={() => { if (col.noSort) return; onSort(col.key) }} style={{ minWidth: col.minW,
                    padding: '7px 10px', textAlign: col.align,
                    fontSize: 10, fontWeight: 600,
                    color: active ? 'var(--accent)' : 'var(--txt-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    cursor: 'pointer', userSelect: 'none',
                    whiteSpace: 'nowrap', background: 'none', border: 'none',
                  }}>
                    {col.label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {sorted.map(pos => {
              const { gain, gainPct, isGain } = calcPnL(pos)
              const cv         = convictionResults[pos.ticker]
              const isSelected = selectedTicker === pos.ticker
              const dayPct     = pos.dayChangePct
              const dayColor   = dayPct == null ? 'var(--txt-muted)' : dayPct >= 0 ? 'var(--green)' : 'var(--red)'

              return (
                <tr key={pos.ticker}
                  onClick={() => onSelectTicker?.(pos.ticker)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--accent-dim)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-up)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Symbol */}
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{
                      fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                      color: isSelected ? 'var(--accent)' : 'var(--txt)',
                    }}>{pos.ticker}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{pos.name}</div>
                  </td>

                  {/* Price */}
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>
                      {fUSD(pos.currentPrice)}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt-muted)' }}>
                      avg {fUSD(pos.avgPrice)}
                    </div>
                  </td>

                  {/* Day % */}
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: dayColor }}>
                      {dayPct != null ? fPct(dayPct) : '—'}
                    </span>
                  </td>

                  {/* Market Value */}
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div className="pv" style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>
                      {fUSD(pos.currentPrice * pos.qty)}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt-muted)' }}>
                      {parseFloat(pos.qty.toFixed(4))} sh
                    </div>
                  </td>

                  {/* Today sparkline — hidden on mobile */}
                  {!isMobile && (
                    <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid var(--border)' }}>
                      <LiveMiniChart ticker={pos.ticker} prices={prices} width={60} height={26} compact />
                    </td>
                  )}

                  {/* All-time P&L */}
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap', minWidth: 130 }}>
                    <div className="pv" style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: isGain ? 'var(--green)' : 'var(--red)' }}>
                      {fSignedUSD(gain)}
                    </div>
                    <div className="pv" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: isGain ? 'var(--green)' : 'var(--red)' }}>
                      {fPct(gainPct)}
                    </div>
                  </td>

                  {/* Conviction ring + grade */}
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <ConvictionRing
                        score={cv?.finalScore ?? (convictionLoading && !cv ? null : pos.conviction)}
                        grade={cv?.grade ?? null}
                        loading={convictionLoading && !cv}
                        size={36}
                      />
                      {cv?.grade && (
                        <span style={{
                          fontSize: 8, fontWeight: 700, letterSpacing: '0.04em',
                          color: getGradeColor(cv?.grade) ?? 'var(--txt-muted)',
                        }}>
                          {cv.grade.replace('STRONG ', 'S.')}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
