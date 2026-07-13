/**
 * MODULE: VIEWS / CalendarView.jsx
 * Earnings catalyst calendar with decision types and conviction rings.
 */

import { useState, useEffect } from 'react'
import { workerAPI } from '../utils/api/worker.js'
import Badge from '../components/ui/Badge.jsx'
import ConvictionRing from '../components/ui/ConvictionRing.jsx'
import EarningsEditor from '../components/widgets/EarningsEditor.jsx'
import { EARNINGS } from '../data/earnings.js'
import { loadOverrides } from '../utils/positionsStorage.js'
import { loadEarnings } from '../utils/earningsStorage.js'
import { useLang }       from '../context/LanguageContext.jsx'
import { useBreakpoint } from '../hooks/useBreakpoint.js'
import { getGradeColor } from '../conviction/grade/index.js'

const TYPE_LABELS = {
  catalyst: 'Catalyst',
  decision: 'Decision',
  critical: 'Critical',
  monitor:  'Monitor',
}

export default function CalendarView({ convictionResults = {}, prices = {} }) {
  const { t } = useLang()
  const { isMobile } = useBreakpoint()
  const [events,        setEvents]        = useState(() => loadEarnings() ?? EARNINGS)
  const [editorOpen,    setEditorOpen]    = useState(false)
  const [earningsDates, setEarningsDates] = useState({})
  const userPositions = loadOverrides() ?? []

  // Direct fetch earnings dates — independent of conviction engine
  // Works from 90d KV cache, no extra writes needed
  useEffect(() => {
    if (!userPositions.length) return
    let done = false
    ;(async () => {
      const acc = {}
      for (const pos of userPositions) {
        try {
          const res = await workerAPI.fundamentals(pos.ticker)
          if (res?.data?.nextEarningsDate) {
            acc[pos.ticker] = { date: res.data.nextEarningsDate, source: res.data.earningsDateSource ?? 'yahoo' }
          }
        } catch { /* skip */ }
        if (done) return
      }
      setEarningsDates(acc)
    })()
    return () => { done = true }
  }, [userPositions.length]) // eslint-disable-line

  // Compute days until each event
  const now = new Date()

  // Auto-generate earnings events from:
  // 1. conviction results (if available)
  // 2. direct fundamentals fetch (earningsDates state)
  const autoEvents = userPositions
    .map(pos => {
      const cv = convictionResults[pos.ticker]
      const dateFromCV     = cv?.nextEarningsDate
      const dateFromDirect = earningsDates[pos.ticker]?.date
      const date   = dateFromCV ?? dateFromDirect
      const source = dateFromCV ? (cv.earningsDateSource ?? 'auto') : (earningsDates[pos.ticker]?.source ?? 'auto')
      if (!date) return null
      return {
        ticker: pos.ticker,
        date,
        type:  'monitor',
        note:  `Next earnings · Source: ${source}`,
        _auto: true,
      }
    })
    .filter(Boolean)

  // Merge: manual events take priority over auto (dedup by ticker)
  const manualTickers = new Set(events.map(e => e.ticker))
  const mergedEvents  = [
    ...events,
    ...autoEvents.filter(e => !manualTickers.has(e.ticker)),
  ]

  const withDays = mergedEvents
    .map(ev => {
      const date = new Date(ev.date)
      const days = Math.ceil((date - now) / 86400000)
      const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      const day   = date.getDate()
      return { ...ev, days, month, day }
    })
    .filter(ev => ev.days >= 0 && ev.days <= 180)
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
            No upcoming earnings in the next 180 days.
            <div style={{ fontSize:11, marginTop:6, opacity:0.7 }}>Click ⚙ Manage to add events manually, or run Scanner on your positions to fetch dates automatically.</div>
          </div>
        )}
        {withDays.map(event => {
          const pos = userPositions.find(p => p.ticker === event.ticker)
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
                  {event.days}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--txt-muted)' }}>{t.calendarDaysAway}</div>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 700, color: 'var(--txt)' }}>
                    {event.ticker}
                  </span>
                  <Badge label={TYPE_LABELS[event.type]} type={event.type} />
                  {event._auto && (
                    <span style={{ fontSize:8, color:'var(--txt-muted)', fontStyle:'italic',
                      padding:'1px 5px', border:'1px solid var(--border)', borderRadius:3 }}>
                      auto · Yahoo
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--txt-muted)' }}>
                    {event.date}
                  </span>
                  {cv?.nextEarningsDate && cv.nextEarningsDate !== event.date && (
                    <span style={{ fontSize:9, color:'var(--txt-muted)', fontStyle:'italic' }}>
                      · Yahoo: {cv.nextEarningsDate} ({cv.earningsDateSource})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--txt-sec)', lineHeight: 1.5 }}>
                  {event.note}
                </div>
              </div>

              {/* Position stats */}
              {pos && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {(() => {
                    const upside = cv?.wallStreet?.upside ?? pos?.upside
                    return upside && upside > 0 ? (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 8 }}>
                        +{upside.toFixed(1)}% analyst upside
                      </div>
                    ) : null
                  })()}
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
