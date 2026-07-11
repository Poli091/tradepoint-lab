/**
 * MODULE: LAYOUT / Header.jsx
 * Shows real portfolio value, day P&L, live data indicator,
 * and a global ticker search that opens TickerDetailPanel
 * for ANY ticker without adding it to watchlist or positions.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { Eye, EyeOff, Search, X }               from 'lucide-react'
import { useLang }                               from '../../context/LanguageContext.jsx'
import { useBreakpoint }                         from '../../hooks/useBreakpoint.js'
import { fUSD, fPct, fSignedUSD }               from '../../utils/format.js'
import { DAY_CHANGES }                           from '../../utils/finance.js'
import { UNIVERSE }                              from '../../data/tickerUniverse.js'
import { workerAPI, getWorkerUrl }               from '../../utils/api/worker.js'

/* ── NYSE Market Status ───────────────────────────────────── */
function useMarketStatus() {
  const [status, setStatus] = useState({ open: false, label: 'Checking…', color: 'var(--txt-muted)' })

  useEffect(() => {
    const HOLIDAYS_2025 = ['2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25']
    const HOLIDAYS_2026 = ['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25']
    const ALL_HOLIDAYS  = new Set([...HOLIDAYS_2025, ...HOLIDAYS_2026])

    function check() {
      const now = new Date()
      const etOffset = (() => {
        const march2nd = new Date(now.getFullYear(), 2, 1)
        march2nd.setDate(1 + (7 - march2nd.getDay()) % 7 + 7)
        const nov1st = new Date(now.getFullYear(), 10, 1)
        nov1st.setDate(1 + (7 - nov1st.getDay()) % 7)
        return now >= march2nd && now < nov1st ? -240 : -300
      })()
      const utcMs  = now.getTime() + now.getTimezoneOffset() * 60000
      const et     = new Date(utcMs + etOffset * 60000)
      const ymd    = `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`
      const dow    = et.getDay()
      const hhmm   = et.getHours() * 100 + et.getMinutes()

      if (dow === 0 || dow === 6)       { setStatus({ open:false, label:'closed', color:'var(--txt-muted)', reason:'weekend' }); return }
      if (ALL_HOLIDAYS.has(ymd))        { setStatus({ open:false, label:'closed', color:'var(--txt-muted)', reason:'holiday' }); return }
      if (hhmm < 930)                   { setStatus({ open:false, label:'pre',    color:'var(--amber)',    reason:'pre'     }); return }
      if (hhmm >= 1600)                 { setStatus({ open:false, label:'after',  color:'var(--amber)',    reason:'after'   }); return }
      setStatus({ open:true, label:'open', color:'var(--green)', reason:'open' })
    }

    check()
    const interval = setInterval(check, 60000)
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
    const pct = p.dayChangePct != null ? p.dayChangePct / 100 : (DAY_CHANGES[p.ticker] ?? 0)
    return s + p.currentPrice * p.qty * pct
  }, 0)
}

