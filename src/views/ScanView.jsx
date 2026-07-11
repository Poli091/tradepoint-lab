/**
 * MODULE: VIEWS / ScanView.jsx
 * Ticker Scanner — run the conviction engine on any ticker,
 * whether or not it's in your portfolio.
 *
 * Use for:
 *  · Validación sectorial (utilities, semiconductors, etc.)
 *  · Research before adding a ticker to the watchlist
 *  · Building the D1 database with 50-100 companies
 *
 * Results are auto-saved to D1 via useConviction.
 */

import { useState, useRef, useEffect } from 'react'
import { getUserId } from '../auth/webauthn.js'
import { Search, X, Clock, ChevronRight, Trash2 } from 'lucide-react'
import TickerDetailPanel from '../components/widgets/TickerDetailPanel.jsx'
import { SECTORS }        from '../data/tickerUniverse.js'
import { getGrade }       from '../conviction/grade/index.js'


/* ── Persistent scan history ─────────────────────────── */
function getScanKey() {
  const uid = getUserId()
  return uid ? `tp_${uid}_scan_history` : 'tp_scan_history'
}
function loadScanHistory() {
  try { return JSON.parse(localStorage.getItem(getScanKey()) ?? '[]') } catch { return [] }
}
function saveScanHistory(items) {
  try { localStorage.setItem(getScanKey(), JSON.stringify(items)) } catch {}
}

/* ── Quick-access sector groups ──────────────────────────── */
const SECTOR_GROUPS = [
  // ── Already scanned ──────────────────────────────────────
  { label: 'Utilities',       color: 'var(--amber)',  tickers: ['VST','CEG','NEE','DUK','SO','NRG','PCG','ETR'] },
  { label: 'Semiconductors',  color: 'var(--accent)', tickers: ['NVDA','AVGO','AMD','TSM','MU','ARM','QCOM','INTC'] },
  { label: 'Software / SaaS', color: 'var(--purple)', tickers: ['NOW','CRM','TEAM','VEEV','SNOW','DDOG','MSFT','ADBE'] },
  { label: 'Fintech',         color: 'var(--green)',  tickers: ['MELI','V','MA','FICO','PYPL','SQ','SOFI','NU'] },
  { label: 'MedTech',         color: '#F472B6',       tickers: ['PODD','ISRG','BSX','DXCM','EW','MDT','SYK','VRTX'] },
  { label: 'Defense',         color: '#94A3B8',       tickers: ['AXON','LMT','NOC','RTX','GD','GE'] },
  // ── Pending ───────────────────────────────────────────────
  { label: 'Industrials',     color: '#FB923C',       tickers: ['CAT','HON','DE','ETN','PH','EMR','ITW','MMM','CARR','TT'] },
  { label: 'Financials',      color: '#60A5FA',       tickers: ['JPM','BAC','GS','MS','BLK','SCHW','SPGI','MCO','CB','AXP'] },
  { label: 'Consumer Disc.',  color: '#A78BFA',       tickers: ['AMZN','TSLA','HD','BKNG','MCD','NKE','LOW','SBUX','TJX','LULU'] },
  { label: 'Comm. Services',  color: '#F87171',       tickers: ['META','GOOGL','GOOG','NFLX','DIS','T','VZ','CHTR','SPOT','PINS'] },
  { label: 'Consumer Staples',color: '#86EFAC',       tickers: ['WMT','COST','PG','KO','PEP','PM','MO','CL','MDLZ','EL'] },
  { label: 'Real Estate',     color: '#FCD34D',       tickers: ['AMT','PLD','EQIX','CCI','PSA','WELL','SPG','DLR','O','CSGP'] },
  { label: 'Energy',          color: '#34D399',       tickers: ['XOM','CVX','COP','EOG','SLB','MPC','VLO','PSX','HAL','OXY'] },
  { label: 'Materials',       color: '#CBD5E1',       tickers: ['LIN','APD','SHW','FCX','NEM','NUE','ALB','DD','PPG','VMC'] },
  { label: 'AI / Data',       color: '#818CF8',       tickers: ['PLTR','APP','TTD','CRWD','PANW','ZS','NET','PATH','AI','GTLB'] },
  { label: 'Health Care',     color: '#FB7185',       tickers: ['LLY','UNH','ABBV','MRK','AMGN','GILD','REGN','ABT','SYK','ISRG'] },
  { label: 'Semis — Equip.',  color: '#7DD3FC',       tickers: ['AMAT','LRCX','KLAC','MRVL','TXN','MCHP','ON','MPWR','SWKS','WOLF'] },
  { label: 'Software — Ent.', color: '#C4B5FD',       tickers: ['ORCL','INTU','WDAY','SAP','HUBS','BILL','MDB','ESTC','CFLT','TYL'] },
  { label: 'Consumer Tech',   color: '#6EE7B7',       tickers: ['AAPL','SHOP','UBER','SE','BABA','GRAB','MELI','DASH','ABNB','LYFT'] },
  { label: 'Banks — Large',   color: '#93C5FD',       tickers: ['JPM','BAC','WFC','C','USB','TFC','RF','FITB','CFG','KEY'] },
]

