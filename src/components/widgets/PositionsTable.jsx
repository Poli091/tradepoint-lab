/**
 * MODULE: WIDGETS / PositionsTable.jsx
 * Sortable positions table with conviction rings, P&L, and upside.
 */

import { useMemo } from 'react'
import ConvictionRing from '../ui/ConvictionRing.jsx'
import Badge from '../ui/Badge.jsx'
import { calcPnL } from '../../utils/finance.js'
import { fUSD, fPct, fSignedUSD } from '../../utils/format.js'

const SORT_COLS = [
  { key: 'ticker',       label: 'Symbol',    align: 'left'  },
  { key: 'currentPrice', label: 'Price',     align: 'right' },
  { key: 'gain',         label: 'P&L',       align: 'right' },
  { key: 'upside',       label: 'Upside',    align: 'right' },
  { key: 'conviction',   label: 'Conviction',align: 'right' },
]

export default function PositionsTable({
  positions, sortBy, sortDir, onSort,
  selectedTicker, onSelectTicker,
  compact = false,
}) {
  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => {
      let va, vb
      if (sortBy === 'gain') {
        va = calcPnL(a).gainPct
        vb = calcPnL(b).gainPct
      } else if (sortBy === 'ticker') {
        return sortDir === 'desc'
          ? b.ticker.localeCompare(a.ticker)
          : a.ticker.localeCompare(b.ticker)
      } else {
        va = a[sortBy] ?? 0
        vb = b[sortBy] ?? 0
      }
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [positions, sortBy, sortDir])

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      flex: 1,
      minWidth: 0,
    }}>
      {/* Panel header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Positions</span>
        <Badge label={`${sorted.length} holdings`} type="neutral" />
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {SORT_COLS.map(col => {
                const active = sortBy === col.key
                return (
                  <th
                    key={col.key}
                    onClick={() => onSort(col.key)}
                    style={{
                      padding: '7px 12px',
                      textAlign: col.align,
                      fontSize: 10, fontWeight: 600,
                      color: active ? 'var(--accent)' : 'var(--txt-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      cursor: 'pointer', userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(pos => {
              const { gain, gainPct } = calcPnL(pos)
              const selected = selectedTicker === pos.ticker
              const isGain = gain >= 0
              return (
                <tr
                  key={pos.ticker}
                  onClick={() => onSelectTicker(pos.ticker)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selected ? 'var(--accent-dim)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--surface-hov)' }}
                  onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Symbol */}
                  <td style={{ padding: '9px 12px', minWidth: 120 }}>
                    <div style={{
                      fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                      color: selected ? 'var(--accent)' : 'var(--txt)',
                    }}>{pos.ticker}</div>
                    {!compact && (
                      <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{pos.name}</div>
                    )}
                  </td>

                  {/* Price */}
                  <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>
                      {fUSD(pos.currentPrice)}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt-muted)' }}>
                      avg {fUSD(pos.avgPrice)}
                    </div>
                  </td>

                  {/* P&L */}
                  <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: isGain ? 'var(--green)' : 'var(--red)' }}>
                      {fSignedUSD(gain)}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: isGain ? 'var(--green)' : 'var(--red)' }}>
                      {fPct(gainPct)}
                    </div>
                  </td>

                  {/* Upside */}
                  <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
                      color: pos.upside >= 50 ? 'var(--green)' : pos.upside >= 37 ? 'var(--amber)' : 'var(--red)',
                    }}>
                      +{pos.upside.toFixed(1)}%
                    </span>
                  </td>

                  {/* Conviction ring */}
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <ConvictionRing score={pos.conviction} size={36} />
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
