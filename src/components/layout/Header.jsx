/**
 * MODULE: LAYOUT / Header.jsx
 * Desktop: full header with account pills, value, day P&L, market status, time
 * Mobile:  compact — just account pills + portfolio value
 */

import { useBreakpoint } from '../../hooks/useBreakpoint.js'
import { fUSD, fPct, fSignedUSD } from '../../utils/format.js'
import { DAY_CHANGES } from '../../utils/finance.js'

const ACCOUNTS = [
  { id: 'roth',      label: 'Roth IRA'  },
  { id: 'brokerage', label: 'Brokerage' },
  { id: 'combined',  label: 'Combined'  },
]

function getDayChange(positions) {
  return positions.reduce((s, p) => s + p.currentPrice * p.qty * (DAY_CHANGES[p.ticker] ?? 0), 0)
}

export default function Header({ account, setAccount, visiblePositions, portfolioStats }) {
  const { isMobile } = useBreakpoint()
  const dayChange = getDayChange(visiblePositions)
  const dayPct    = portfolioStats.totalValue > 0 ? (dayChange / portfolioStats.totalValue) * 100 : 0
  const isUp      = dayChange >= 0
  const now       = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <header style={{
      height: isMobile ? 52 : 'var(--header-h)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: isMobile ? '0 12px' : '0 20px',
      gap: isMobile ? 8 : 14,
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {/* Account pills */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {ACCOUNTS.map(({ id, label }) => {
          const active = account === id
          const shortLabel = isMobile
            ? (id === 'roth' ? 'Roth' : id === 'brokerage' ? 'Brok.' : 'All')
            : label
          return (
            <button key={id} onClick={() => setAccount(id)} style={{
              padding: isMobile ? '3px 8px' : '4px 12px',
              borderRadius: 99, border: 'none', cursor: 'pointer',
              fontSize: isMobile ? 11 : 12,
              fontFamily: 'var(--sans)', fontWeight: 600,
              background: active ? 'var(--accent)' : 'var(--surface-up)',
              color:      active ? '#fff'           : 'var(--txt-sec)',
              transition: 'all 0.13s', whiteSpace: 'nowrap',
            }}>{shortLabel}</button>
          )
        })}
      </div>

      {/* Divider */}
      {!isMobile && <div style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />}

      {/* Portfolio value */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: isMobile ? 17 : 20,
          fontWeight: 700, color: 'var(--txt)',
          lineHeight: 1, letterSpacing: '-0.03em',
        }}>
          {fUSD(portfolioStats.totalValue)}
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
          color: isUp ? 'var(--green)' : 'var(--red)', marginTop: 2,
        }}>
          {isUp ? '▲' : '▼'} {fUSD(Math.abs(dayChange))} ({fPct(Math.abs(dayPct))})
        </div>
      </div>

      {/* All-time P&L pill — hidden on mobile */}
      {!isMobile && (
        <div style={{
          background: portfolioStats.totalGain >= 0 ? 'var(--green-dim)' : 'var(--red-dim)',
          borderRadius: 6, padding: '4px 10px',
          fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
          color: portfolioStats.totalGain >= 0 ? 'var(--green)' : 'var(--red)',
          whiteSpace: 'nowrap',
        }}>
          {fSignedUSD(portfolioStats.totalGain)} all-time
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Market status + time — hidden on mobile */}
      {!isMobile && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', boxShadow: '0 0 6px var(--green)' }} />
            <span style={{ fontSize: 12, color: 'var(--txt-sec)', fontWeight: 500 }}>Market open</span>
          </div>
          <div style={{
            background: 'var(--surface-up)', borderRadius: 6, padding: '4px 10px',
            fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--txt-muted)', flexShrink: 0,
          }}>
            {now} ET
          </div>
        </>
      )}
    </header>
  )
}