/* ── Single scan result badge ─────────────────────────────── */
function ScanBadge({ ticker, score, grade, onClick, active }) {
  const gradeInfo = getGrade(score ?? 0)
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'8px 12px', borderRadius:'var(--radius)', cursor:'pointer', width:'100%',
      border:`1px solid ${active ? gradeInfo.color : 'var(--border)'}`,
      background: active ? `${gradeInfo.color}18` : 'var(--surface-up)',
      transition:'all 0.13s',
      marginBottom:4,
    }}>
      <span style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color: active ? gradeInfo.color : 'var(--txt)' }}>
        {ticker}
      </span>
      {score != null && (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: gradeInfo.color }}>{score}</span>
          <span style={{ fontSize:10, color: gradeInfo.color, background:`${gradeInfo.color}18`, padding:'1px 6px', borderRadius:4 }}>
            {grade}
          </span>
        </div>
      )}
      {score == null && <ChevronRight size={12} color="var(--txt-muted)" />}
    </button>
  )
}

/* ── Main view ─────────────────────────────────────────────── */
export default function ScanView() {
  const [inputValue,   setInputValue]   = useState('')
  const [activeTicker, setActiveTicker] = useState(null)
  const [scanHistory,  setScanHistory]  = useState(loadScanHistory)
  const inputRef = useRef(null)

  const handleScan = (ticker) => {
    const t = (ticker || inputValue).trim().toUpperCase()
    if (!t || t.length < 1 || t.length > 6) return
    setActiveTicker(t)
    setInputValue(t)
    // Add to history if not already there
    setScanHistory(prev => {
      const existing = prev.find(h => h.ticker === t)
      const next = existing
        ? [existing, ...prev.filter(h => h.ticker !== t)]
        : [{ ticker: t, score: null, grade: null }, ...prev].slice(0, 20)
      saveScanHistory(next)
      return next
    })
  }

  const updateHistory = (ticker, score, grade) => {
    setScanHistory(prev => {
      const next = prev.map(h => h.ticker === ticker ? { ...h, score, grade } : h)
      saveScanHistory(next)
      return next
    })
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* ── LEFT PANEL: search + history + sectors ── */}
      <div style={{
        width: 280, flexShrink:0,
        borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column',
        overflow:'hidden',
        background:'var(--surface)',
      }}>
        {/* Search input */}
        <div style={{ padding:'14px 14px 10px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', marginBottom:10 }}>
            Ticker Scanner
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <div style={{ flex:1, position:'relative' }}>
              <Search size={13} color="var(--txt-muted)"
                style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
              <input
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleScan()}
                placeholder="NEE, DUK, SO…"
                maxLength={6}
                autoFocus
                style={{
                  width:'100%', padding:'8px 8px 8px 30px', boxSizing:'border-box',
                  background:'var(--surface-up)', border:'1px solid var(--border)',
                  borderRadius:'var(--radius)', fontFamily:'var(--mono)', fontSize:13,
                  fontWeight:700, color:'var(--txt)', letterSpacing:'0.04em',
                }}
              />
            </div>
            <button onClick={() => handleScan()} style={{
              padding:'0 14px', borderRadius:'var(--radius)', border:'none', cursor:'pointer',
              background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:600,
              fontFamily:'var(--sans)', whiteSpace:'nowrap',
            }}>Scan</button>
          </div>
          <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:6 }}>
            Any US ticker · auto-saves to D1
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:'auto', padding:'0 14px 14px' }}>

          {/* Recent scans */}
          {scanHistory.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, marginTop:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Clock size={11} color="var(--txt-muted)" />
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                    Recent scans
                  </span>
                </div>
                <button onClick={() => { setScanHistory([]); saveScanHistory([]) }}
                  title="Clear list"
                  style={{ display:'flex', alignItems:'center', gap:4, fontSize:9,
                    color:'var(--txt-muted)', background:'transparent', border:'none',
                    cursor:'pointer', padding:'2px 6px', borderRadius:'var(--radius)' }}>
                  <Trash2 size={10} /> Clear
                </button>
              </div>
              {scanHistory.map(h => (
                <div key={h.ticker} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ flex:1 }}>
                    <ScanBadge ticker={h.ticker} score={h.score} grade={h.grade}
                      active={activeTicker === h.ticker}
                      onClick={() => handleScan(h.ticker)} />
                  </div>
                  <button onClick={e => {
                    e.stopPropagation()
                    setScanHistory(prev => {
                      const next = prev.filter(i => i.ticker !== h.ticker)
                      saveScanHistory(next)
                      return next
                    })
                    if (activeTicker === h.ticker) setActiveTicker(null)
                  }}
                    style={{ flexShrink:0, width:18, height:18, borderRadius:4,
                      border:'none', background:'transparent', cursor:'pointer',
                      color:'var(--txt-muted)', display:'flex', alignItems:'center',
                      justifyContent:'center', opacity:0.6 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Sector quick-access */}
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:10, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
              Sector validation
            </div>
            {SECTOR_GROUPS.map(({ label, color, tickers }) => (
              <div key={label} style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color, marginBottom:5 }}>{label}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {tickers.map(t => {
                    const h = scanHistory.find(s => s.ticker === t)
                    const gradeInfo = h?.score != null ? getGrade(h.score) : null
                    return (
                      <button key={t} onClick={() => handleScan(t)} style={{
                        padding:'3px 8px', borderRadius:5, cursor:'pointer',
                        border:`1px solid ${activeTicker === t ? color : gradeInfo ? gradeInfo.color+'66' : 'var(--border)'}`,
                        background: activeTicker === t ? `${color}22` : gradeInfo ? `${gradeInfo.color}11` : 'transparent',
                        fontFamily:'var(--mono)', fontSize:11, fontWeight:600,
                        color: activeTicker === t ? color : gradeInfo ? gradeInfo.color : 'var(--txt-sec)',
                        transition:'all 0.11s',
                      }}>
                        {t}{h?.score != null ? ` ${h.score}` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: conviction results ── */}
      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)' }}>
        {activeTicker ? (
          <ScanResult
            ticker={activeTicker}
            onResult={(score, grade) => updateHistory(activeTicker, score, grade)}
          />
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--txt-muted)', gap:12 }}>
            <Search size={40} color="var(--border)" />
            <div style={{ fontSize:14, color:'var(--txt-muted)' }}>
              Type a ticker and press Scan
            </div>
            <div style={{ fontSize:12, color:'var(--txt-muted)' }}>
              Or click any ticker in the sector groups →
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Scan result — TickerDetailPanel handles the engine internally ── */
function ScanResult({ ticker, onResult }) {
  // No duplicate useConviction here — TickerDetailPanel runs it once
  // and calls onResult when done via the onResult prop
  return (
    <TickerDetailPanel
      ticker={ticker}
      prices={{}}
      embedded={true}
      onClose={() => {}}
      onResult={onResult}
    />
  )
}
