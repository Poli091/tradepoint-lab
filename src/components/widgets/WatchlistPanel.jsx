/**
 * MODULE: WIDGETS / WatchlistPanel.jsx
 * Compact watchlist sidebar with sparklines, priority badges, and conviction rings.
 *
 * Fixed: item clicks now open TickerDetailPanel via onSelectTicker.
 *        + Add / Manage button wired to onManage prop.
 */

import { useMemo } from 'react'
import Sparkline       from '../ui/Sparkline.jsx'
import Badge           from '../ui/Badge.jsx'
import ConvictionRing  from '../ui/ConvictionRing.jsx'
import { WATCHLIST }        from '../../data/watchlist.js'
import { loadWatchlist }    from '../../utils/watchlistStorage.js'
import { genSparklines } from '../../utils/chartData.js'
import { fUSD, fPct }  from '../../utils/format.js'
import { getGradeColor } from '../../conviction/grade/index.js'

export default function WatchlistPanel({ style = {}, convictionResults = {}, onSelectTicker, onManage }) {
  const items      = loadWatchlist() ?? WATCHLIST
  const sparklines = useMemo(() => genSparklines(items, 21), [items])

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      width: 260,
      flexShrink: 0,
      ...style,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Watchlist</span>
        <button
          onClick={onManage}
          style={{
            padding: '3px 8px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--sans)',
          }}>
          ⚙ Manage
        </button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txt-muted)', fontSize: 12 }}>
          No tickers on watchlist yet.<br />
          <button onClick={onManage} style={{
            marginTop: 8, background: 'transparent', border: 'none',
            color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>+ Add one</button>
        </div>
      )}

      {/* Items */}
      {items.map(item => {
        const isUp  = item.dayChangePct >= 0
        const spark = sparklines[item.ticker] ?? []
        const cv    = convictionResults[item.ticker]

        return (
          <div
            key={item.ticker}
            onClick={() => onSelectTicker?.(item.ticker)}
            style={{
              padding: '9px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', transition: 'background 0.1s',
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
              <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </div>
            </div>

            {/* Sparkline */}
            <Sparkline data={spark} positive={isUp} width={52} height={22} />

            {/* Price + change */}
            <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 52 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--txt)' }}>
                {fUSD(item.currentPrice)}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: isUp ? 'var(--green)' : 'var(--red)' }}>
                {item.dayChangePct != null ? fPct(item.dayChangePct) : '—'}
              </div>
            </div>

            {/* Conviction ring — shows when computed */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <ConvictionRing
                score={cv?.finalScore ?? null}
                grade={cv?.grade ?? null}
                loading={false}
                size={30}
              />
              {cv?.grade && (
                <span style={{ fontSize: 7, fontWeight: 700, color: getGradeColor(cv?.grade) ?? 'var(--txt-muted)', letterSpacing: '0.02em' }}>
                  {cv.grade.replace('STRONG ', 'S.')}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