/* ── Ticker Search ────────────────────────────────────────── */
function TickerSearch({ onSelect }) {
  const [query,      setQuery]      = useState('')
  const [open,       setOpen]       = useState(false)
  const [focused,    setFocused]    = useState(false)
  const [fhResults,  setFhResults]  = useState([])
  const [fhLoading,  setFhLoading]  = useState(false)
  const wrapRef   = useRef(null)
  const inputRef  = useRef(null)
  const fhTimer   = useRef(null)

  // Layer 1: local UNIVERSE (instant)
  const localResults = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    return UNIVERSE
      .filter(t => t.ticker.includes(q) || t.name.toUpperCase().includes(q))
      .sort((a, b) => {
        const aExact = a.ticker === q, bExact = b.ticker === q
        if (aExact !== bExact) return aExact ? -1 : 1
        const aStart = a.ticker.startsWith(q), bStart = b.ticker.startsWith(q)
        if (aStart !== bStart) return aStart ? -1 : 1
        return a.ticker.localeCompare(b.ticker)
      })
      .slice(0, 6)
  }, [query])

  // Layer 2: Finnhub search (debounced fallback for tickers not in UNIVERSE)
  useEffect(() => {
    clearTimeout(fhTimer.current)
    const q = query.trim()
    if (!q || localResults.length >= 5 || !getWorkerUrl()) { setFhResults([]); return }
    fhTimer.current = setTimeout(async () => {
      setFhLoading(true)
      try {
        const r = await workerAPI.searchSymbols(q)
        const localTickers = new Set(localResults.map(l => l.ticker))
        const extra = (r?.results ?? [])
          .filter(x => !localTickers.has(x.ticker))
          .slice(0, 4)
        setFhResults(extra)
      } catch { setFhResults([]) }
      finally { setFhLoading(false) }
    }, 450)
    return () => clearTimeout(fhTimer.current)
  }, [query, localResults.length])

  const allResults = [
    ...localResults,
    ...fhResults.map(r => ({ ...r, sector: r.type ?? 'Search', industry: r.exchange ?? '' })),
  ].slice(0, 8)

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (ticker) => {
    onSelect(ticker)
    setQuery('')
    setOpen(false)
    setFhResults([])
    inputRef.current?.blur()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); setFhResults([]); inputRef.current?.blur() }
    if (e.key === 'Enter' && allResults.length > 0) handleSelect(allResults[0].ticker)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: focused ? 'var(--surface-hov)' : 'var(--surface-up)',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8, padding: '4px 10px',
        transition: 'all 0.15s',
        width: focused ? 200 : 140,
      }}>
        <Search size={12} color="var(--txt-muted)" style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setFocused(true); if (query) setOpen(true) }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Search ticker…"
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt)',
            width: '100%', caretColor: 'var(--accent)',
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0, display: 'flex', alignItems: 'center', color: 'var(--txt-muted)',
            flexShrink: 0,
          }}>
            <X size={11} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (allResults.length > 0 || fhLoading) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          width: 280, zIndex: 500,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)',
            fontSize: 9, color: 'var(--txt-muted)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Analyze without adding to watchlist
          </div>
          {fhLoading && localResults.length === 0 && (
            <div style={{ padding:'8px 12px', fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>
              Searching Finnhub…
            </div>
          )}
          {allResults.map((item, i) => (
            <button
              key={item.ticker}
              onMouseDown={e => { e.preventDefault(); handleSelect(item.ticker) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', border: 'none', background: 'transparent',
                cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                borderBottom: i < allResults.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-up)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Ticker */}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                color: 'var(--accent)', width: 48, flexShrink: 0 }}>
                {item.ticker}
              </span>
              {/* Name + sector */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 9, color: 'var(--txt-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.industry ?? item.sector}
                </div>
              </div>
              {/* Type / country badge */}
              <span style={{ fontSize: 8, fontFamily: 'var(--mono)', flexShrink: 0, padding:'1px 5px',
                borderRadius: 3, fontWeight: 700,
                background: item.type === 'ETF' ? 'rgba(251,191,36,0.15)' : item.country === 'AR' ? 'rgba(99,102,241,0.15)' : 'var(--surface-up)',
                color:       item.type === 'ETF' ? '#FCD34D'              : item.country === 'AR' ? '#818CF8'               : 'var(--txt-muted)',
              }}>
                {item.type === 'ETF' ? 'ETF' : item.country === 'AR' ? 'ARG' : item.sectorEtf || item.type || ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main Header ──────────────────────────────────────────── */
export default function Header({
  account, setAccount, visiblePositions, portfolioStats, liveBadge, convictionAvg,
  privacyMode, togglePrivacy, onGlobalSearch,
}) {
  const { isMobile } = useBreakpoint()
  const { t } = useLang()
  const dayChange = getDayChange(visiblePositions)
  const dayPct    = portfolioStats.totalValue > 0 ? (dayChange / portfolioStats.totalValue) * 100 : 0
  const isUp      = dayChange >= 0
  const mkt        = useMarketStatus()
  const [now, setNow] = useState(() => new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }))
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })), 30000)
    return () => clearInterval(timer)
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

      {!isMobile && <div style={{ width:1, height:22, background:'var(--border)', flexShrink:0 }} />}

      {/* Portfolio value */}
      <div style={{ flexShrink:0 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize: isMobile ? 17 : 20,
          fontWeight:700, color:'var(--txt)', lineHeight:1, letterSpacing:'-0.03em' }}>
          <span className="pv">{fUSD(portfolioStats.totalValue)}</span>
        </div>
        <div style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:600,
          color: isUp ? 'var(--green)' : 'var(--red)', marginTop:2 }}>
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
              borderRadius:4, display:'inline-block' }}>
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
          flexShrink: 0, transition: 'all 0.15s',
        }}>
        {privacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>

      <div style={{ flex:1 }} />

      {/* Global ticker search */}
      {!isMobile && <TickerSearch onSelect={onGlobalSearch} />}

      {/* Live data badge */}
      {liveBadge && <div style={{ flexShrink:0 }}>{liveBadge}</div>}

      {/* Market status + time */}
      {!isMobile && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
            <span style={{ width:7, height:7, borderRadius:'50%',
              background: mkt.color, display:'inline-block',
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
