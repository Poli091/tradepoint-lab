/**
 * MODULE: VIEWS / CalendarView.jsx
 * Earnings catalyst calendar with decision types and conviction rings.
 */

import Badge from '../components/ui/Badge.jsx'
import ConvictionRing from '../components/ui/ConvictionRing.jsx'
import { EARNINGS } from '../data/earnings.js'
import { POSITIONS } from '../data/positions.js'

const TYPE_LABELS = {
  catalyst: 'Catalyst',
  decision: 'Decision',
  critical: 'Critical',
  monitor:  'Monitor',
}

export default function CalendarView() {
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 16 }}>
        Earnings calendar
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {EARNINGS.map(event => {
          const pos = POSITIONS.find(p => p.ticker === event.ticker)

          return (
            <div key={event.ticker} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
            }}>
              {/* Countdown box */}
              <div style={{
                width: 60, height: 60, borderRadius: 10, flexShrink: 0,
                background: 'var(--surface-up)', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt-muted)' }}>in</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700, lineHeight: 1, color: 'var(--txt)' }}>
                  {event.daysLeft}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--txt-muted)' }}>days</div>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 700, color: 'var(--txt)' }}>
                    {event.ticker}
                  </span>
                  <Badge label={TYPE_LABELS[event.type]} type={event.type} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--txt-muted)' }}>
                    {event.date}, 2026
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--txt-sec)', lineHeight: 1.5 }}>
                  {event.note}
                </div>
              </div>

              {/* Position stats */}
              {pos && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 8 }}>
                    +{pos.upside.toFixed(1)}% analyst upside
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <ConvictionRing score={pos.conviction} size={40} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
