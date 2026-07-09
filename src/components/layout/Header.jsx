/**
 * MODULE: LAYOUT / Header.jsx
 * Shows real portfolio value, day P&L, and live data indicator.
 */

import { useBreakpoint }                from '../../hooks/useBreakpoint.js'
import { fUSD, fPct, fSignedUSD }       from '../../utils/format.js'

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

export default function Header({ account, setAccount, visiblePositions, portfolioStats, liveBadge, convictionAvg }) {
  const { isMobile } = useBreakpoint()
  const dayChange = getDayChange(visiblePositions)
  const dayPct    = portfolioStats.totalValue > 0 ? (dayChange / portfolioStats.totalValue) * 100 : 0
  const isUp      = dayChange >= 0
  const now       = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })

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
          {fUSD(portfolioStats.totalValue)}
        </div>
        <div style={{
          fontFamily:'var(--mono)', fontSize:11, fontWeight:600,
          color: isUp ? 'var(--green)' : 'var(--red)', marginTop:2,
        }}>
          {isUp ? '+' : '-'}{fUSD(Math.abs(dayChange))} ({isUp ? '+' : '-'}{fPct(Math.abs(dayPct))}) today
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
          {fSignedUSD(portfolioStats.totalGain)} all-time
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


      <div style={{ flex:1 }} />

      {/* Live data badge */}
      {liveBadge && (
        <div style={{ flexShrink:0 }}>{liveBadge}</div>
      )}

      {/* Market status + time */}
      {!isMobile && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', display:'inline-block', boxShadow:'0 0 6px var(--green)' }} />
            <span style={{ fontSize:12, color:'var(--txt-sec)', fontWeight:500 }}>Market open</span>
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
