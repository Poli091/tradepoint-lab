/**
 * MODULE: VIEWS / WatchlistView.jsx
 * Full-page watchlist with conviction rings from the engine.
 */

import { useMemo } from 'react'
import Sparkline       from '../components/ui/Sparkline.jsx'
import Badge           from '../components/ui/Badge.jsx'
import ConvictionRing  from '../components/ui/ConvictionRing.jsx'
import { WATCHLIST }   from '../data/watchlist.js'
import { genSparklines } from '../utils/chartData.js'
import { fUSD, fPct }  from '../utils/format.js'

export default function WatchlistView({ convictionResults = {} }) {
  const sparklines = useMemo(() => genSparklines(WATCHLIST, 21), [])

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 16 }}>
        Watchlist
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {WATCHLIST.map(item => {
          const isUp  = item.dayChangePct >= 0
          const spark = sparklines[item.ticker] ?? []
          const cv    = convictionResults[item.ticker]

          return (
            <div key={item.ticker} style={{
              background: 'var(--surface)',
              border: `1px solid ${cv?.gradeColor ? cv.gradeColor + '33' : 'var(--border)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: 16,
              transition: 'border-color 0.3s',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--txt)' }}>
                    {item.ticker}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 2 }}>{item.name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge label={item.priority === 'high' ? 'Priority' : 'Watch'} type={item.priority} />
                  {/* Conviction ring */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <ConvictionRing
                      score={cv?.finalScore ?? null}
                      grade={cv?.grade ?? null}
                      loading={false}
                      size={40}
                    />
                    {cv?.grade && (
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.03em',
                        color: cv.gradeColor ?? 'var(--txt-muted)' }}>
                        {cv.grade.replace('STRONG ', 'S.')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div style={{ marginBottom: 10 }}>
                <Sparkline data={spark} positive={isUp} width="100%" height={40} />
              </div>

              {/* Price row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--txt)' }}>
                    {fUSD(item.currentPrice)}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                    color: isUp ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>
                    {fPct(item.dayChangePct)} today
                  </div>
                </div>

                {/* Score breakdown mini if available */}
                {cv && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginBottom: 2 }}>Conviction</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                      color: cv.gradeColor ?? 'var(--txt)' }}>
                      {cv.finalScore}/100
                    </div>
                    <div style={{ fontSize: 9, color: cv.gradeColor ?? 'var(--txt-muted)', fontWeight: 700 }}>
                      {cv.grade}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>Analyst upside</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                  +{item.upside?.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
