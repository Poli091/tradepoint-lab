/**
 * MODULE: VIEWS / WatchlistView.jsx
 * Full-page watchlist as expandable cards.
 */

import { useMemo } from 'react'
import Sparkline from '../components/ui/Sparkline.jsx'
import Badge from '../components/ui/Badge.jsx'
import ConvictionRing from '../components/ui/ConvictionRing.jsx'
import { WATCHLIST } from '../data/watchlist.js'
import { POSITIONS } from '../data/positions.js'
import { genSparklines } from '../utils/chartData.js'
import { fUSD, fPct } from '../utils/format.js'

export default function WatchlistView() {
  const sparklines = useMemo(() => genSparklines(WATCHLIST, 30), [])

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 16 }}>
        Watchlist
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {WATCHLIST.map(item => {
          const isUp  = item.dayChangePct >= 0
          const spark = sparklines[item.ticker] ?? []
          const heldPos = POSITIONS.find(p => p.ticker === item.ticker)

          return (
            <div key={item.ticker} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 18,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--txt)' }}>
                    {item.ticker}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 2 }}>{item.name}</div>
                </div>
                <Badge label={item.priority === 'high' ? 'Priority' : 'Watch'} type={item.priority} />
              </div>

              {/* Sparkline */}
              <div style={{ marginBottom: 10 }}>
                <Sparkline data={spark} positive={isUp} width={220} height={40} />
              </div>

              {/* Price row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--txt)' }}>
                    {fUSD(item.currentPrice)}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: isUp ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>
                    {fPct(item.dayChangePct)} today
                  </div>
                </div>
                {heldPos && <ConvictionRing score={heldPos.conviction} size={44} />}
              </div>

              {/* Stats footer */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>Analyst upside</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                    +{item.upside.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
