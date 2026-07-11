/**
 * MODULE: LAYOUT / Header.jsx
 * Shows real portfolio value, day P&L, and live data indicator.
 */

import { useState, useEffect }          from 'react'
import { Eye, EyeOff }                   from 'lucide-react'
import { useLang }                       from '../../context/LanguageContext.jsx'
import { useBreakpoint }                from '../../hooks/useBreakpoint.js'
import { fUSD, fPct, fSignedUSD }       from '../../utils/format.js'
import { DAY_CHANGES }                   from '../../utils/finance.js'

/* ── NYSE Market Status ─────────────────────────────────────
   Checks ET time + day of week + federal holidays.
   Source: NYSE schedule — Mon-Fri 9:30-16:00 ET excl. holidays
══════════════════════════════════════════════════════════ */
function useMarketStatus() {
  const [status, setStatus] = useState({ open: false, label: 'Checking…', color: 'var(--txt-muted)' })

  useEffect(() => {
    // NYSE federal holidays (observed dates) — update annually
    const HOLIDAYS_2025 = ['2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25']
    const HOLIDAYS_2026 = ['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25']
    const ALL_HOLIDAYS  = new Set([...HOLIDAYS_2025, ...HOLIDAYS_2026])

    function check() {
      const now = new Date()
      // Convert to ET (UTC-5 standard / UTC-4 daylight)
      const etOffset = (() => {
        const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset()
        const jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset()
        const dstOffset = Math.min(jan, jul)
        // Simple DST: second Sunday March to first Sunday November
        const march2nd = new Date(now.getFullYear(), 2, 1)
        march2nd.setDate(1 + (7 - march2nd.getDay()) % 7 + 7)
        const nov1st = new Date(now.getFullYear(), 10, 1)
        nov1st.setDate(1 + (7 - nov1st.getDay()) % 7)
        return now >= march2nd && now < nov1st ? -240 : -300
      })()

      const utcMs  = now.getTime() + now.getTimezoneOffset() * 60000
      const et     = new Date(utcMs + etOffset * 60000)
      const ymd    = `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`
      const dow    = et.getDay()  // 0=Sun, 6=Sat
      const hhmm   = et.getHours() * 100 + et.getMinutes()

      if (dow === 0 || dow === 6) {
        setStatus({ open:false, label:'closed', color:'var(--txt-muted)', reason:'weekend' })
        return
      }
      if (ALL_HOLIDAYS.has(ymd)) {
        setStatus({ open:false, label:'closed', color:'var(--txt-muted)', reason:'holiday' })
        return
      }
      if (hhmm < 930) {
        setStatus({ open:false, label:'pre', color:'var(--amber)', reason:'pre' })
        return
      }
      if (hhmm >= 1600) {
        setStatus({ open:false, label:'after', color:'var(--amber)', reason:'after' })
        return
      }
      setStatus({ open:true, label:'open', color:'var(--green)', reason:'open' })
    }

    check()
    const interval = setInterval(check, 60000)  // recheck every minute
    return () => clearInterval(interval)
  }, [])

  return status
}

const ACCOUNTS = [
  { id:'roth',      label:'Roth IRA',  short:'Roth'  },
  { id:'brokerage', label:'Brokerage', short:'Brok.' },
  { id:'combined',  label:'Combined',  short:'All'   },
]

function getDayChange(positions) {
  return positions.reduce((s, p) => {
    // Use real dayChangePct if available, else fall back to mock
    const pct = p.dayChangePct != null ? p.dayChangePct / 100 : (DAY_CHANGES[p.ticker] ?? 0)
    return s + p.currentPrice * p.qty * pct
  }, 0)
}

