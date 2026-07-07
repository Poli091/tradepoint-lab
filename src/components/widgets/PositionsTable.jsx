/**
 * MODULE: WIDGETS / PositionsTable.jsx
 * Sortable positions table with:
 *  · Conviction ring per row
 *  · FMP fundamentals cache indicator (dot) + per-ticker refresh button
 *  · Horizontal scroll on mobile
 */

import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import ConvictionRing from '../ui/ConvictionRing.jsx'
import Badge          from '../ui/Badge.jsx'
import { calcPnL }    from '../../utils/finance.js'
import { fUSD, fPct, fSignedUSD } from '../../utils/format.js'
import { cache }      from '../../utils/cache.js'
import { getFundamentals, clearFundamentals, getFundamentalsInfo } from '../../utils/api/index.js'

const SORT_COLS = [
  { key: 'ticker',       label: 'Symbol',     align: 'left'  },
  { key: 'currentPrice', label: 'Price',      align: 'right' },
  { key: 'gain',         label: 'P&L',        align: 'right' },
  { key: 'upside',       label: 'Upside',     align: 'right' },
  { key: 'conviction',   label: 'Conviction', align: 'right' },
]

/** Small dot showing fundamentals cache status */
function FundDot({ ticker }) {
  const info = cache.infoFund(ticker)
  if (!info)             return <span title="No fundamentals cached" style={{ color: 'var(--txt-muted)', fontSize: 10 }}>–</span>
  if (info.daysLeft > 30) return <span title={`Fresh · ${info.daysLeft}d left`} style={{ color: 'var(--green)',  fontSize: 8 }}>●</span>
  if (info.daysLeft > 0)  return <span title={`Aging · ${info.daysLeft}d left`} style={{ color: 'var(--amber)',  fontSize: 8 }}>●</span>
  return                         <span title="Expired — refresh needed"           style={{ color: 'var(--red)',    fontSize: 8 }}>●</span>
}

/** Per-ticker manual refresh button */
function RefreshBtn({ ticker, onRefreshed }) {
  const [loading, setLoading] = useState(false)

  const handleClick = async (e) => {
    e.stopPropagation()
    setLoading(true)
    clearFundamentals(ticker)
    await getFundamentals(ticker, true)
    setLoading(false)
    onRefreshed?.()
  }

  const info = getFundamentalsInfo(ticker)
  const title = info
    ? `Updated ${info.daysSince}d ago · ${info.daysLeft}d remaining\nClick to refresh fundamentals`
    : 'No fundamentals cached — click to fetch'

  return (
    <button onClick={handleClick} title={title} style={{
      width: 22, height: 22, borderRadius: 5, border: 'none',
      background: 'transparent', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: loading ? 'var(--accent)' : 'var(--txt-muted)',
      transition: 'color 0.15s',
      animation: loading ? 'tp-spin 1s linear infinite' : 'none',
    }}
    onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
    onMouseLeave={e => !loading && (e.currentTarget.style.color = 'var(--txt-muted)')}
    >
      <RotateCcw size={12} />
    </button>
  )
}

export default function PositionsTable({
  positions, sortBy, sortDir, onSort,
  selectedTicker, onSelectTicker,
  convictionResults = {},   // { [ticker]: { finalScore, grade } } from engine
  convictionLoading = false,
}) {
  const [refreshTick, setRefreshTick] = useState(0)

  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => {
      if (sortBy === 'gain')   { const va = calcPnL(a).gainPct, vb = calcPnL(b).gainPct; return sortDir === 'desc' ? vb - va : va - vb }
      if (sortBy === 'ticker') return sortDir === 'desc' ? b.ticker.localeCompare(a.ticker) : a.ticker.localeCompare(b.ticker)
      const va = a[sortBy] ?? 0, vb = b[sortBy] ?? 0
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [positions, sortBy, sortDir])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Positions</span>
        <Badge label={`${sorted.length} holdings`} type="neutral" />
      </div>

      {/* Spin animation for refresh button */}
      <style>{`@keyframes tp-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {SORT_COLS.map(col => {
                const active = sortBy === col.key
                return (
                  <th key={col.key} onClick={() => onSort(col.key)} style={{
                    padding: '7px 10px', textAlign: col.align,
                    fontSize: 10, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--txt-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: 'none', border: 'none',
                  }}>
                    {col.label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                )
              })}
              {/* Fundamentals column */}
              <th style={{ padding: '7px 10px', fontSize: 10, fontWeight: 600, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', textAlign: 'center' }}>
                Fund.
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(pos => {
              const { gain, gainPct } = calcPnL(pos)
              const selected = selectedTicker === pos.ticker
              const isGain   = gain >= 0
              return (
                <tr key={pos.ticker} onClick={() => onSelectTicker(pos.ticker)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected ? 'var(--accent-dim)' : 'transparent', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--surface-hov)' }}
                  onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Symbol */}
                  <td style={{ padding: '9px 10px', minWidth: 110 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--txt)' }}>{pos.ticker}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{pos.name}</div>
                  </td>
                  {/* Price */}
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{fUSD(pos.currentPrice)}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt-muted)' }}>avg {fUSD(pos.avgPrice)}</div>
                  </td>
                  {/* P&L */}
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: isGain ? 'var(--green)' : 'var(--red)' }}>{fSignedUSD(gain)}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: isGain ? 'var(--green)' : 'var(--red)' }}>{fPct(gainPct)}</div>
                  </td>
                  {/* Upside */}
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: pos.upside >= 50 ? 'var(--green)' : pos.upside >= 37 ? 'var(--amber)' : 'var(--red)' }}>
                      +{pos.upside.toFixed(1)}%
                    </span>
                  </td>
                  {/* Conviction ring */}
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <ConvictionRing
                          score={convictionResults[pos.ticker]?.finalScore ?? (convictionLoading && !convictionResults[pos.ticker] ? null : pos.conviction)}
                          grade={convictionResults[pos.ticker]?.grade ?? null}
                          loading={convictionLoading && !convictionResults[pos.ticker]}
                          size={36}
                        />
                    </div>
                  </td>
                  {/* Fundamentals cache status + refresh */}
                  <td style={{ padding: '9px 10px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <FundDot ticker={pos.ticker} key={refreshTick} />
                      <RefreshBtn ticker={pos.ticker} onRefreshed={() => setRefreshTick(t => t + 1)} />
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
