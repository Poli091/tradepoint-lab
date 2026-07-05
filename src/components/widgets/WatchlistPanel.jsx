/**
 * MODULE: WIDGETS / WatchlistPanel.jsx
 * Compact watchlist sidebar with sparklines and priority badges.
 */

import { useMemo } from 'react'
import Sparkline from '../ui/Sparkline.jsx'
import Badge from '../ui/Badge.jsx'
import { WATCHLIST } from '../../data/watchlist.js'
import { genSparklines } from '../../utils/chartData.js'
import { fUSD, fPct } from '../../utils/format.js'

export default function WatchlistPanel() {
  const sparklines = useMemo(() => genSparklines(WATCHLIST, 21), [])

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      width: 260,
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Watchlist</span>
        <button style={{
          padding: '3px 8px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--sans)',
        }}>
          + Add
        </button>
      </div>

      {/* Items */}
      {WATCHLIST.map(item => {
        const isUp = item.dayChangePct >= 0
        const spark = sparklines[item.ticker] ?? []
        return (
          <div
            key={item.ticker}
            style={{
              padding: '9px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hov)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {/* Name + badge */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>
                  {item.ticker}
                </span>
                <Badge label={item.priority} type={item.priority === 'high' ? 'high' : 'med'} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </div>
            </div>

            {/* Sparkline */}
            <Sparkline data={spark} positive={isUp} width={68} height={24} />

            {/* Price + change */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>
                {fUSD(item.currentPrice)}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: isUp ? 'var(--green)' : 'var(--red)' }}>
                {fPct(item.dayChangePct)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