export default function Header({ account, setAccount, visiblePositions, portfolioStats, liveBadge, convictionAvg, privacyMode, togglePrivacy }) {
  const { isMobile } = useBreakpoint()
  const { t } = useLang()
  const dayChange = getDayChange(visiblePositions)
  const dayPct    = portfolioStats.totalValue > 0 ? (dayChange / portfolioStats.totalValue) * 100 : 0
  const isUp      = dayChange >= 0
  const mkt        = useMarketStatus()
  const [now, setNow] = useState(() => new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }))
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })), 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <header style={{
      height: isMobile ? 52 : 'var(--header-h)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: isMobile ? '0 12px' : '0 20px',
      gap: isMobile ? 8 : 14,
      flexShrink: 0, overflowX: 'auto',
    }}>
      {/* Account pills */}
      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
        {ACCOUNTS.map(({ id, label, short }) => {
          const active = account === id
          return (
            <button key={id} onClick={() => setAccount(id)} style={{
              padding: isMobile ? '3px 8px' : '4px 12px',
              borderRadius: 99, border: 'none', cursor: 'pointer',
              fontSize: isMobile ? 11 : 12,
              fontFamily: 'var(--sans)', fontWeight: 600,
              background: active ? 'var(--accent)' : 'var(--surface-up)',
              color:      active ? '#fff'           : 'var(--txt-sec)',
              transition: 'all 0.13s', whiteSpace: 'nowrap',
            }}>{isMobile ? short : label}</button>
          )
        })}
      </div>

      {/* Divider */}
      {!isMobile && <div style={{ width:1, height:22, background:'var(--border)', flexShrink:0 }} />}

      {/* Portfolio value */}
      <div style={{ flexShrink:0 }}>
        <div style={{
          fontFamily:'var(--mono)', fontSize: isMobile ? 17 : 20,
          fontWeight:700, color:'var(--txt)', lineHeight:1, letterSpacing:'-0.03em',
        }}>
          <span className="pv">{fUSD(portfolioStats.totalValue)}</span>
        </div>
        <div style={{
          fontFamily:'var(--mono)', fontSize:11, fontWeight:600,
          color: isUp ? 'var(--green)' : 'var(--red)', marginTop:2,
        }}>
          <span className="pv">{isUp ? '+' : '-'}{fUSD(Math.abs(dayChange))} ({isUp ? '+' : '-'}{fPct(Math.abs(dayPct))}) today</span>
        </div>
      </div>

      {/* All-time P&L */}
      {!isMobile && (
        <>
        <div style={{
          background: portfolioStats.totalGain >= 0 ? 'var(--green-dim)' : 'var(--red-dim)',
          borderRadius:6, padding:'4px 10px',
          fontFamily:'var(--mono)', fontSize:12, fontWeight:600,
          color: portfolioStats.totalGain >= 0 ? 'var(--green)' : 'var(--red)',
          whiteSpace:'nowrap',
        }}>
          <span className="pv">{fSignedUSD(portfolioStats.totalGain)} all-time</span>
        </div>
        {convictionAvg && (
          <div style={{ fontSize:10, fontFamily:'var(--mono)',
            color: convictionAvg.color, fontWeight:700,
            background: `${convictionAvg.color}18`, padding:'2px 8px',
            borderRadius:4, marginTop:2, display:'inline-block' }}>
            ⚡ {convictionAvg.score}/100 {convictionAvg.label}
          </div>
        )}
        </>
      )}


      {/* Privacy toggle */}
      <button
        onClick={togglePrivacy}
        title={privacyMode ? 'Show values' : 'Hide values'}
        style={{
          background: privacyMode ? 'var(--accent-dim)' : 'var(--surface-up)',
          border: `1px solid ${privacyMode ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 6, cursor: 'pointer', padding: '4px 7px',
          display: 'flex', alignItems: 'center',
          color: privacyMode ? 'var(--accent)' : 'var(--txt-muted)',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}>
        {privacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>

      <div style={{ flex:1 }} />

      {/* Live data badge */}
      {liveBadge && (
        <div style={{ flexShrink:0 }}>{liveBadge}</div>
      )}

      {/* Market status + time */}
      {!isMobile && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
            <span style={{ width:7, height:7, borderRadius:'50%',
              background: mkt.color,
              display:'inline-block',
              boxShadow: mkt.open ? `0 0 6px ${mkt.color}` : 'none'
            }} />
            <span style={{ fontSize:12, color:'var(--txt-sec)', fontWeight:500 }}>
              {mkt.reason === 'open' ? t.marketOpen
               : mkt.reason === 'pre' ? t.marketPremarket
               : mkt.reason === 'after' ? t.marketAfterHours
               : t.marketClosed}
            </span>
          </div>
          <div style={{
            background:'var(--surface-up)', borderRadius:6, padding:'4px 10px',
            fontFamily:'var(--mono)', fontSize:12, color:'var(--txt-muted)', flexShrink:0,
          }}>
            {now} ET
          </div>
        </>
      )}
    </header>
  )
}
