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

import { useState, useRef, useEffect, useMemo } from 'react'
import { useBreakpoint } from '../hooks/useBreakpoint.js'
import { getUserId } from '../auth/webauthn.js'
import { getWorkerUrl } from '../utils/api/worker.js'
import { Search, X, Clock, ChevronRight, Trash2 } from 'lucide-react'
import TickerDetailPanel from '../components/widgets/TickerDetailPanel.jsx'
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
  // ── Comm. Services ──
  { label: 'Comm. Services', color: '#F97316', tickers: ['CHTR', 'CMCSA', 'DIS', 'EA', 'ECHO', 'FOX', 'FOXA', 'GOOG', 'GOOGL', 'LYV', 'META', 'NFLX', 'NWS', 'NWSA', 'OMC', 'PSKY', 'T', 'TKO', 'TMUS', 'TTWO', 'VZ', 'WBD'] },
  // ── Consumer Discretionary ──
  { label: 'Consumer Disc.', color: '#F59E0B', tickers: ['ABNB', 'APTV', 'AZO', 'BBY', 'BKNG', 'CCL', 'CMG', 'CVNA', 'DECK', 'DG', 'DLTR', 'DPZ', 'DRI', 'F', 'GM', 'GPC', 'HAS', 'HD', 'HLT', 'LOW', 'LULU', 'LVS', 'MAR', 'MCD', 'MGM', 'NCLH', 'NKE', 'ORLY', 'RCL', 'RL', 'ROST', 'SBUX', 'TGT', 'TJX', 'TPR', 'TSCO', 'TSLA', 'ULTA', 'WSM', 'WYNN', 'YUM'] },
  { label: 'Consumer Tech', color: '#F59E0B', tickers: ['AMZN', 'DASH', 'EBAY', 'EXPE', 'UBER'] },
  { label: 'Homebuilders', color: '#F59E0B', tickers: ['BLDR', 'DHI', 'LEN', 'NVR', 'PHM'] },
  // ── Consumer Staples ──
  { label: 'Consumer Staples', color: '#6B7280', tickers: ['ADM', 'BF.B', 'BG', 'CASY', 'CHD', 'CL', 'CLX', 'COST', 'EL', 'GIS', 'HRL', 'HSY', 'KDP', 'KHC', 'KMB', 'KO', 'KR', 'KVUE', 'MDLZ', 'MKC', 'MNST', 'MO', 'PEP', 'PG', 'PM', 'SJM', 'STZ', 'SYY', 'TAP', 'TSN', 'WMT'] },
  // ── Defense ──
  { label: 'Defense', color: '#64748B', tickers: ['GD', 'HII', 'LHX', 'LMT', 'NOC', 'RTX'] },
  { label: 'Defense Tech', color: '#64748B', tickers: ['AXON'] },
  // ── Energy ──
  { label: 'Energy', color: '#EF4444', tickers: ['APA', 'BKR', 'COP', 'CVX', 'DVN', 'EOG', 'EQT', 'EXE', 'FANG', 'HAL', 'KMI', 'MPC', 'OKE', 'OXY', 'PSX', 'SLB', 'SW', 'TPL', 'TRGP', 'VLO', 'WMB', 'XOM'] },
  // ── Financials ──
  { label: 'Banks - Large', color: '#10B981', tickers: ['BAC', 'C', 'CFG', 'COF', 'FITB', 'GS', 'HBAN', 'JPM', 'KEY', 'MS', 'MTB', 'PNC', 'RF', 'TFC', 'USB', 'WFC'] },
  { label: 'Financials', color: '#10B981', tickers: ['ACGL', 'AFL', 'AIG', 'AIZ', 'AJG', 'ALL', 'AMP', 'AON', 'APO', 'ARES', 'BEN', 'BLK', 'BNY', 'BRK.B', 'BRO', 'BX', 'CB', 'CINF', 'EFX', 'EG', 'ERIE', 'FDS', 'GL', 'HIG', 'IVZ', 'KKR', 'L', 'MCO', 'MET', 'MRSH', 'MSCI', 'NTRS', 'PFG', 'PGR', 'PRU', 'RJF', 'SCHW', 'SPGI', 'STT', 'TROW', 'TRV', 'WRB', 'WTW'] },
  { label: 'Fintech', color: '#10B981', tickers: ['AXP', 'BR', 'CBOE', 'CME', 'COIN', 'CPAY', 'FICO', 'FIS', 'FISV', 'GPN', 'HOOD', 'IBKR', 'ICE', 'JKHY', 'MA', 'NDAQ', 'PYPL', 'SYF', 'V', 'XYZ'] },
  // ── Healthcare ──
  { label: 'Biotech', color: '#8B5CF6', tickers: ['AMGN', 'BIIB', 'GILD', 'INCY', 'MRNA', 'REGN', 'VRTX'] },
  { label: 'Healthcare', color: '#8B5CF6', tickers: ['A', 'ABT', 'BAX', 'CAH', 'CI', 'CNC', 'COR', 'CRL', 'CVS', 'DGX', 'DHR', 'DVA', 'ELV', 'GEHC', 'HCA', 'HSIC', 'HUM', 'IQV', 'LH', 'MCK', 'MTD', 'RVTY', 'SOLV', 'STE', 'TECH', 'TMO', 'UHS', 'UNH', 'WAT', 'ZTS'] },
  { label: 'Medical Devices', color: '#8B5CF6', tickers: ['ALGN', 'BDX', 'BSX', 'COO', 'DXCM', 'EW', 'IDXX', 'ISRG', 'MDT', 'PODD', 'RMD', 'SYK', 'WST', 'ZBH'] },
  { label: 'Pharmaceuticals', color: '#8B5CF6', tickers: ['ABBV', 'BMY', 'JNJ', 'LLY', 'MRK', 'PFE', 'VTRS'] },
  // ── Industrials ──
  { label: 'Airlines', color: '#78716C', tickers: ['DAL', 'LUV', 'UAL'] },
  { label: 'Clean Energy', color: '#78716C', tickers: ['GEV'] },
  { label: 'Industrials', color: '#78716C', tickers: ['ALLE', 'AME', 'AOS', 'BA', 'CARR', 'CAT', 'CHRW', 'CMI', 'CPRT', 'CSX', 'CTAS', 'DE', 'DOV', 'EME', 'EMR', 'ETN', 'EXPD', 'FAST', 'FDX', 'FDXF', 'FIX', 'FTV', 'GE', 'GNRC', 'GWW', 'HON', 'HONA', 'HUBB', 'HWM', 'IEX', 'IR', 'ITW', 'J', 'JBHT', 'JCI', 'LII', 'MAS', 'MMM', 'NDSN', 'NSC', 'ODFL', 'OTIS', 'PCAR', 'PH', 'PNR', 'PWR', 'ROK', 'ROL', 'ROP', 'SNA', 'SWK', 'TDG', 'TT', 'TXT', 'UNP', 'UPS', 'URI', 'VLTO', 'WAB', 'XYL'] },
  { label: 'Waste Management', color: '#78716C', tickers: ['RSG', 'WM'] },
  // ── Materials ──
  { label: 'Materials', color: '#D97706', tickers: ['ALB', 'AMCR', 'APD', 'AVY', 'BALL', 'CF', 'CRH', 'CTVA', 'DD', 'DOW', 'ECL', 'FCX', 'IFF', 'IP', 'LIN', 'LYB', 'MLM', 'MOS', 'NEM', 'NUE', 'PKG', 'PPG', 'SHW', 'STLD', 'VMC'] },
  // ── Real Estate ──
  { label: 'Real Estate', color: '#EC4899', tickers: ['AMT', 'ARE', 'AVB', 'BXP', 'CBRE', 'CCI', 'CPT', 'CSGP', 'DLR', 'DOC', 'EQIX', 'EQR', 'ESS', 'EXR', 'FRT', 'HST', 'INVH', 'IRM', 'KIM', 'MAA', 'O', 'PLD', 'PSA', 'REG', 'SBAC', 'SPG', 'UDR', 'VICI', 'VTR', 'WELL', 'WY'] },
  // ── Technology ──
  { label: 'AI/Data', color: '#3B82F6', tickers: ['APP', 'PLTR', 'TTD'] },
  { label: 'Clean Energy', color: '#3B82F6', tickers: ['FSLR'] },
  { label: 'Cybersecurity', color: '#3B82F6', tickers: ['CRWD', 'FTNT', 'GEN', 'PANW'] },
  { label: 'Data Center Infra', color: '#3B82F6', tickers: ['VRT'] },
  { label: 'Hardware', color: '#3B82F6', tickers: ['AAPL', 'APH', 'COHR', 'DELL', 'FLEX', 'GLW', 'GRMN', 'HPQ', 'JBL', 'KEYS', 'LITE', 'SMCI', 'TDY', 'TEL', 'ZBRA'] },
  { label: 'IT Services', color: '#3B82F6', tickers: ['ACN', 'ADP', 'CDW', 'CTSH', 'HPE', 'IBM', 'IT', 'LDOS', 'PAYX', 'VRSK'] },
  { label: 'Networking', color: '#3B82F6', tickers: ['AKAM', 'ANET', 'CIEN', 'CSCO', 'FFIV', 'MSI', 'VRSN'] },
  { label: 'Semiconductor Equipment', color: '#3B82F6', tickers: ['AMAT', 'KLAC', 'LRCX', 'TER'] },
  { label: 'Semiconductors', color: '#3B82F6', tickers: ['ADI', 'AMD', 'AVGO', 'INTC', 'MCHP', 'MPWR', 'MRVL', 'MU', 'NVDA', 'NXPI', 'ON', 'Q', 'QCOM', 'SNDK', 'SWKS', 'TXN'] },
  { label: 'Software/SaaS', color: '#3B82F6', tickers: ['ADBE', 'ADSK', 'CDNS', 'CRM', 'DDOG', 'GDDY', 'INTU', 'MSFT', 'NOW', 'ORCL', 'PTC', 'SNPS', 'TRMB', 'TYL', 'VEEV', 'WDAY'] },
  { label: 'Storage', color: '#3B82F6', tickers: ['NTAP', 'STX', 'WDC'] },
  // ── Utilities ──
  { label: 'Power Generation/Nuclear', color: '#06B6D4', tickers: ['CEG', 'VST'] },
  { label: 'Utilities', color: '#06B6D4', tickers: ['AEE', 'AEP', 'AES', 'ATO', 'AWK', 'CMS', 'CNP', 'D', 'DTE', 'DUK', 'ED', 'EIX', 'ES', 'ETR', 'EVRG', 'EXC', 'FE', 'LNT', 'NEE', 'NI', 'NRG', 'PCG', 'PEG', 'PNW', 'PPL', 'SO', 'SRE', 'WEC', 'XEL'] },
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
export default function ScanView({ onSelectTicker, convictionResults = {} }) {
  const { isMobile } = useBreakpoint()
  const [inputValue,   setInputValue]   = useState('')
  const [activeTicker, setActiveTicker] = useState(null)
  const [scanHistory,  setScanHistory]  = useState(loadScanHistory)
  const [gradeFilter,  setGradeFilter]  = useState('ALL')
  const [d1Grades,     setD1Grades]     = useState({})   // { TICKER: { grade, score, stale } } from D1
  const [d1Coverage,   setD1Coverage]   = useState(null)  // { spyCovered, spyTotal, coveragePct }

  // Load all grades from D1 on mount
  useEffect(() => {
    const base = getWorkerUrl()?.replace(/\/$/, '')
    if (!base) return
    fetch(`${base}/api/analyses/grades`)
      .then(r => r.json())
      .then(data => {
        const map = {}
        for (const row of (data.grades ?? [])) {
          map[row.ticker] = { grade: row.grade, score: row.final_score }
        }
        setD1Grades(map)
        setD1Coverage({ spyCovered: data.spyCovered, spyTotal: data.spyTotal, coveragePct: data.coveragePct })
      })
      .catch(() => {})
  }, [])
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

  // Auto-seed scan history from portfolio conviction results
  // so grade filter pills appear without needing to manually scan each ticker
  const cvKeys = Object.keys(convictionResults)
  useEffect(() => {
    if (cvKeys.length === 0) return
    const existing = loadScanHistory()
    if (existing.some(h => h.grade)) return
    const seeded = cvKeys
      .filter(t => convictionResults[t]?.finalScore != null && convictionResults[t]?.grade)
      .map(t => ({ ticker: t, score: convictionResults[t].finalScore, grade: convictionResults[t].grade }))
    if (seeded.length > 0) {
      setScanHistory(seeded)
      saveScanHistory(seeded)
    }
  }, [cvKeys.length]) // eslint-disable-line

  const updateHistory = (ticker, score, grade) => {
    setScanHistory(prev => {
      const next = prev.map(h => h.ticker === ticker ? { ...h, score, grade } : h)
      saveScanHistory(next)
      return next
    })
  }

  return (
    <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', height:'100%', overflow:'hidden' }}>

      {/* ── LEFT PANEL: search + history + sectors ── */}
      <div style={{
        width: isMobile ? '100%' : 280,
        maxHeight: isMobile ? '45vh' : 'none',
        flexShrink:0,
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        borderBottom: isMobile ? '1px solid var(--border)' : 'none',
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
          {d1Coverage && (
            <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:4 }}>
              {d1Coverage.spyCovered}/{d1Coverage.spyTotal} SPY analyzed (current model) · {d1Coverage.coveragePct}%
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:'auto', padding:'0 14px 14px' }}>

          {/* Grade filter + Recent scans */}
          {/* Grade filter pills */}
          {scanHistory.length > 0 && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8, marginTop:4 }}>
              {[
                { id:'ALL',         label:'All',       color:'var(--txt-muted)' },
                { id:'HOLD',        label:'HOLD+',     color:'var(--grade-hold)' },
                { id:'BUY',         label:'BUY',       color:'var(--grade-buy)' },
                { id:'STRONG BUY',  label:'STRONG BUY',color:'var(--grade-strong-buy)' },
              ].map(f => (
                <button key={f.id} onClick={() => setGradeFilter(f.id)} style={{
                  padding:'2px 8px', borderRadius:99, fontSize:9, fontWeight:700, cursor:'pointer',
                  border:`1px solid ${gradeFilter===f.id ? f.color : 'var(--border)'}`,
                  background: gradeFilter===f.id ? `${f.color}20` : 'transparent',
                  color: gradeFilter===f.id ? f.color : 'var(--txt-muted)',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {scanHistory.length > 0 && (() => {
            const GRADE_RANK = { 'STRONG BUY':4,'BUY':3,'HOLD':2,'SELL':1,'STRONG SELL':0 }
            const filtered = scanHistory.filter(h => {
              if (gradeFilter === 'ALL') return true
              if (!h.grade) return false
              if (gradeFilter === 'HOLD') return GRADE_RANK[h.grade] >= GRADE_RANK['HOLD']
              return h.grade === gradeFilter
            })
            if (filtered.length === 0) return (
              <div style={{ fontSize:10, color:'var(--txt-muted)', padding:'8px 0' }}>
                No {gradeFilter} results yet.
              </div>
            )
            return (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Clock size={11} color="var(--txt-muted)" />
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                    Recent scans {filtered.length < scanHistory.length ? `(${filtered.length}/${scanHistory.length})` : ''}
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
              {filtered.map(h => (
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
            )
          })()}

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
                    // Priority: scanHistory → convictionResults → D1 grades
                    const cv = convictionResults[t]
                    const d1 = d1Grades[t]
                    const score = h?.score
                      ?? (cv?.finalScore != null ? Math.round(cv.finalScore * 10) / 10 : null)
                      ?? d1?.score ?? null
                    const grade = h?.grade ?? cv?.grade ?? d1?.grade ?? null
                    const gradeInfo = score != null ? getGrade(score) : null
                    // Apply grade filter — when active, hide tickers with no grade data
                    const GRADE_RANK = { 'STRONG BUY':4,'BUY':3,'HOLD':2,'SELL':1,'STRONG SELL':0 }
                    if (gradeFilter !== 'ALL') {
                      if (!grade) return null  // hide unanalyzed tickers when filter is active
                      if (gradeFilter === 'HOLD' && GRADE_RANK[grade] < GRADE_RANK['HOLD']) return null
                      if (gradeFilter !== 'HOLD' && grade !== gradeFilter) return null
                    }
                    return (
                      <button key={t} onClick={() => handleScan(t)} style={{
                        padding:'3px 8px', borderRadius:5, cursor:'pointer',
                        border:`1px solid ${activeTicker === t ? color : gradeInfo ? gradeInfo.color+'66' : 'var(--border)'}`,
                        background: activeTicker === t ? `${color}22` : gradeInfo ? `${gradeInfo.color}11` : 'transparent',
                        fontFamily:'var(--mono)', fontSize:11, fontWeight:600,
                        color: activeTicker === t ? color : gradeInfo ? gradeInfo.color : 'var(--txt-sec)',
                        transition:'all 0.11s',
                      }}>
                        {t}{score != null ? ` ${score}` : ''}{d1?.stale ? ' ⚠' : ''}
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
            key={activeTicker}
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
