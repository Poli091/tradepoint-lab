/**
 * MODULE: VIEWS / CalendarView.jsx
 * Earnings catalyst calendar with decision types and conviction rings.
 */

import { useState } from 'react'
import Badge from '../components/ui/Badge.jsx'
import ConvictionRing from '../components/ui/ConvictionRing.jsx'
import EarningsEditor from '../components/widgets/EarningsEditor.jsx'
import { EARNINGS } from '../data/earnings.js'
import { POSITIONS } from '../data/positions.js'
import { loadEarnings } from '../utils/earningsStorage.js'
import { useLang } from '../context/LanguageContext.jsx'

const TYPE_LABELS = {
  catalyst: 'Catalyst',
  decision: 'Decision',
  critical: 'Critical',
  monitor:  'Monitor',
}

export default function CalendarView({ convictionResults = {}, prices = {} }) {
  const { t } = useLang()
  const [events,     setEvents]     = useState(() => loadEarnings() ?? EARNINGS)
  const [editorOpen, setEditorOpen] = useState(false)

  // Compute days until each event
  const now = new Date()
  const withDays = events
    .map(ev => {
      const date = new Date(ev.date)
      const days = Math.ceil((date - now) / 86400000)
      const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      const day   = date.getDate()
      return { ...ev, days, month, day }
    })
    .filter(ev => ev.days >= 0)
    .sort((a,b) => a.days - b.days)

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ fontSize:18, fontWeight:700, color:'var(--txt)', margin:0 }}>Earnings calendar</h1>
        <button onClick={() => setEditorOpen(true)} style={{
          padding:'6px 14px', borderRadius:6, border:'1px solid var(--border)',
          background:'transparent', cursor:'pointer', fontSize:12,
          color:'var(--accent)', fontWeight:600 }}>⚙ Manage</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {withDays.length === 0 && (
          <div style={{ padding:'32px', textAlign:'center', color:'var(--txt-muted)', fontSize:13 }}>
            No upcoming earnings. Click ⚙ Manage to add events.
          </div>
        )}
        {withDays.map(event => {
          const pos = POSITIONS.find(p => p.ticker === event.ticker)
          const cv  = convictionResults[event.ticker]

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
                width: 60, height: 60, borderRadius:'var(--radius-lg)', flexShrink: 0,
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
                    <ConvictionRing
                      score={cv?.finalScore ?? pos?.conviction ?? null}
                      grade={cv?.grade ?? null}
                      loading={false}
                      size={40}
                    />
                    {cv?.grade && (
                      <div style={{ fontSize:9, fontWeight:700, color:getGradeColor(cv?.grade) ?? 'var(--txt-muted)',
                        textAlign:'center', marginTop:2, letterSpacing:'0.03em' }}>
                        {cv.grade.replace('STRONG ', 'S.')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {editorOpen && (
        <EarningsEditor
          onClose={() => setEditorOpen(false)}
          onSaved={() => setEvents(loadEarnings() ?? [])}
        />
      )}
    </div>
  )
}
