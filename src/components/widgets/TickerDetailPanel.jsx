/**
 * MODULE: WIDGETS / TickerDetailPanel.jsx
 * Full conviction analysis panel for a selected ticker.
 *
 * Sections (top → bottom):
 *  1. Conviction Score + Grade + Confidence
 *  2. Dimension breakdown bars (Growth/Quality/Strength/Valuation/Technical/Risk)
 *  3. Gates status
 *  4. Consensus Wall St. (FMP price target + Finnhub ratings)
 *  5. Fundamentals detail (Growth / Quality / Strength / Valuation / RS vs SPY)
 *  6. Data Freshness
 *
 * Uses useConviction — one hook, one call, everything included.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { X, RotateCcw, TrendingUp, Shield, BarChart2, DollarSign, Clock, Zap } from 'lucide-react'
// recharts removed — Score History uses pure SVG
import { useConviction }           from '../../hooks/useConviction.js'
import { runSwingConviction, getSwingGrade } from '../../conviction/swing/engine.js'
import { computeDecision }                    from '../../conviction/decision/engine.js'
import { useBreakpoint }  from '../../hooks/useBreakpoint.js'
import { POSITIONS }      from '../../data/positions.js'
import { fUSD, fPct, fPctRaw, fMult, fBig, fRatio } from '../../utils/format.js'
import { workerAPI }       from '../../utils/api/worker.js'
import { cache }          from '../../utils/cache.js'
import { loadWatchlist, saveWatchlist } from '../../utils/watchlistStorage.js'
import { loadOverrides, saveOverrides } from '../../utils/positionsStorage.js'
import { getGradeColor }   from '../../conviction/grade/index.js'
import { UNIVERSE }        from '../../data/tickerUniverse.js'

// Grade rank for alignment calculation — module-level to avoid duplicate naming post-minification
const GRADE_RANK_MAP = {'STRONG BUY':4,'BUY':3,'HOLD':2,'SELL':1,'STRONG SELL':0}

/* ── Color helpers (values in % form from Finnhub) ─────── */
const growthColor  = v => v == null ? 'var(--txt-muted)' : v >= 20 ? 'var(--green)' : v >= 5 ? 'var(--amber)' : 'var(--red)'
const marginColor  = v => v == null ? 'var(--txt-muted)' : v >= 30 ? 'var(--green)' : v >= 10 ? 'var(--amber)' : 'var(--red)'
const roeColor     = v => v == null ? 'var(--txt-muted)' : v >= 20 ? 'var(--green)' : v >= 10 ? 'var(--amber)' : 'var(--red)'
const debtColor    = v => v == null ? 'var(--txt-muted)' : v < 0.5 ? 'var(--green)' : v < 1.5 ? 'var(--amber)' : 'var(--red)'
const peColor      = v => v == null ? 'var(--txt-muted)' : v < 20 ? 'var(--green)' : v < 40 ? 'var(--amber)' : 'var(--red)'
const pegColor     = v => v == null ? 'var(--txt-muted)' : v < 1 ? 'var(--green)' : v < 2 ? 'var(--amber)' : 'var(--red)'
const rsColor      = v => v == null ? 'var(--txt-muted)' : v >= 0 ? 'var(--green)' : 'var(--red)'

/* ── Dimension bar ──────────────────────────────────────── */
function DimBar({ label, score, max, color }) {
  const pct  = score != null ? Math.min((score / max) * 100, 100) : 0
  const col  = color ?? 'var(--accent)'
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:11, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>{label}</span>
        <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: score != null ? col : 'var(--txt-muted)' }}>
          {score != null ? score.toFixed(score % 1 === 0 ? 0 : 1) : '—'}<span style={{ color:'var(--txt-muted)', fontWeight:400 }}>/{max}</span>
        </span>
      </div>
      <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:3, transition:'width 0.4s ease' }} />
      </div>
    </div>
  )
}

/* ── Data row ───────────────────────────────────────────── */
function Row({ label, value, color, sub }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:12, color:'var(--txt-sec)' }}>{label}</span>
      <div style={{ textAlign:'right' }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, color: color || 'var(--txt)' }}>{value ?? '—'}</span>
        {sub && <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--txt-muted)' }}>{sub}</div>}
      </div>
    </div>
  )
}

/* ── Section header ─────────────────────────────────────── */
function SectionHeader({ icon: Icon, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:18, marginBottom:8, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>
      <Icon size={12} />{label}
    </div>
  )
}

/* ── Consensus bar ──────────────────────────────────────── */
function ConsensusBar({ sb=0, b=0, h=0, s=0, ss=0 }) {
  const total = sb+b+h+s+ss || 1
  const pct = n => `${(n/total*100).toFixed(1)}%`
  const items = [
    {n:sb,color:'#22C55E',label:'STRONG BUY'},
    {n:b, color:'#86EFAC',label:'Buy'},
    {n:h, color:'#FBBF24',label:'Hold'},
    {n:s, color:'#F97316',label:'Sell'},
    {n:ss,color:'#EF4444',label:'STRONG SELL'},
  ]
  return (
    <div>
      <div style={{ display:'flex', height:7, borderRadius:4, overflow:'hidden', marginBottom:8, gap:1 }}>
        {items.map(({n,color,label}) => n > 0 &&
          <div key={label} title={`${label}: ${n}`} style={{ width:pct(n), background:color, minWidth:2 }} />
        )}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        {items.map(({n,color,label}) => (
          <div key={label} style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color }}>{n}</div>
            <div style={{ fontSize:9, color:'var(--txt-muted)' }}>{label.split(' ').pop()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Freshness row ──────────────────────────────────────── */
function FreshnessRow({ label, freshness }) {
  if (!freshness) return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:12, color:'var(--txt-sec)' }}>{label}</span>
      <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--txt-muted)' }}>Not cached</span>
    </div>
  )
  const color = freshness.daysLeft > 30 ? 'var(--green)' : freshness.daysLeft > 0 ? 'var(--amber)' : 'var(--red)'
  const icon  = freshness.daysLeft > 30 ? '✅' : freshness.daysLeft > 0 ? '⚠️' : '🔴'
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:12, color:'var(--txt-sec)' }}>{label}</span>
      <span style={{ fontSize:11, fontFamily:'var(--mono)', color }}>{icon} {freshness.daysSince}d ago · {freshness.daysLeft}d left</span>
    </div>
  )
}



/* ═══════════════════════════════════════════════════════
   MAIN PANEL
═══════════════════════════════════════════════════════ */
export default function TickerDetailPanel({ ticker, onClose, prices = {}, embedded = false, onResult }) {
  const { isMobile } = useBreakpoint()
  const { result, loading, error, recompute } = useConviction(ticker, prices)

  const pos          = POSITIONS.find(p => p.ticker === ticker)
  const universeInfo = UNIVERSE.find(u => u.ticker === ticker)
  const isETF        = universeInfo?.type === 'ETF'
  const f         = result?.fundamentalsData ?? null
  const freshness = cache.infoFund(ticker)

  const [activeTab, setActiveTab] = useState('score')
  const [mode,       setMode]       = useState('long-term')  // 'long-term' | 'swing'

  // Always compute swing result — mode change does NOT re-fetch (mode not in deps)
  const swingResult = useMemo(() => {
    if (!result) return null
    try {
      const ohlcv    = result.ohlcv    ?? []
      const spyOhlcv = result.spyOhlcv ?? []
      return runSwingConviction(result.fundamentalsData, ohlcv, spyOhlcv)
    } catch { return null }
  }, [result?.fundamentalsData, result?.ohlcv, result?.spyOhlcv]) // eslint-disable-line

  // Backward compat alias used by alignment and decision engine
  const altResult = swingResult
  const [aiData,    setAiData]    = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState(null)
  const [news,      setNews]      = useState(null)
  const [marketIntel, setMarketIntel] = useState(null)
  const [miLoading,   setMiLoading]   = useState(false)
  const [showAllHeadlines, setShowAllHeadlines] = useState(false)
  const [addedToWl,    setAddedToWl]    = useState(false)
  const [showAddPos,   setShowAddPos]   = useState(false)
  const [addPosAcct,   setAddPosAcct]   = useState('Brokerage')
  const [addPosQty,    setAddPosQty]    = useState('')
  const [addPosPrice,  setAddPosPrice]  = useState('')
  const [addPosSaved,  setAddPosSaved]  = useState(false)
  const [qaOpen,       setQaOpen]       = useState(false)  // Quick-Add dropdown
  const [scoreHistory, setScoreHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [insiderData,    setInsiderData]    = useState(null)
  const [insiderLoading, setInsiderLoading] = useState(false)
  const [insiderError,   setInsiderError]   = useState(null)
  const [showInsiderDbg, setShowInsiderDbg] = useState(false)

  const alignment_ = useMemo(() => {
    if (!result || !altResult) return null
    // If OHLCV is insufficient, swing score is meaningless (0 = missing data, not bearish)
    // Propagate null so downstream consumers (Decision, CompareView) don't misuse it
    if ((result.ohlcv?.length ?? 0) < 50) return null
    const ltR = GRADE_RANK_MAP[result.grade]??2, swR = GRADE_RANK_MAP[altResult.grade]??2
    const ceiling   = [100,75,50,25,0][Math.min(Math.abs(ltR-swR),4)]
    const similarity = Math.max(0, 100-Math.abs(result.finalScore-altResult.finalScore))
    return Math.min(similarity, ceiling)
  }, [result, altResult])

  // Compute Decision Engine output (deterministic synthesis)
  const decision = useMemo(() => {
    if (!result) return null
    try {
      // When OHLCV < 50, swing data is insufficient — pass null instead of 0-score result
      const swingForDecision = (result.ohlcv?.length ?? 0) >= 50 ? altResult : null
      return computeDecision(result, swingForDecision, alignment_)
    } catch { return null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, altResult, alignment_])

  // Always compute swing for alignment display (uses cached OHLCV, no extra API calls)
  // ── Reset ALL tab-specific state when ticker changes ──────────
  // Without this, insiderData/marketIntel from ticker A persist when switching to ticker B.
  useEffect(() => {
    setActiveTab('score')
    setAiData(null);    setAiLoading(false);   setAiError(null)
    setNews(null);      setShowAllHeadlines(false)
    setMarketIntel(null); setMiLoading(false)
    setScoreHistory(null); setHistoryLoading(false)
    setInsiderData(null);  setInsiderLoading(false); setInsiderError(null)
    setShowInsiderDbg(false)
    setAddedToWl(false); setShowAddPos(false); setAddPosSaved(false)
    setQaOpen(false)
  }, [ticker])

  const generateAI = async () => {
    setAiLoading(true); setAiError(null)
    try {
      const [moat, bear, cats] = await Promise.all([
        workerAPI.moat(ticker),
        workerAPI.bear(ticker),
        workerAPI.catalysts(ticker),
      ])
      setAiData({
        moat:        moat?.data,
        bear:        bear?.data,
        catalysts:   cats?.data,
        fromCache:   moat?.meta?.fromCache,
        generatedAt: moat?.meta?.fetchedAt,
        expiresAt:   bear?.meta?.expiresAt,
      })
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  // Auto-load Market Intelligence when market tab opens
  useEffect(() => {
    if (activeTab === 'market' && !marketIntel && !miLoading && ticker) {
      setMiLoading(true)
      workerAPI.marketIntelligence(ticker)
        .then(r => setMarketIntel(r?.data ?? null))
        .catch(() => setMarketIntel(null))
        .finally(() => setMiLoading(false))
    }
  }, [activeTab, ticker]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load AI analysis when AI tab is opened (uses KV cache — instant if cached)
  useEffect(() => {
    if (activeTab === 'ai' && !aiData && !aiLoading && result) {
      generateAI()
    }
    if (activeTab === 'insider' && !insiderData && !insiderLoading && ticker) {
      setInsiderLoading(true)
      setInsiderError(null)
      workerAPI.insiderActivity(ticker)
        .then(r => setInsiderData(r?.data ?? null))
        .catch(e => setInsiderError(e.message))
        .finally(() => setInsiderLoading(false))
    }
  }, [activeTab, ticker]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load score history from D1 when Score tab opens
  useEffect(() => {
    if (activeTab === 'score' && !scoreHistory && !historyLoading && ticker) {
      setHistoryLoading(true)
      workerAPI.getHistory(ticker)
        .then(r => setScoreHistory(r?.snapshots ?? []))
        .catch(() => setScoreHistory([]))
        .finally(() => setHistoryLoading(false))
    }
  }, [activeTab, ticker]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load news when fundamentals tab opens
  useEffect(() => {
    if (activeTab === 'fundamentals' && !news && ticker) {
      workerAPI.news(ticker)
        .then(r => setNews(r?.data ?? []))
        .catch(() => setNews([]))
    }
  }, [activeTab, ticker]) // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent (e.g. ScanView) when conviction result is ready
  // This populates the grade in scan history so the grade filter works
  useEffect(() => {
    if (result?.finalScore != null && result?.grade && onResult) {
      onResult(result.finalScore, result.grade)
    }
  }, [result?.finalScore, result?.grade]) // eslint-disable-line

  const handleAddToWatchlist = () => {
    const wl = loadWatchlist() ?? []
    if (!wl.find(i => i.ticker === ticker)) {
      saveWatchlist([...wl, {
        ticker,
        name:         universeInfo?.name ?? ticker,
        currentPrice: result?.technical?.currentPrice ?? prices?.[ticker]?.price ?? 0,
        dayChangePct: null,
        priority:     'med',
        upside:       result?.wallStreet?.upside ?? null,
      }])
    }
    setAddedToWl(true)
    setTimeout(() => setAddedToWl(false), 2000)
  }

  const handleAddPosition = () => {
    const qty   = parseFloat(addPosQty)
    const price = parseFloat(addPosPrice)
    if (!qty || !price) return
    const positions = loadOverrides() ?? []
    if (!positions.find(p => p.ticker === ticker && p.account === addPosAcct)) {
      saveOverrides([...positions, {
        ticker, name: ticker, qty, avgPrice: price,
        currentPrice: price, account: addPosAcct, conviction: 50, upside: 0,
      }])
    }
    setAddPosSaved(true)
    setShowAddPos(false)
    setAddPosQty(''); setAddPosPrice('')
    setTimeout(() => setAddPosSaved(false), 2000)
  }

  return (
    <>
      {!embedded && <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:149, background:'rgba(0,0,0,0.3)' }} />}

      <div style={embedded ? {
        flex:1, display:'flex', flexDirection:'column', minWidth:0,
      } : {
        position:'fixed', top:0, right:0,
        width: isMobile ? '100vw' : Math.min(480, window.innerWidth * 0.95),
        height:'100vh',
        background:'var(--surface)',
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
        zIndex:150, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.4)',
      }}>

        {/* Header — 2 rows: ticker+price+close | controls */}
        <div style={{ display:'flex', flexDirection:'column',
          padding:'10px 14px 8px', borderBottom:'1px solid var(--border)',
          flexShrink:0, background:'var(--surface)', position:'sticky', top:0, zIndex:10, gap:6 }}>
          {/* Row 1: Ticker + price + close button — always visible */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color:'var(--txt)' }}>{ticker}</div>
              {isETF && (
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4,
                  background:'rgba(251,191,36,0.2)', color:'var(--amber)',
                  border:'1px solid rgba(251,191,36,0.5)', letterSpacing:'0.07em', flexShrink:0 }}>
                  ETF
                </span>
              )}
              {/* Live price */}
              {prices[ticker]?.price && (
                <span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:600,
                  color: prices[ticker]?.changePct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  ${prices[ticker].price.toFixed(2)}
                  {prices[ticker]?.changePct != null && (
                    <span style={{ fontSize:11, marginLeft:4, opacity:0.85 }}>
                      {prices[ticker].changePct >= 0 ? '+' : ''}{prices[ticker].changePct.toFixed(2)}%
                    </span>
                  )}
                </span>
              )}
            </div>
            <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{isETF ? universeInfo?.name : pos?.name}</div>
          </div>
          {/* Close button in Row 1 — always accessible */}
          {!embedded && (
            <button onClick={onClose}
              style={{ width:32, height:32, borderRadius:'var(--radius)', border:'1px solid var(--border)',
                background:'transparent', cursor:'pointer', color:'var(--txt-muted)',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginLeft:'auto' }}>
              <X size={14} />
            </button>
          )}
          </div>{/* end Row 1 */}
          {/* Row 2: alignment score + tabs + action buttons */}
          <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
            {/* Alignment Score v2 — agreement as ceiling, strategy phrase */}
            {swingResult && result && (() => {
              const ltR = GRADE_RANK_MAP[result.grade]    ?? 2
              const swR = GRADE_RANK_MAP[altResult.grade] ?? 2
              const dist = Math.abs(ltR - swR)

              // Agreement ceiling — grade distance determines max possible alignment
              const ceiling   = dist===0?100 : dist===1?75 : dist===2?50 : dist===3?25 : 0

              // Similarity — only meaningful within same grade ceiling
              const similarity = Math.max(0, 100 - Math.abs(result.finalScore - altResult.finalScore))

              // Alignment = similarity CAPPED by agreement ceiling (no arbitrary weights)
              const alignment  = Math.min(similarity, ceiling)

              // Direction flags
              const ltBull = ltR >= 3, swBull = swR >= 3
              const ltBear = ltR <= 1, swBear = swR <= 1
              const bothBull = ltBull && swBull, bothBear = ltBear && swBear

              // Matrix label
              const matrixLabel =
                alignment >= 85 && bothBull ? '🟢 High Conviction Bullish' :
                alignment >= 85 && bothBear ? '🔴 High Conviction Bearish' :
                alignment >= 70 && bothBull ? '🟢 Aligned Bullish' :
                alignment >= 70 && bothBear ? '🔴 Aligned Bearish' :
                alignment >= 50             ? '🟡 Mixed Signals' :
                ltBull !== swBull           ? '🟠 Counter-Trend' :
                                              '⚫ Strong Divergence'

              // Strategy phrase — grade-pair lookup table (no conditional ambiguity)
              const STRATEGY = {
                'STRONG BUY|STRONG BUY': 'Suitable for accumulation',
                'STRONG BUY|BUY':        'Suitable for accumulation',
                'BUY|STRONG BUY':        'Suitable for accumulation',
                'BUY|BUY':               'Suitable for accumulation',
                'STRONG BUY|HOLD':       'Accumulate on pullbacks',
                'BUY|HOLD':              'Accumulate on pullbacks',
                'STRONG BUY|SELL':       'Wait for technical recovery',
                'BUY|SELL':              'Wait for technical recovery',
                'STRONG BUY|STRONG SELL':'Wait for technical recovery',
                'BUY|STRONG SELL':       'Wait for technical recovery',
                'HOLD|STRONG BUY':       'Swing opportunity',
                'HOLD|BUY':              'Swing opportunity',
                'HOLD|HOLD':             'Monitor for confirmation',
                'HOLD|SELL':             'Weakening thesis',
                'HOLD|STRONG SELL':      'Weakening thesis',
                'SELL|STRONG BUY':       'Counter-trend trade only',
                'SELL|BUY':              'Counter-trend trade only',
                'SELL|HOLD':             'Avoid new positions',
                'SELL|SELL':             'Consider reducing exposure',
                'SELL|STRONG SELL':      'Consider reducing exposure',
                'STRONG SELL|STRONG BUY':'Counter-trend trade only',
                'STRONG SELL|BUY':       'Counter-trend trade only',
                'STRONG SELL|HOLD':      'Avoid new positions',
                'STRONG SELL|SELL':      'High conviction bearish',
                'STRONG SELL|STRONG SELL':'High conviction bearish',
              }
              const strategy = STRATEGY[`${result.grade}|${altResult.grade}`] ?? 'Monitor — no clear signal'

              const color =
                alignment >= 70 && bothBull ? 'var(--green)' :
                alignment >= 70 && bothBear ? 'var(--red)'   :
                alignment >= 50             ? 'var(--amber)'  :
                                              'var(--red)'

              return (
                <div
                  title={alignment_==null ? 'Swing alignment unavailable — insufficient OHLCV data' : `LT: ${result.finalScore} (${result.grade}) · SW: ${altResult.finalScore} (${altResult.grade}) · Ceiling: ${ceiling}% · Similarity: ${similarity}%`}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center',
                    padding:'4px 10px', borderRadius:6, marginRight:6,
                    background:`${color}15`, border:`1px solid ${color}44`,
                    cursor:'default', minWidth:76 }}>
                  <div style={{ fontSize:13, fontWeight:800, color, lineHeight:1.1 }}>
                    {alignment != null ? `${alignment}%` : 'N/A'}
                  </div>
                  <div style={{ fontSize:9.5, color, fontWeight:700,
                    whiteSpace:'nowrap', marginTop:2, textAlign:'center' }}>
                    {alignment != null ? matrixLabel : 'Swing N/A'}
                  </div>
                  <div style={{ fontSize:9, color:'var(--txt-muted)',
                    whiteSpace:'nowrap', marginTop:1, textAlign:'center', fontStyle:'italic' }}>
                    {strategy}
                  </div>
                </div>
              )
            })()}

            {/* Detail analysis toggle — controls which breakdown is shown in score tab */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
              <div style={{ fontSize:8, color:'var(--txt-muted)', letterSpacing:'0.04em' }}>DETAIL VIEW</div>
              <div style={{ display:'flex', background:'var(--surface-up)', borderRadius:6,
                border:'1px solid var(--border)', overflow:'hidden' }}>
                {[['long-term','LT Analysis'],['swing','Swing Analysis']].map(([m,label]) => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    padding:'4px 10px', border:'none', cursor:'pointer', fontSize:10, fontWeight:700,
                    background: mode===m ? 'var(--accent)' : 'transparent',
                    color:      mode===m ? '#fff'           : 'var(--txt-muted)',
                    transition:'all 0.12s',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Add dropdown — state at component top level (Rules of Hooks) */}
            {ticker && (
              <div style={{ position:'relative', marginRight:4 }}>
                <button
                  onClick={() => { setQaOpen(v => !v); setShowAddPos(false) }}
                  title="Add to watchlist or portfolio"
                  style={{ width:32, height:32, borderRadius:'var(--radius)',
                    border:`1px solid ${qaOpen?'var(--accent)':'var(--border)'}`,
                    background: qaOpen?'var(--accent-dim)':'transparent',
                    color: qaOpen?'var(--accent)':'var(--txt-muted)',
                    cursor:'pointer', fontSize:18, fontWeight:300,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                  +
                </button>
                {qaOpen && !showAddPos && !addedToWl && !addPosSaved && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:600,
                    minWidth:190, background:'var(--surface)', border:'1px solid var(--border)',
                    borderRadius:'var(--radius-lg)', boxShadow:'0 8px 24px rgba(0,0,0,0.35)', overflow:'hidden' }}>
                    <button
                      onClick={() => { handleAddToWatchlist(); setQaOpen(false) }}
                      style={{ width:'100%', padding:'9px 14px', border:'none', background:'transparent',
                        cursor:'pointer', textAlign:'left', fontSize:12, color:'var(--txt)',
                        borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--surface-up)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <span>👁</span> Add to Watchlist
                    </button>
                    {['Brokerage','Roth IRA'].map(acct => (
                      <button key={acct}
                        onClick={() => { setAddPosAcct(acct); setShowAddPos(true); setQaOpen(false) }}
                        style={{ width:'100%', padding:'9px 14px', border:'none', background:'transparent',
                          cursor:'pointer', textAlign:'left', fontSize:12, color:'var(--txt)',
                          borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface-up)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <span>📈</span> Add to {acct}
                      </button>
                    ))}
                  </div>
                )}
                {/* Add-to-portfolio mini form */}
                {showAddPos && !addPosSaved && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:600,
                    minWidth:220, background:'var(--surface)', border:'1px solid var(--border)',
                    borderRadius:'var(--radius-lg)', boxShadow:'0 8px 24px rgba(0,0,0,0.35)',
                    padding:'12px 14px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--txt)', marginBottom:10 }}>
                      Add {ticker} to {addPosAcct}
                    </div>
                    {[
                      { label:'Qty (shares)', value: addPosQty,   setter: setAddPosQty  },
                      { label:'Avg price ($)', value: addPosPrice, setter: setAddPosPrice },
                    ].map(({ label, value, setter }) => (
                      <div key={label} style={{ marginBottom:8 }}>
                        <div style={{ fontSize:9, color:'var(--txt-muted)', marginBottom:3,
                          textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
                        <input
                          value={value}
                          onChange={e => setter(e.target.value)}
                          type="number" min="0" step="any"
                          style={{ width:'100%', padding:'5px 8px', borderRadius:6,
                            border:'1px solid var(--border)', background:'var(--surface-up)',
                            color:'var(--txt)', fontFamily:'var(--mono)', fontSize:12,
                            boxSizing:'border-box', outline:'none' }}
                        />
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:6, marginTop:4 }}>
                      <button onClick={handleAddPosition}
                        style={{ flex:1, padding:'6px', borderRadius:6, background:'var(--accent)',
                          color:'#fff', border:'none', cursor:'pointer', fontSize:11, fontWeight:700 }}>
                        Confirm
                      </button>
                      <button onClick={() => { setShowAddPos(false); setAddPosQty(''); setAddPosPrice('') }}
                        style={{ padding:'6px 10px', borderRadius:6, background:'transparent',
                          border:'1px solid var(--border)', cursor:'pointer', fontSize:11, color:'var(--txt-muted)' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {(addedToWl || addPosSaved) && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:600,
                    background:'var(--green)', color:'#fff', padding:'5px 10px',
                    borderRadius:6, fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
                    ✓ Saved!
                  </div>
                )}
              </div>
            )}
            <button onClick={recompute} disabled={loading}
              style={{ width:32, height:32, borderRadius:'var(--radius)', border:'1px solid var(--border)',
                background:'transparent', cursor:loading?'wait':'pointer',
                color:loading?'var(--accent)':'var(--txt-muted)',
                display:'flex', alignItems:'center', justifyContent:'center',
                animation:loading?'tp-spin 1s linear infinite':'none' }}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        <style>{`@keyframes tp-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

        {/* Tab Bar */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--surface)' }}>
          {[
            { id:'score',        label:'Score'        },
            { id:'fundamentals', label:'Fundamentals' },
            { id:'ai',           label:'AI Analysis'  },
            { id:'market',       label:'Market Intel' },
            { id:'insider',      label:'Insider'      },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              flex:1, padding:'10px 0', fontSize:11, fontWeight:600,
              border:'none', background:'transparent', cursor:'pointer',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--txt-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              transition:'all 0.15s', fontFamily:'var(--sans)',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding:'14px 16px', flex:1, overflowY:'auto' }}>

          {/* ETF banner — always visible for ETF tickers, regardless of conviction state */}
          {isETF && (
            <div style={{ background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.3)',
              borderRadius:'var(--radius)', padding:'8px 12px', marginBottom:12, fontSize:11,
              color:'var(--amber)', lineHeight:1.5 }}>
              <strong>ETF</strong> · {universeInfo?.name} · {universeInfo?.industry}
              <span style={{ display:'block', marginTop:3, fontWeight:400, opacity:0.8 }}>
                No EPS, revenue, or balance sheet data — conviction score reflects only technical dimensions.
              </span>
            </div>
          )}


          {loading && !result && (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--txt-muted)', fontSize:13 }}>
              <div style={{ fontSize:24, marginBottom:12 }}>↻</div>
              Computing conviction score…<br />
              <span style={{ fontSize:11 }}>Fetching fundamentals + OHLCV + SPY</span>
            </div>
          )}

          {error && !result && (
            <div style={{ background:'var(--red-dim)', border:'1px solid var(--red)',
              borderRadius:'var(--radius)', padding:'12px', marginBottom:16, fontSize:12, color:'var(--red)' }}>
              ⚠ {error}
            </div>
          )}

          {result && (
            <>
              {activeTab === 'score' && (
                <>

              {/* ══ SWING ANALYSIS DETAIL (when mode === 'swing') ══ */}
              {mode === 'swing' && swingResult && (
                <div style={{ background:`${swingResult.gradeColor}11`, border:`1px solid ${swingResult.gradeColor}33`,
                  borderRadius:'var(--radius-lg)', padding:'16px', marginBottom:16 }}>
                  {(() => {
                    const bars = result?.ohlcv?.length ?? 0
                    if (bars < 50) return (
                      <div style={{ padding:'10px 14px', background:'var(--red-dim)',
                        border:'1px solid var(--red)', borderRadius:'var(--radius)',
                        marginBottom:12, fontSize:11, color:'var(--red)' }}>
                        ⚠ Insufficient OHLCV data ({bars} bars) — Swing Analysis unavailable.
                        <div style={{ fontSize:9, marginTop:3, opacity:0.8 }}>
                          EMA, ADX, MACD and most indicators require 200+ bars.
                          Load historical data first via the price chart (2Y range).
                        </div>
                      </div>
                    )
                    if (bars < 200) return (
                      <div style={{ fontSize:10, color:'var(--amber)', marginBottom:8,
                        padding:'6px 10px', background:'var(--amber-dim)',
                        border:'1px solid var(--amber)', borderRadius:'var(--radius)' }}>
                        ⚠ Limited data ({bars}/200 bars) — EMA200 and ADX partially available.
                        Some indicators may show 0 due to missing history, not bearish signals.
                      </div>
                    )
                    return null
                  })()}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                        <span style={{ fontFamily:'var(--mono)', fontSize:42, fontWeight:700,
                          color:swingResult.gradeColor, lineHeight:1, letterSpacing:'-0.04em' }}>
                          {swingResult.finalScore}
                        </span>
                        <span style={{ fontFamily:'var(--mono)', fontSize:14, color:'var(--txt-muted)' }}>/100</span>
                      </div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700,
                        color:(result?.ohlcv?.length ?? 0) < 50 ? 'var(--txt-muted)' : swingResult.gradeColor,
                        marginTop:4 }}>
                        {(result?.ohlcv?.length ?? 0) < 50 ? '— Insufficient Data' : `${swingResult.grade} — Swing Timing`}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:10, color:'var(--txt-muted)', textTransform:'uppercase',
                        letterSpacing:'0.06em', marginBottom:4 }}>Setup</div>
                      <div style={{ fontSize:15, fontWeight:800, color:'var(--txt)' }}>
                        {swingResult.setup}
                      </div>
                      <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:2 }}
                        title="Setup Quality: measures signal completeness and internal agreement — not probability of positive return">
                        {swingResult.setupConfidence}% quality ⓘ
                      </div>
                    </div>
                  </div>

                  {/* Swing dimension bars */}
                  {[
                    { label:'EMA Structure',    s:swingResult.breakdown?.ema?.score,             max:20 },
                    { label:'Relative Strength',s:swingResult.breakdown?.rs?.score,              max:15 },
                    { label:'MACD Quality',     s:swingResult.breakdown?.macd?.score,            max:10 },
                    { label:'Volume (RVOL)',     s:swingResult.breakdown?.rvol?.score,            max:10 },
                    { label:'ADX / Trend',      s:swingResult.breakdown?.adx?.score,             max:10 },
                    { label:'ATR Percentile',   s:swingResult.breakdown?.atrQuality?.score,      max:10 },
                    { label:'Business Momentum',s:swingResult.breakdown?.businessMomentum?.score,max:10 },
                    { label:'Earnings Catalyst',s:swingResult.breakdown?.earnings?.score,        max:5  },
                    { label:'Setup Bonus',      s:swingResult.breakdown?.setupBonus?.score,      max:5  },
                  ].map(d => d.s != null && (
                    <DimBar key={d.label} label={d.label} score={d.s} max={d.max}
                      color={swingResult.gradeColor} />
                  ))}

                  {/* Risk penalty */}
                  {swingResult.riskPenalty < 0 && (
                    <div style={{ fontSize:11, color:'var(--red)', fontFamily:'var(--mono)', marginTop:6 }}>
                      Risk penalty {swingResult.riskPenalty}
                    </div>
                  )}

                  {/* Setup reasons */}
                  {swingResult.setupReasons?.length > 0 && (
                    <div style={{ marginTop:12, borderTop:'1px solid var(--border)', paddingTop:10 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)',
                        textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
                        Why {swingResult.setup}
                      </div>
                      {swingResult.setupReasons.map((r,i) => (
                        <div key={i} style={{ fontSize:11, color:'var(--txt)', marginBottom:3 }}>
                          · {r}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Exhaustion warning */}
                  {swingResult.exhaustion?.exhausted && (
                    <div style={{ marginTop:8, padding:'6px 10px', background:'var(--amber-dim)',
                      border:'1px solid var(--amber)', borderRadius:'var(--radius)', fontSize:11,
                      color:'var(--amber)' }}>
                      ⚠ {swingResult.exhaustion.warning}
                      <div style={{ fontSize:9, opacity:0.8, marginTop:2 }}>
                        {swingResult.exhaustion.signals?.join(' · ')}
                      </div>
                    </div>
                  )}

                  {/* Entry levels — hidden if OHLCV continuity has errors */}
                  {swingResult.levels && result?.meta?.continuity?.status !== 'error' && (
                    <div style={{ marginTop:12, borderTop:'1px solid var(--border)', paddingTop:10 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)',
                        textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>
                        Indicative Trade Levels · {swingResult.setup}
                      </div>
                      <div style={{ fontSize:9, color:'var(--txt-muted)', fontStyle:'italic', marginBottom:8 }}>
                        Based on current ATR and detected setup. Recalculate if price or volatility changes.
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                        {[
                          { label:'Entry',       value:swingResult.levels.entry,      color:'var(--txt)' },
                          { label:'Stop Loss',   value:swingResult.levels.stopLoss,   color:'var(--red)' },
                          { label:'Take Profit', value:swingResult.levels.takeProfit, color:'var(--green)' },
                        ].map(l => (
                          <div key={l.label} style={{ background:'var(--surface-up)',
                            borderRadius:'var(--radius)', padding:'8px 10px' }}>
                            <div style={{ fontSize:9, color:'var(--txt-muted)', marginBottom:3,
                              textTransform:'uppercase', letterSpacing:'0.05em' }}>{l.label}</div>
                            <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700,
                              color:l.color }}>${l.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:6, fontStyle:'italic' }}>
                        R/R {swingResult.levels.riskReward}:1 · ATR {swingResult.levels.atrPct}% ·
                        {swingResult.levels.note}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ══ SECTION 1: LT CONVICTION SCORE (shown when mode === 'long-term') ══ */}
              {mode === 'long-term' && (
              <div style={{ background:result.gradeBg, border:`1px solid ${result.gradeColor}33`, borderRadius:'var(--radius-lg)', padding:'16px', marginBottom:16 }}>
                {/* Score + Grade + Confidence */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:42, fontWeight:700, color:result.gradeColor, lineHeight:1, letterSpacing:'-0.04em' }}>
                        {result.finalScore}
                      </span>
                      <span style={{ fontFamily:'var(--mono)', fontSize:14, color:'var(--txt-muted)' }}>/100</span>
                    </div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color:result.gradeColor, marginTop:4 }}>
                      {'★'.repeat(result.gradeStars)}{'☆'.repeat(5 - result.gradeStars)} {result.grade}
                    </div>
                    {result.activeGate && (
                      <div style={{ fontSize:11, color:'var(--amber)', marginTop:4 }}>
                        ⚠ {result.activeGate === 'gate1' ? 'Gate 1' : 'Gate 2'} active — capped at {result.gateCap}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:10, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Confidence</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:700, color:'var(--txt)' }}>
                      {result.confidence}<span style={{ fontSize:14, color:'var(--txt-muted)' }}>%</span>
                    </div>
                  </div>
                </div>

                {/* Score pipeline (for transparency) */}
                <div style={{ fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)', marginBottom:14 }}>
                  Raw {result.rawScore} · Risk {result.riskPenalty} → {result.scoreAfterRisk}
                  {result.gateCap ? ` → Gate cap ${result.gateCap}` : ''} → <strong style={{ color:result.gradeColor }}>{result.finalScore}</strong>
                </div>

                {/* Dimension bars */}
                <DimBar label="Growth"    score={result.breakdown.growth.score}    max={25} color={result.gradeColor} />
                <DimBar label="Quality"   score={result.breakdown.quality.score}   max={20} color={result.gradeColor} />
                <DimBar label="Strength"  score={result.breakdown.strength.score}  max={15} color={result.gradeColor} />
                <DimBar label="Valuation" score={result.breakdown.valuation.score} max={15}
                  color={result.gradeColor}/>
                <DimBar label="Technical" score={result.breakdown.technical.score} max={15} color={result.gradeColor} />

                {/* Risk penalty */}
                {result.riskPenalty < 0 && (
                  <div style={{ marginTop:8, fontSize:11, color:'var(--red)', fontFamily:'var(--mono)' }}>
                    Risk penalty {result.riskPenalty}: {result.breakdown.risk.breakdown.map(r => r.label).join(' · ')}
                  </div>
                )}

                {/* Valuation metric used */}
                <div style={{ marginTop:8, fontSize:10, color:'var(--txt-muted)' }}>
                  Valuation metric: <strong>{result.breakdown.valuation.metric ?? '—'}</strong>
                  {result.breakdown.valuation.value != null ? ` (${result.breakdown.valuation.value.toFixed(2)})` : ''}
                </div>
              </div>

              )}

              {/* ══ SCORE HISTORY ══ */}
              {(() => {
                const GRADE_COLOR = {
                  'STRONG BUY':'#22C55E','BUY':'#86EFAC',
                  'HOLD':'#FBBF24','SELL':'#F97316','STRONG SELL':'#EF4444',
                }

                if (historyLoading) return (
                  <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:10, fontSize:11, color:'var(--txt-muted)' }}>
                    Loading score history…
                  </div>
                )
                if (!scoreHistory || scoreHistory.length === 0) return (
                  <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:10, fontSize:11, color:'var(--txt-muted)' }}>
                    No snapshots yet — first snapshot runs next Sunday via cron, or open any ticker to create one.
                  </div>
                )

                const pts       = [...scoreHistory].reverse()   // oldest first
                const latest    = pts[pts.length - 1]
                const prev      = pts[pts.length - 2]
                const first     = pts[0]
                const totalDelta  = latest && first ? Math.round(((latest.final_score ?? 0) - (first.final_score ?? 0)) * 10) / 10 : 0
                const weekDelta   = latest && prev  ? Math.round(((latest.final_score ?? 0) - (prev.final_score  ?? 0)) * 10) / 10 : null

                const COMP_KEYS = [
                  { key:'growth_score',    label:'Growth',    max:25 },
                  { key:'quality_score',   label:'Quality',   max:20 },
                  { key:'strength_score',  label:'Strength',  max:15 },
                  { key:'valuation_score', label:'Valuation', max:15 },
                  { key:'technical_score', label:'Technical', max:15 },
                ]

                const hasUpside = pts.some(p => p.upside_pct != null)

                return (
                  <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:10 }}>

                    {/* Header */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                        Score History · {pts.length} snapshot{pts.length !== 1 ? 's' : ''}
                      </div>
                      <div style={{ display:'flex', gap:10, fontSize:10, fontFamily:'var(--mono)' }}>
                        {weekDelta !== null && (
                          <span style={{ color: weekDelta > 0 ? 'var(--green)' : weekDelta < 0 ? 'var(--red)' : 'var(--txt-muted)', fontWeight:700 }}>
                            {weekDelta > 0 ? '↑' : weekDelta < 0 ? '↓' : '→'} {weekDelta > 0 ? '+' : ''}{weekDelta} this week
                          </span>
                        )}
                        {pts.length > 1 && (
                          <span style={{ color: totalDelta > 0 ? 'var(--green)' : totalDelta < 0 ? 'var(--red)' : 'var(--txt-muted)', fontWeight:600 }}>
                            {totalDelta > 0 ? '+' : ''}{totalDelta} total
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pure SVG score history chart — no recharts */}
                    {pts.length >= 2 && (() => {
                      const W = 320, H = 100, PAD = { t:14, r:8, b:18, l:26 }
                      const scores  = pts.map(p => p.final_score ?? 0)
                      const minS    = Math.max(0,  Math.min(...scores) - 8)
                      const maxS    = Math.min(100, Math.max(...scores) + 8)
                      const rangeS  = maxS - minS || 1
                      const cw      = W - PAD.l - PAD.r
                      const ch      = H - PAD.t - PAD.b

                      const sx = (i) => PAD.l + (i / (pts.length - 1)) * cw
                      const sy = (v) => PAD.t + (1 - (v - minS) / rangeS) * ch

                      const linePath = pts.map((p, i) =>
                        `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p.final_score ?? 0).toFixed(1)}`
                      ).join(' ')

                      // Grade thresholds
                      const thresholds = [{v:85,c:'#22C55E'},{v:70,c:'#86EFAC'},{v:55,c:'#FBBF24'},{v:40,c:'#F97316'}]

                      return (
                        <div style={{ marginBottom:10, overflowX:'auto', maxWidth:520 }}>
                          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block', maxHeight:120 }}>
                            {/* Grid lines at grade thresholds */}
                            {thresholds.filter(t => t.v >= minS && t.v <= maxS).map(t => (
                              <g key={t.v}>
                                <line x1={PAD.l} y1={sy(t.v)} x2={W-PAD.r} y2={sy(t.v)}
                                  stroke={t.c} strokeDasharray="4 3" strokeWidth={0.8} opacity={0.5} />
                                <text x={PAD.l - 3} y={sy(t.v)+3} textAnchor="end"
                                  fill={t.c} fontSize={7} opacity={0.7}>{t.v}</text>
                              </g>
                            ))}

                            {/* Score line */}
                            <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2}
                              strokeLinejoin="round" strokeLinecap="round" />

                            {/* Grade-colored dots + date labels */}
                            {pts.map((p, i) => {
                              const cx = sx(i), cy = sy(p.final_score ?? 0)
                              const col = GRADE_COLOR[p.grade] ?? 'var(--accent)'
                              const showLabel = i === 0 || i === pts.length-1 || pts.length <= 6
                              return (
                                <g key={i}>
                                  <circle cx={cx} cy={cy} r={3} fill={col}
                                    stroke="var(--surface)" strokeWidth={1.5} />
                                  {showLabel && (
                                    <text x={cx} y={H - 4} textAnchor="middle"
                                      fill="var(--txt-muted)" fontSize={7} fontFamily="var(--mono)">
                                      {new Date(p.analysis_date).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                                    </text>
                                  )}
                                  {/* Score label on dot — only show for first/last/grade changes */}
                                  {(i === 0 || i === pts.length - 1 || (i > 0 && pts[i].grade !== pts[i-1].grade)) && (
                                    <text x={cx} y={cy - 7} textAnchor="middle"
                                      fill={col} fontSize={6.5} fontWeight="700" fontFamily="var(--mono)">
                                      {p.final_score}
                                    </text>
                                  )}
                                </g>
                              )
                            })}
                          </svg>
                          {hasUpside && (
                            <div style={{ display:'flex', gap:12, fontSize:8, color:'var(--txt-muted)',
                              fontFamily:'var(--mono)', marginTop:2, paddingLeft:PAD.l }}>
                              <span style={{ color:'var(--accent)' }}>── Conviction score</span>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Single snapshot message */}
                    {pts.length === 1 && (
                      <div style={{ fontSize:10, color:'var(--txt-muted)', marginBottom:8 }}>
                        First snapshot: {new Date(pts[0].analysis_date).toLocaleDateString('en-US', { month:'long', day:'numeric' })} · Check back after next analysis
                      </div>
                    )}

                    {/* Component week-over-week deltas */}
                    {prev && (
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:9, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>
                          Week-over-week components
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
                          {COMP_KEYS.map(c => {
                            const curr = latest[c.key] ?? 0
                            const old  = prev[c.key]  ?? 0
                            const d    = Math.round((curr - old) * 10) / 10
                            return (
                              <div key={c.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:10, gap:4 }}>
                                <span style={{ color:'var(--txt-muted)' }}>{c.label}</span>
                                <span style={{ fontFamily:'var(--mono)', color: d > 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--txt-muted)', fontWeight: d !== 0 ? 700 : 400 }}>
                                  {d > 0 ? '+' : ''}{d !== 0 ? d : '—'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Recent snapshots table */}
                    {pts.length >= 2 && (
                      <div>
                        <div style={{ fontSize:9, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>
                          Recent snapshots
                        </div>
                        {[...pts].reverse().slice(0, 6).map((p, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:9 }}>
                            <span style={{ color:'var(--txt-muted)', fontFamily:'var(--mono)', width:52, flexShrink:0 }}>
                              {new Date(p.analysis_date).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                            </span>
                            <span style={{ fontFamily:'var(--mono)', fontWeight:700, color:'var(--txt)', width:26 }}>
                              {p.final_score}
                            </span>
                            <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:3, flexShrink:0,
                              background:`${GRADE_COLOR[p.grade] ?? 'var(--txt-muted)'}22`,
                              color: GRADE_COLOR[p.grade] ?? 'var(--txt-muted)' }}>
                              {(p.grade || '').replace('STRONG ', 'S.')}
                            </span>
                            {p.upside_pct != null && (
                              <span style={{ fontFamily:'var(--mono)', color:'var(--green)', marginLeft:'auto' }}>
                                +{p.upside_pct.toFixed(1)}%
                              </span>
                            )}
                            {p.price != null && (
                              <span style={{ fontFamily:'var(--mono)', color:'var(--txt-muted)', marginLeft: p.upside_pct != null ? 8 : 'auto' }}>
                                {fUSD(p.price)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

                            {/* ══ DECISION ENGINE v2 ══ */}
              {decision && (
                <div style={{ background:`${decision.color}18`,
                  border:`1px solid ${decision.color}44`,
                  borderRadius:'var(--radius-lg)', padding:'14px 16px', marginBottom:14 }}>

                  {/* TradePoint View vs Analyst badge row */}
                  <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:decision.color,
                        textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2 }}>
                        TradePoint View
                      </div>
                      <div style={{ fontSize:14, fontWeight:800, color:decision.color, lineHeight:1.2 }}>
                        {decision.action}
                      </div>
                      <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:3, fontStyle:'italic' }}>
                        {decision.driver}
                      </div>
                    </div>
                    {decision.analysts && (
                      <div style={{ flexShrink:0, textAlign:'right' }}>
                        <div style={{ fontSize:9, fontWeight:700, color:'var(--txt-muted)',
                          textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2 }}>
                          Analyst Consensus
                        </div>
                        <div style={{ fontSize:13, fontWeight:700,
                          color: decision.analysts.score>=75?'var(--green)':decision.analysts.score>=50?'var(--amber)':'var(--red)' }}>
                          {decision.analysts.label}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Decision Strength bar */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:9, fontWeight:600, color:'var(--txt-muted)',
                        textTransform:'uppercase', letterSpacing:'0.06em' }}>Decision Strength</span>
                      <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700, color:decision.color }}>
                        {decision.strength}% · {decision.strengthLabel}
                      </span>
                    </div>
                    <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${decision.strength}%`,
                        background:decision.color, borderRadius:2, transition:'width 0.3s' }} />
                    </div>
                  </div>

                  {/* Investment Phase cycle */}
                  {decision.phase && (() => {
                    const PHASES = ['Avoidance','Monitoring','Selective Accumulation','Accumulation','Holding','Distribution']
                    const cur = decision.phase
                    return (
                      <div style={{ display:'flex', alignItems:'center', gap:3, marginBottom:10,
                        overflowX:'auto', paddingBottom:2 }}>
                        {PHASES.map((p, i) => {
                          const active = p===cur || (cur==='Monitoring'&&p==='Monitoring')
                          return (
                            <React.Fragment key={p}>
                              <div style={{
                                fontSize:9, padding:'2px 6px', borderRadius:3, fontWeight:700,
                                whiteSpace:'nowrap', flexShrink:0,
                                background: active?decision.color:'transparent',
                                color: active?'#fff':'var(--txt-muted)',
                                border:`1px solid ${active?decision.color:'var(--border)'}`,
                              }}>{p}</div>
                              {i<PHASES.length-1 && <span style={{fontSize:9,color:'var(--border)',flexShrink:0}}>›</span>}
                            </React.Fragment>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Because — grouped Engine / Market / Risk */}
                  {decision.because && (
                    <div style={{ marginBottom:10 }}>
                      {[
                        {label:'TradePoint Engines', items: decision.because.engine ?? []},
                        {label:'Market', items: decision.because.market ?? []},
                        {label:'Risk',   items: decision.because.risk   ?? []},
                      ].filter(g => g.items.length > 0).map(group => (
                        <div key={group.label} style={{ marginBottom:6 }}>
                          <div style={{ fontSize:9, fontWeight:700, color:'var(--txt-muted)',
                            textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>
                            {group.label}
                          </div>
                          {group.items.map((b, i) => (
                            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:5,
                              fontSize:10, color:'var(--txt)', marginBottom:2 }}>
                              <span style={{ color:b.ok?'var(--green)':'var(--red)',
                                fontWeight:700, flexShrink:0 }}>{b.ok?'✓':'✗'}</span>
                              {b.text}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* To upgrade / To downgrade */}
                  {decision.conditions?.conds?.length > 0 && (
                    <div style={{ borderTop:`1px solid ${decision.color}33`, paddingTop:8 }}>
                      <div style={{ fontSize:9, fontWeight:600, color:'var(--txt-muted)',
                        textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>
                        {decision.conditions.label}
                      </div>
                      {decision.conditions.conds.map((c, i) => (
                        <div key={i} style={{ fontSize:10, color:'var(--txt-muted)',
                          marginBottom:3, display:'flex', gap:6 }}>
                          <span style={{
                            color:decision.conditions.direction==='upgrade'?'var(--green)':'var(--amber)',
                            flexShrink:0 }}>
                            {decision.conditions.direction==='upgrade'?'↑':'→'}
                          </span>
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ══ POINTS TO NEXT GRADE ══ */}
              {(() => {
                const GRADE_THRESHOLDS = [
                  { min:85, label:'STRONG BUY', color:'#22C55E' },
                  { min:70, label:'BUY',        color:'#86EFAC' },
                  { min:55, label:'HOLD',        color:'#FBBF24' },
                  { min:40, label:'SELL',        color:'#F97316' },
                  { min:0,  label:'STRONG SELL', color:'#EF4444' },
                ]
                const next = GRADE_THRESHOLDS.find(g => g.min > result.finalScore)
                if (!next) return null
                const pts = next.min - result.finalScore
                return (
                  <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'8px 12px',
                    marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:11, color:'var(--txt-muted)' }}>
                      Next grade: <span style={{ color:next.color, fontWeight:700 }}>{next.label}</span>
                    </span>
                    <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color:next.color }}>
                      +{pts} pts needed
                    </span>
                  </div>
                )
              })()}

              {/* ══ SUB-SCORE BREAKDOWN (computed from fundamentals) ══ */}
              {f && (() => {
                const sRev = v => v==null?null : v>25?8:v>=15?6:v>=10?4:v>=0?2:0
                const sFCF = v => v==null?null : v>20?5:v>=10?3:v>=0?2:0
                const sROI = v => v==null?null : v>20?8:v>=15?6:v>=10?4:v>=8?2:0
                const sNM  = v => v==null?null : v>25?7:v>=15?5:v>=10?3:v>=0?1:0
                const sGM  = v => v==null?null : v>60?5:v>=40?3:v>=20?2:0
                const col  = (s,m) => s==null?'var(--border)' : s>=m*0.6?'var(--green)':s>=m*0.3?'var(--amber)':'var(--red)'

                const Row = ({label, val, s, m}) => s==null?null:(
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                    <span style={{ fontSize:9, color:'var(--txt-muted)', width:80, textAlign:'right', flexShrink:0 }}>{label}</span>
                    <span style={{ fontSize:9, color:'var(--txt-sec)', width:56, textAlign:'right', fontFamily:'var(--mono)', flexShrink:0 }}>{val}</span>
                    <div style={{ flex:1, height:3, background:'var(--border)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${Math.min((s/m)*100,100)}%`, background:col(s,m), borderRadius:2 }} />
                    </div>
                    <span style={{ fontSize:9, fontFamily:'var(--mono)', color:col(s,m), width:28, textAlign:'right', flexShrink:0 }}>{s}/{m}</span>
                  </div>
                )

                const bestROI = Math.max(f.roic??-Infinity, f.roi??-Infinity, f.roe??-Infinity)
                const deS = f.debtToEquity==null?null:f.debtToEquity<=0.5?5:f.debtToEquity<=1?4:f.debtToEquity<=2?3:f.debtToEquity<=4?1:0
                const crS = f.currentRatio==null?null:f.currentRatio>=2?5:f.currentRatio>=1.5?4:f.currentRatio>=1?3:f.currentRatio>=0.8?1:0
                const icS = f.interestCoverage==null?null:f.interestCoverage>=10?5:f.interestCoverage>=5?4:f.interestCoverage>=3?3:f.interestCoverage>=1?1:0

                return (
                  <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'10px 12px', marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase',
                      letterSpacing:'0.06em', marginBottom:8 }}>Score computation detail</div>

                    {[
                      { label:'↳ Growth',    rows:[
                        {label:'Revenue YoY', val:`+${fPctRaw(f.revenueGrowthYoY)}%`, s:sRev(f.revenueGrowthYoY), m:8},
                        {label:'EPS YoY',     val:`${fPctRaw(f.epsGrowthYoY)}%`,       s:sRev(f.epsGrowthYoY),     m:8},
                        {label:'FCF CAGR',    val:`${fPctRaw(f.fcfGrowth5Y)}%`,         s:sFCF(f.fcfGrowth5Y),      m:5},
                      ]},
                      { label:'↳ Quality',   rows:[
                        {label:'ROE/ROIC',    val:`${isFinite(bestROI)?fPctRaw(bestROI):'—'}%`, s:sROI(isFinite(bestROI)?bestROI:null), m:8},
                        {label:'Net Margin',  val:`${fPctRaw(f.netMargin)}%`,  s:sNM(f.netMargin),  m:7},
                        {label:'Gross Margin',val:`${fPctRaw(f.grossMargin)}%`,s:sGM(f.grossMargin),m:5},
                      ]},
                      !result.breakdown.strength.skipped && { label:'↳ Strength', rows:[
                        {label:'D/E Ratio',    val:`${f.debtToEquity?.toFixed(2)??'—'}`,  s:deS, m:5},
                        {label:'Current Ratio',val:`${f.currentRatio?.toFixed(1)??'—'}`,  s:crS, m:5},
                        {label:'Interest Cov.',val:`${f.interestCoverage?.toFixed(1)??'—'}x`, s:icS, m:5},
                      ]},
                    ].filter(Boolean).map(section => (
                      <div key={section.label} style={{ marginBottom:6 }}>
                        <div style={{ fontSize:9, fontWeight:700, color:'var(--txt-muted)', marginBottom:3, letterSpacing:'0.04em' }}>
                          {section.label}
                        </div>
                        {section.rows.map(r => r.s != null && <Row key={r.label} {...r} />)}
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* ══ SECTION 2: GATES ══ */}
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                {[
                  { label:'Gate 1', g:result.gates.gate1 },
                  { label:'Gate 2', g:result.gates.gate2 },
                ].map(({label, g}) => (
                  <div key={label} style={{
                    flex:1, padding:'8px 12px', borderRadius:'var(--radius)',
                    border:`1px solid ${g.skipped ? 'var(--border)' : g.pass ? 'var(--green)' : 'var(--red)'}`,
                    background: g.skipped ? 'transparent' : g.pass ? 'var(--green-dim)' : 'var(--red-dim)',
                    textAlign:'center',
                  }}>
                    <div style={{ fontSize:10, color:'var(--txt-muted)', marginBottom:2 }}>{label}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700,
                      color: g.skipped ? 'var(--txt-muted)' : g.pass ? 'var(--green)' : 'var(--red)' }}>
                      {g.skipped ? '—' : g.pass ? '✓ PASS' : '✗ FAIL'}
                    </div>
                  </div>
                ))}
              </div>

              {/* ══ SECTION 3: CONSENSUS WALL ST. ══ */}
              {(result.wallStreet.targetMean || result.wallStreet.analysts > 0) && (
                <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius-lg)', padding:'14px', marginBottom:4 }}>
                  <div style={{ fontSize:10, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:600, marginBottom:10 }}>
                    Consensus Wall St.
                  </div>

                  {result.wallStreet.targetMean && (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:700, color:'var(--accent)' }}>
                            {fUSD(result.wallStreet.targetMean)}
                          </div>
                          {result.wallStreet.upside != null && (
                            <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color: result.wallStreet.upside >= 0 ? 'var(--green)' : 'var(--red)', marginTop:2 }}>
                              {result.wallStreet.upside >= 0 ? '▲' : '▼'} {fPct(Math.abs(result.wallStreet.upside))} upside
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign:'right' }}>
                          {result.wallStreet.targetHigh && <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--txt-muted)' }}>H: {fUSD(result.wallStreet.targetHigh)}</div>}
                          {result.wallStreet.targetLow  && <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--txt-muted)' }}>L: {fUSD(result.wallStreet.targetLow)}</div>}
                          <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4 }}>{result.wallStreet.analysts} analysts</div>
                        </div>
                      </div>
                    </>
                  )}

                  {result.wallStreet.analysts > 0 && (
                    <ConsensusBar
                      sb={result.wallStreet.strongBuy} b={result.wallStreet.buy}
                      h={result.wallStreet.hold} s={result.wallStreet.sell}
                      ss={result.wallStreet.strongSell}
                    />
                  )}

                  {result.wallStreet.consecutiveBeats > 0 && (
                    <div style={{ marginTop:10, fontFamily:'var(--mono)', fontSize:12, color:'var(--green)' }}>
                      ✓ {result.wallStreet.consecutiveBeats} consecutive earnings beats
                      {result.wallStreet.lastEpsSurprise != null && (
                        <span style={{ color:'var(--txt-muted)' }}> · Last: {result.wallStreet.lastEpsSurprise >= 0 ? '+' : ''}{result.wallStreet.lastEpsSurprise.toFixed(1)}%</span>
                      )}
                    </div>
                  )}
                </div>
              )}
                </>
              )}

              {activeTab === 'fundamentals' && (
                <>
{/* ══ SECTIONS 4-6: FUNDAMENTALS DETAIL ══ */}
            {isETF && activeTab === 'fundamentals' && (
              <div style={{ padding:'16px', background:'rgba(251,191,36,0.08)', borderRadius:'var(--radius)',
                margin:'12px 0', fontSize:11, color:'var(--amber)', lineHeight:1.6 }}>
                <strong>ETF — {universeInfo?.name}</strong><br />
                ETFs do not have individual company fundamentals (no EPS, P/E, revenue, or margins).
                Use the chart and technical indicators for price analysis.
              </div>
            )}
              {f && (
                <>
                  <SectionHeader icon={TrendingUp} label="Growth" />
                  <Row label="Revenue Growth YoY"  value={fPctRaw(f.revenueGrowthYoY)} color={growthColor(f.revenueGrowthYoY)} />
                  <Row label="Revenue Growth 3Y"   value={fPctRaw(f.revenueGrowth3Y)}  color={growthColor(f.revenueGrowth3Y)} />
                  <Row label="Revenue Growth 5Y"   value={fPctRaw(f.revenueGrowth5Y)}  color={growthColor(f.revenueGrowth5Y)} />
                  <Row label="EPS Growth YoY"      value={fPctRaw(f.epsGrowthYoY)}     color={growthColor(f.epsGrowthYoY)} />
                  <Row label="EPS Growth 3Y"       value={fPctRaw(f.epsGrowth3Y)}      color={growthColor(f.epsGrowth3Y)} />
                  <Row label="EPS Growth 5Y"       value={fPctRaw(f.epsGrowth5Y)}      color={growthColor(f.epsGrowth5Y)} />
                  <Row label="FCF (TTM)"           value={f.fcfTTM ? fBig(f.fcfTTM * 1_000_000) : '—'} />
                  <Row label="FCF CAGR 5Y"         value={fPctRaw(f.fcfGrowth5Y)}      color={growthColor(f.fcfGrowth5Y)} />
                  <Row label="EBITDA CAGR 5Y"      value={fPctRaw(f.ebitdaGrowth5Y)}   color={growthColor(f.ebitdaGrowth5Y)} />

                  <SectionHeader icon={Shield} label="Quality" />
                  <Row label="ROE"              value={fPctRaw(f.roe)}            color={roeColor(f.roe)} />
                  <Row label="ROI (ROIC proxy)" value={fPctRaw(f.roi)}            color={roeColor(f.roi)} />
                  <Row label="Gross Margin"     value={fPctRaw(f.grossMargin)}    color={marginColor(f.grossMargin)} />
                  <Row label="Operating Margin" value={fPctRaw(f.operatingMargin)} color={marginColor(f.operatingMargin)} />
                  <Row label="Net Margin"       value={fPctRaw(f.netMargin)}      color={marginColor(f.netMargin)} />

                  <SectionHeader icon={BarChart2} label="Financial Strength" />
                  <Row label="Debt / Equity"     value={f.debtToEquity != null ? fRatio(f.debtToEquity, 2) : '—'} color={debtColor(f.debtToEquity)} />
                  <Row label="Current Ratio"     value={f.currentRatio != null ? fRatio(f.currentRatio) : '—'}
                    color={f.currentRatio > 1.5 ? 'var(--green)' : f.currentRatio > 1 ? 'var(--amber)' : 'var(--red)'} />
                  <Row label="Interest Coverage" value={f.interestCoverage ? `${fRatio(f.interestCoverage)}×` : '—'}
                    color={f.interestCoverage > 5 ? 'var(--green)' : f.interestCoverage > 2 ? 'var(--amber)' : 'var(--red)'} />

                  <SectionHeader icon={DollarSign} label="Valuation" />
                  <Row label="P/E (TTM)"    value={fMult(f.pe)}          color={peColor(f.pe)} />
                  <Row label="Forward P/E"  value={fMult(f.forwardPE)}   color={peColor(f.forwardPE)} />
                  <Row label="PEG (TTM)"    value={fRatio(f.peg, 2)}     color={pegColor(f.peg)} />
                  <Row label="Forward PEG"  value={fRatio(f.forwardPEG, 2)} color={pegColor(f.forwardPEG)} />
                  <Row label="EV/EBITDA"    value={fMult(f.evEbitda)} />
                  <Row label="EV/FCF"       value={fMult(f.evFcf)} />
                  <Row label="P/FCF"        value={fMult(f.pFcf)} />
                  <Row label="Beta"         value={fRatio(f.beta, 2)}
                    color={f.beta ? (f.beta < 1 ? 'var(--green)' : f.beta < 1.5 ? 'var(--amber)' : 'var(--red)') : 'var(--txt-muted)'} />

                  <SectionHeader icon={TrendingUp} label="Relative Strength vs S&P 500" />
                  {result.technical.relStrength1M != null && <Row label="1 Month"   value={fPctRaw(result.technical.relStrength1M)}  color={rsColor(result.technical.relStrength1M)} />}
                  {result.technical.relStrength3M != null && <Row label="3 Months"  value={fPctRaw(result.technical.relStrength3M)} color={rsColor(result.technical.relStrength3M)} />}
                  {result.technical.relStrength6M != null && <Row label="6 Months"  value={fPctRaw(result.technical.relStrength6M)} color={rsColor(result.technical.relStrength6M)} />}
                  {result.technical.relStrengthWeighted != null && (
                    <Row label="Weighted avg" value={fPctRaw(result.technical.relStrengthWeighted)} color={rsColor(result.technical.relStrengthWeighted)} sub="1M×1 + 3M×2 + 6M×1.5" />
                  )}
                  {result.technical.rsi != null && <Row label="RSI (14)" value={fRatio(result.technical.rsi, 1)}
                    color={result.technical.rsi >= 40 && result.technical.rsi <= 60 ? 'var(--green)' : result.technical.rsi >= 30 && result.technical.rsi <= 70 ? 'var(--amber)' : 'var(--red)'} />}
                  {result.technical.ema200 != null && (
                    <Row label="EMA 200" value={fUSD(result.technical.ema200)}
                      sub={result.technical.aboveEMA200 ? 'Price above EMA ✓' : 'Price below EMA ✗'}
                      color={result.technical.aboveEMA200 ? 'var(--green)' : 'var(--red)'} />
                  )}

                  {/* ── Market Structure: Short Interest + Institutional Ownership ── */}
                  {(result.shortInfo || result.instOwnership) && (
                    <>
                      <SectionHeader icon={BarChart2} label="Market Structure" />
                      <div style={{ fontSize:9, color:'var(--txt-muted)', fontStyle:'italic', marginBottom:6, opacity:0.8 }}>
                        Yahoo Finance · informational only · not used in scoring
                      </div>
                      {/* Shares Short — official FINRA count when available */}
                      {result.shortInfo?.sharesShort != null && (
                        <Row label="Shares Short"
                          value={result.shortInfo.sharesShort > 1e6
                            ? `${(result.shortInfo.sharesShort/1e6).toFixed(1)}M`
                            : `${(result.shortInfo.sharesShort/1e3).toFixed(0)}K`}
                          sub={`${result.shortInfo.source === 'finra' ? 'FINRA official' : 'Yahoo'}${result.shortInfo.settlementDate ? ` · As of ${result.shortInfo.settlementDate}` : ''}`}
                          color="var(--txt)" />
                      )}
                      {result.shortInfo?.shortPercentOfFloat != null
                        ? (
                          <Row label="Short % Float"
                            value={`${result.shortInfo.shortPercentOfFloat.toFixed(1)}%`}
                            sub={`${result.shortInfo.label ?? ''}${result.shortInfo.floatSource ? ` · float: ${result.shortInfo.floatSource}` : ''}`}
                            color={result.shortInfo.label === 'Low' ? 'var(--green)'
                              : result.shortInfo.label === 'High' || result.shortInfo.label === 'Elevated' ? 'var(--amber)'
                              : undefined} />
                        ) : result.shortInfo != null ? (
                          <Row label="Short % Float" value="Unavailable" sub="Float data not available" />
                        ) : null}
                      {result.shortInfo?.shortRatio != null && (
                        <Row label="Short Ratio" value={`${result.shortInfo.shortRatio.toFixed(1)}d`} sub="days to cover" />
                      )}
                      {result.shortInfo?.percentChangePrev != null && (
                        <Row label="Change vs Prior"
                          value={`${result.shortInfo.percentChangePrev >= 0 ? '+' : ''}${result.shortInfo.percentChangePrev.toFixed(1)}%`}
                          sub={result.shortInfo.changeTrend ?? 'vs previous FINRA settlement'}
                          color={result.shortInfo.percentChangePrev >= 15 ? 'var(--amber)'
                            : result.shortInfo.percentChangePrev <= -15 ? 'var(--green)' : undefined} />
                      )}
                      {result.shortInfo?.shortPctWarning === 'result_exceeds_100pct' && (
                        <div style={{ fontSize:8, color:'var(--amber)', fontStyle:'italic', marginTop:2, lineHeight:1.5 }}>
                          ⚠ {result.shortInfo?.quality?.note ?? 'Short interest exceeds reported float. Verify underlying data.'}
                        </div>
                      )}
                      {result.instOwnership?.pct != null && (
                        <Row label="Institutional Own."
                          value={`${result.instOwnership.pct.toFixed(1)}%`}
                          sub="Latest 13F filing — may be 45d+ stale" />
                      )}
                    </>
                  )}

                  <SectionHeader icon={Clock} label="Data Freshness" />
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <FreshnessRow label="Fundamentals (90d TTL)" freshness={freshness} />
                    <button onClick={recompute} title="Force-refresh fundamentals"
                      style={{ padding:'3px 10px', borderRadius:'var(--radius)', fontSize:10,
                        border:'1px solid var(--border)', background:'transparent',
                        cursor:'pointer', color:'var(--txt-muted)', flexShrink:0 }}>
                      ↻ Refresh
                    </button>
                  </div>
                  {freshness && freshness.daysLeft < 14 && (
                    <div style={{ fontSize:10, color:'var(--amber)', padding:'4px 8px',
                      background:'var(--amber-dim)', borderRadius:'var(--radius)', marginBottom:6 }}>
                      ⚠ Cache expires soon — consider refreshing before earnings
                    </div>
                  )}
                  {result.wallStreet?.nextEarnings && (() => {
                    const daysToEarnings = Math.round((new Date(result.wallStreet.nextEarnings) - Date.now()) / 86400000)
                    if (daysToEarnings > 0 && daysToEarnings <= 21) {
                      return (
                        <div style={{ fontSize:10, color:'var(--accent)', padding:'4px 8px',
                          background:'var(--accent-dim)', borderRadius:'var(--radius)', marginBottom:6 }}>
                          📅 Earnings in {daysToEarnings}d — refresh fundamentals after the report for updated data
                        </div>
                      )
                    }
                    return null
                  })()}
                  <div style={{ marginTop:6, fontSize:11, color:'var(--txt-muted)', lineHeight:1.6 }}>
                    Sources: Finnhub (growth · quality · strength · valuation · consensus · earnings · RS)
                    + Alpaca (OHLCV → EMA · RSI · Relative Strength)
                  </div>
                                    {/* News moved to Market Intel tab */}

                  <div style={{ marginTop:8, fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>
                    Sector profile: {result.sectorProfile} · Conviction model: TradePoint v1.0
                  </div>
                </>
              )}
              </>
            )}

              {activeTab === 'market' && (
                <div style={{padding:'4px 0'}}>
                  {miLoading && <div style={{textAlign:'center',padding:'32px 0',color:'var(--txt-muted)'}}>Analyzing market narrative…</div>}
                  {!miLoading && !marketIntel && (
                    <div style={{textAlign:'center',padding:'32px 0'}}>
                      <button onClick={()=>{setMiLoading(true);workerAPI.marketIntelligence(ticker).then(r=>setMarketIntel(r?.data??null)).catch(()=>setMarketIntel(null)).finally(()=>setMiLoading(false))}}
                        style={{padding:'8px 20px',borderRadius:'var(--radius)',border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'var(--accent)',fontSize:12,fontWeight:600}}>
                        Generate Market Intelligence
                      </button>
                    </div>
                  )}
                  {!miLoading && marketIntel && (
                    <div>
                      <div style={{background:'var(--surface-up)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'12px 14px',marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <div>
                            <div style={{fontSize:9,fontWeight:700,color:'var(--txt-muted)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:2}}>Market vs Model</div>
                            <div style={{fontSize:14,fontWeight:800,color:'var(--accent)'}}>{marketIntel.marketVsModel?.status??'—'}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:9,color:'var(--txt-muted)'}}>Sentiment</div>
                            <div style={{fontSize:12,fontWeight:700,color:'var(--txt)'}}>{marketIntel.narrative?.sentiment??'—'}</div>
                          </div>
                        </div>
                        {marketIntel.marketVsModel?.reason&&<div style={{fontSize:10,color:'var(--txt-sec)',fontStyle:'italic'}}>{marketIntel.marketVsModel.reason}</div>}
                      </div>
                      {marketIntel.narrative?.summary&&(
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:9,fontWeight:700,color:'var(--txt-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Market Narrative · {marketIntel.sourcesUsed??0} sources</div>
                          <p style={{fontSize:11,color:'var(--txt)',lineHeight:1.7,margin:0}}>{marketIntel.narrative.summary}</p>
                        </div>
                      )}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                        <div>
                          <div style={{fontSize:9,fontWeight:700,color:'var(--green)',marginBottom:4,textTransform:'uppercase'}}>Positive</div>
                          {(marketIntel.drivers?.positive??[]).map((d,i)=><div key={i} style={{display:'flex',gap:5,fontSize:10,color:'var(--txt)',marginBottom:4,lineHeight:1.4}}><span style={{color:'var(--green)',flexShrink:0}}>✓</span>{d}</div>)}
                        </div>
                        <div>
                          <div style={{fontSize:9,fontWeight:700,color:'var(--red)',marginBottom:4,textTransform:'uppercase'}}>Headwinds</div>
                          {(marketIntel.drivers?.negative??[]).map((d,i)=><div key={i} style={{display:'flex',gap:5,fontSize:10,color:'var(--txt)',marginBottom:4,lineHeight:1.4}}><span style={{color:'var(--red)',flexShrink:0}}>✗</span>{d}</div>)}
                        </div>
                      </div>
                      {(marketIntel.headlines??[]).length > 0 && (
                        <div>
                          <div style={{fontSize:9,fontWeight:700,color:'var(--txt-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Headlines</div>
                          {(showAllHeadlines ? (marketIntel.headlines??[]) : (marketIntel.headlines??[]).slice(0,5)).map((h,i)=>(
                            <a key={i} href={h.url||'#'} target="_blank" rel="noopener noreferrer"
                              style={{display:'block',padding:'7px 8px',marginBottom:4,background:'var(--surface-up)',borderRadius:'var(--radius)',textDecoration:'none'}}
                              onMouseEnter={e=>e.currentTarget.style.background='var(--surface-hov)'}
                              onMouseLeave={e=>e.currentTarget.style.background='var(--surface-up)'}>
                              <div style={{fontSize:10,color:'var(--txt)',lineHeight:1.4}}>{h.headline}</div>
                              <div style={{fontSize:9,color:'var(--txt-muted)',marginTop:2}}>{h.source}</div>
                            </a>
                          ))}
                          {(marketIntel.headlines??[]).length > 5 && (
                            <button onClick={()=>setShowAllHeadlines(s=>!s)}
                              style={{width:'100%',padding:'6px',marginTop:4,
                                border:'1px solid var(--border)',borderRadius:'var(--radius)',
                                background:'transparent',cursor:'pointer',fontSize:10,
                                color:'var(--accent)',fontWeight:600}}>
                              {showAllHeadlines
                                ? '▲ Show less'
                                : `▼ Show all ${(marketIntel.headlines??[]).length} headlines`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'ai' && (
                <>
                  {/* ══ AI ANALYSIS ══ */}
                  <SectionHeader icon={Zap} label="AI Analysis — Groq Llama 3.3 70B" />

                  {/* Model Summary — always shown, fixed from engine */}
                  {(() => {
                    const DIMS = [
                      { name:'Growth',    s:result.breakdown.growth.score,    m:25 },
                      { name:'Quality',   s:result.breakdown.quality.score,   m:20 },
                      { name:'Strength',  s:result.breakdown.strength.score,  m:15 },
                      { name:'Valuation', s:result.breakdown.valuation.score, m:15 },
                      { name:'Technical', s:result.breakdown.technical.score, m:15 },
                    ].filter(d => d.s != null).sort((a,b) => (b.s/b.m)-(a.s/a.m))
                    const best  = DIMS[0]
                    const worst = DIMS[DIMS.length-1]
                    const pct   = d => Math.round((d.s/d.m)*100)
                    const col   = p => p>=65?'var(--green)':p>=40?'var(--amber)':'var(--red)'
                    return (
                      <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'10px 14px', marginBottom:10 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase',
                          letterSpacing:'0.07em', marginBottom:8 }}>Model Summary</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
                          {DIMS.map(d => (
                            <div key={d.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                              <span style={{ fontSize:10, color:'var(--txt-muted)' }}>{d.name}</span>
                              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                <span style={{ fontFamily:'var(--mono)', fontSize:10, fontWeight:700, color:col(pct(d)) }}>{d.s}/{d.m}</span>
                                <span style={{ fontSize:9, color:col(pct(d)) }}>({pct(d)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:'flex', gap:12, fontSize:10, borderTop:'1px solid var(--border)', paddingTop:6 }}>
                          {best  && <span style={{ color:'var(--green)' }}>↑ {best.name}</span>}
                          {worst && <span style={{ color:'var(--red)'   }}>↓ {worst.name}</span>}
                          {result.riskPenalty < 0 && <span style={{ color:'var(--amber)' }}>Risk {result.riskPenalty}</span>}
                          {result.activeGate && <span style={{ color:'var(--amber)' }}>{result.activeGate.toUpperCase()} active</span>}
                          <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontWeight:700,
                            color: result.finalScore >= 70 ? 'var(--green)' : result.finalScore >= 55 ? 'var(--amber)' : 'var(--red)' }}>
                            {result.finalScore}/100 {result.grade}
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  <div style={{ fontSize:11, color:'var(--txt-muted)', fontStyle:'italic',
                    padding:'6px 10px', background:'var(--surface-up)', borderRadius:6,
                    marginBottom:8, textAlign:'center', lineHeight:1.5 }}>
                    AI explains the Conviction Score. It never changes the score itself.
                  </div>

                  {!aiData && !aiLoading && (
                    <button onClick={generateAI} style={{
                      width:'100%', padding:'10px', borderRadius:'var(--radius)',
                      border:'1px dashed var(--border)', background:'transparent',
                      cursor:'pointer', color:'var(--txt-sec)', fontSize:12,
                      fontFamily:'var(--sans)', display:'flex', alignItems:'center',
                      justifyContent:'center', gap:8, transition:'all 0.15s',
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--txt-sec)'}}>
                      <Zap size={13} />
                      Generate Moat · Bear Case · Catalysts
                    </button>
                  )}

                  {aiLoading && (
                    <div style={{ textAlign:'center', padding:'16px 0', color:'var(--txt-muted)', fontSize:12 }}>
                      <div style={{ fontSize:18, marginBottom:8 }}>↻</div>
                      Groq is thinking…
                    </div>
                  )}

                  {aiError && (
                    <div style={{ fontSize:11, color:'var(--red)', padding:'8px', background:'var(--red-dim)', borderRadius:6, marginTop:4 }}>
                      ⚠ {aiError}
                    </div>
                  )}

                  {aiData && (
                    <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:4 }}>
                      {/* Metadata row */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'6px 10px', background:'var(--surface-up)', borderRadius:6,
                        fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>
                        <span>
                          {aiData.fromCache ? '📦 From cache' : '✨ Just generated'}
                          {aiData.generatedAt && (
                            <span style={{ marginLeft:8 }}>
                              {new Date(aiData.generatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                            </span>
                          )}
                        </span>
                        <span>
                          Groq · Llama 3.3-70B
                          {aiData.expiresAt && (
                            <span style={{ marginLeft:6 }}>
                              · {Math.max(0, Math.ceil((aiData.expiresAt - Date.now()) / 86400000))}d left
                            </span>
                          )}
                        </span>
                      </div>

                      {(() => {
                        const DIMS = [
                          { k:'growth',    s:result.breakdown.growth.score,    m:25, label:'Growth'    },
                          { k:'quality',   s:result.breakdown.quality.score,   m:20, label:'Quality'   },
                          { k:'strength',  s:result.breakdown.strength.score,  m:15, label:'Strength'  },
                          { k:'valuation', s:result.breakdown.valuation.score, m:15, label:'Valuation' },
                          { k:'technical', s:result.breakdown.technical.score, m:15, label:'Technical' },
                        ].filter(d => d.s != null)
                        const sorted = [...DIMS].sort((a,b) => (b.s/b.m)-(a.s/a.m))
                        const top3   = sorted.slice(0,3)
                        const bottom2 = sorted.slice(-2)

                        const MiniBar = ({ dims }) => (
                          <div style={{ marginBottom:8 }}>
                            {dims.map(d => {
                              const pct = Math.min((d.s/d.m)*100, 100)
                              const col = pct>=75?'var(--green)':pct>=50?'var(--amber)':'var(--red)'
                              return (
                                <div key={d.k} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                                  <span style={{ fontSize:9, color:'var(--txt-muted)', width:54, textAlign:'right', flexShrink:0 }}>{d.label}</span>
                                  <div style={{ flex:1, height:4, background:'var(--border)', borderRadius:2 }}>
                                    <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:2 }} />
                                  </div>
                                  <span style={{ fontSize:9, fontFamily:'var(--mono)', color:col, width:30, flexShrink:0 }}>{d.s}/{d.m}</span>
                                </div>
                              )
                            })}
                          </div>
                        )

                        return [
                          { key:'moat',      icon:'📊', label:'Why these scores are high', data:aiData.moat,      note:'30d', dims:top3    },
                          { key:'bear',      icon:'📉', label:'Why these scores are low',  data:aiData.bear,      note:'7d',  dims:bottom2 },
                          { key:'catalysts', icon:'🎯', label:'What would move the score', data:aiData.catalysts, note:'7d',  dims:bottom2 },
                        ].map(({ key, icon, label, data, note, dims }) => (
                          <div key={key} style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'10px 12px' }}>
                            <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-sec)', marginBottom:6, display:'flex', justifyContent:'space-between' }}>
                              <span>{icon} {label}</span>
                              <span style={{ fontSize:9, color:'var(--txt-muted)', fontWeight:400 }}>{note} cache</span>
                            </div>
                            <MiniBar dims={dims} />
                            {data?.text ? (
                              <p style={{ fontSize:11, color:'var(--txt)', lineHeight:1.7, margin:0 }}>
                                {data.text}
                              </p>
                            ) : (data?.bullets ?? []).length > 0 ? (
                              <p style={{ fontSize:11, color:'var(--txt)', lineHeight:1.7, margin:0 }}>
                                {data.bullets.join(' ')}
                              </p>
                            ) : (
                              <div style={{ fontSize:11, color:'var(--txt-muted)' }}>No interpretation yet</div>
                            )}
                          </div>
                        ))
                      })()}

                      {/* Disclaimer */}
                      <div style={{ fontSize:10, color:'var(--txt-muted)', textAlign:'center',
                        padding:'8px', background:'var(--surface-up)', borderRadius:6,
                        lineHeight:1.5, fontStyle:'italic' }}>
                        AI commentary complements the quantitative model and does not affect the Conviction Score.
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}


            {activeTab === 'insider' && (
              <div style={{ paddingTop: 4 }}>
                {insiderLoading && (
                  <div style={{ textAlign:'center', padding:'40px 0', color:'var(--txt-muted)', fontSize:12 }}>
                    <div style={{ fontSize:20, marginBottom:8 }}>⟳</div>
                    Fetching SEC EDGAR filings…
                  </div>
                )}
                {insiderError && (
                  <div style={{ padding:'12px', background:'var(--red-dim)', borderRadius:'var(--radius)', fontSize:11, color:'var(--red)' }}>
                    ⚠ {insiderError}
                  </div>
                )}
                {!insiderLoading && !insiderError && !insiderData && (
                  <div style={{ textAlign:'center', padding:'40px 0', color:'var(--txt-muted)', fontSize:12 }}>
                    No insider data loaded yet.
                  </div>
                )}
                {insiderData && (() => {
                  const d = insiderData
                  const fmtM = v => v == null ? '—'
                    : v >= 1e6 ? `$${(v/1e6).toFixed(1)}M`
                    : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K`
                    : `$${v.toFixed(0)}`
                  const classColor = {
                    'Material Insider Buying': 'var(--green)',
                    'Constructive':            'var(--green)',
                    'Neutral':                 'var(--txt-muted)',
                    'Elevated Selling':        'var(--red)',
                  }[d.classification] ?? 'var(--txt-muted)'
                  const classBg = {
                    'Material Insider Buying': 'rgba(34,197,94,0.12)',
                    'Constructive':            'rgba(34,197,94,0.12)',
                    'Neutral':                 'var(--surface-up)',
                    'Elevated Selling':        'rgba(239,68,68,0.12)',
                  }[d.classification] ?? 'var(--surface-up)'
                  const txLabel = {
                    P:'Open-market buy', S:'Open-market sale', A:'Grant/award',
                    D:'Disposition to issuer', F:'Tax withholding', M:'Derivative exercise/conv.',
                    G:'Gift', X:'In-the-money exercise', C:'Conversion', W:'Inheritance',
                  }
                  return (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:'var(--txt)', marginBottom:2 }}>Insider Activity</div>
                          <div style={{ fontSize:10, color:'var(--txt-muted)' }}>Last 90 days · SEC Form 4</div>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:12,
                          background: classBg, color: classColor, border:`1px solid ${classColor}44` }}>
                          {d.classification}
                        </span>
                      </div>
                      {/* Debug diagnostics — collapsible, hidden by default */}
                      {d._debug && (
                        <div style={{ marginBottom:10 }}>
                          <button onClick={() => setShowInsiderDbg(v => !v)} style={{
                            fontSize:9, fontFamily:'var(--mono)', color:'var(--txt-muted)',
                            background:'transparent', border:'none', cursor:'pointer', padding:0,
                            textDecoration:'underline dotted',
                          }}>
                            {showInsiderDbg ? '▲' : '▼'} Data diagnostics
                          </button>
                          {showInsiderDbg && (
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
                              {[
                                { k:'Filings found', v: d._debug.filingsFound },
                                { k:'New parsed',    v: d._debug.newParsed },
                                { k:'Total tx',      v: d._debug.rawTxCount },
                                ...Object.entries(d._debug.codeCounts || {}).map(([c,n]) => ({ k:`Code ${c}`, v:n })),
                                { k:'Classifier',    v: d.classifierVersion || 'insider-v1.0' },
                                ...(d._debug.docsSample?.length ? [{ k:'Docs', v: d._debug.docsSample.join(' | ') }] : []),
                              ].map(({ k, v }) => (
                                <span key={k} style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--txt-muted)',
                                  background:'var(--surface-up)', padding:'2px 6px', borderRadius:4 }}>
                                  {k}: <span style={{ color:'var(--txt-sec)', fontWeight:600 }}>{v}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {d.noActivity ? (
                        <div style={{ padding:'12px', background:'var(--surface-up)', borderRadius:'var(--radius)', marginBottom:12 }}>
                          <div style={{ fontSize:11, color:'var(--txt-muted)', marginBottom: d.hasCompensation ? 8 : 0 }}>
                            No open-market purchases or discretionary sales in the last 90 days.
                          </div>
                          {d.hasCompensation && (
                            <div style={{ fontSize:10, color:'var(--amber)' }}>
                              ↓ Compensation activity found below (RSU vestings, tax withholding, option exercises).
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                            {[
                              { label:'Purchases', value:fmtM(d.purchasesTotal), color:'var(--green)', count:d.purchasesCount },
                              { label:'Sales',     value:fmtM(d.salesTotal),     color:'var(--red)',   count:d.salesCount    },
                              { label:'Net', value:fmtM(Math.abs(d.netTotal)),
                                color:d.netTotal>=0?'var(--green)':'var(--red)', prefix:d.netTotal>=0?'+':'-' },
                            ].map(({ label, value, color, count, prefix }) => (
                              <div key={label} style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'8px 10px' }}>
                                <div style={{ fontSize:9, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{label}</div>
                                <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color }}>{prefix||''}{value}</div>
                                {count!=null && <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:2 }}>{count} tx</div>}
                              </div>
                            ))}
                          </div>
                          {d.keyEvent && (
                            <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'10px 12px', marginBottom:12 }}>
                              <div style={{ fontSize:9, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Most Material Event</div>
                              <div style={{ fontSize:11, fontWeight:700, color:'var(--txt)', marginBottom:2 }}>
                                {d.keyEvent.title} {d.keyEvent.action === 'sold' ? 'sold' : 'bought'}{' '}
                                {d.keyEvent.pctOfHoldings != null
                                  ? `${d.keyEvent.pctOfHoldings}% of direct holdings`
                                  : fmtM(d.keyEvent.value)}
                                {d.keyEvent.exerciseAndSell === 'confirmed' && (
                                  <span style={{ fontSize:9, color:'var(--amber)', marginLeft:6 }}>exercise-and-sell</span>
                                )}
                                {d.keyEvent.exerciseAndSell === 'possible' && (
                                  <span style={{ fontSize:9, color:'var(--amber)', marginLeft:6 }}>possible exercise-and-sell — verify filing</span>
                                )}
                              </div>
                              <div style={{ display:'flex', gap:12, fontSize:10, color:'var(--txt-muted)', flexWrap:'wrap' }}>
                                <span>{d.keyEvent.name}</span>
                                <span>{d.keyEvent.date}</span>
                                <span style={{ fontFamily:'var(--mono)' }}>{fmtM(d.keyEvent.value)}</span>
                              </div>
                              <div style={{ display:'flex', gap:12, marginTop:5, fontSize:10, flexWrap:'wrap' }}>
                                <span>
                                  <span style={{ color:'var(--txt-muted)' }}>10b5-1: </span>
                                  <span style={{ color:d.keyEvent.is10b51?'var(--amber)':'var(--txt-sec)', fontWeight:600 }}>
                                    {d.keyEvent.is10b51 ? 'Yes — pre-scheduled' : 'No'}
                                  </span>
                                </span>
                                {d.keyEvent.pctOfHoldings == null && (
                                  <span style={{ color:'var(--txt-muted)', fontStyle:'italic' }}>
                                    % of holdings unavailable
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {d.someSales10b51 && (
                            <div style={{ fontSize:10, color:'var(--amber)', padding:'6px 10px', background:'rgba(251,191,36,0.08)', borderRadius:'var(--radius)', marginBottom:12, lineHeight:1.5 }}>
                              {d.allSales10b51
                                ? '⚡ All sales are under pre-established 10b5-1 plans — typically not discretionary signals.'
                                : '⚡ Some sales are under 10b5-1 plans. Review individual transactions for context.'}
                            </div>
                          )}
                          {d.recentTransactions?.length > 0 && (
                            <div>
                              <div style={{ fontSize:9, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Recent Transactions</div>
                              {d.recentTransactions.map((tx, i) => (
                                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                                  padding:'6px 0', borderBottom:'1px solid var(--border)', gap:8 }}>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:11, fontWeight:600, color:'var(--txt)', marginBottom:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                      {tx.name}
                                    </div>
                                    <div style={{ fontSize:9, color:'var(--txt-muted)' }}>{tx.title} · {tx.date}</div>
                                  </div>
                                  <div style={{ textAlign:'right', flexShrink:0 }}>
                                    <div style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700,
                                      color:tx.code==='P'?'var(--green)':tx.code==='S'?'var(--red)':'var(--txt-muted)' }}>
                                      {tx.code==='P'?'▲':tx.code==='S'?'▼':'·'} {txLabel[tx.code]||tx.code} {fmtM(tx.value)}
                                    </div>
                                    <div style={{ fontSize:9, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>
                                      {tx.shares?.toLocaleString()} sh{tx.is10b51?' · 10b5-1':''}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {/* Compensation activity — RSU vestings, option exercises, tax withholding */}
                      {d.compensationActivity?.length > 0 && (
                        <div style={{ marginTop: d.noActivity ? 0 : 16 }}>
                          <div style={{ fontSize:9, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
                            Compensation Activity (not counted in classification)
                          </div>
                          {d.compensationActivity.map((tx, i) => (
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                              padding:'5px 0', borderBottom:'1px solid var(--border)', gap:8 }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:10, fontWeight:600, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.name}</div>
                                <div style={{ fontSize:9, color:'var(--txt-muted)' }}>{tx.title} · {tx.date}</div>
                              </div>
                              <div style={{ textAlign:'right', flexShrink:0 }}>
                                <div style={{ fontSize:10, color:'var(--txt-sec)', fontWeight:600 }}>{tx.label}</div>
                                <div style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--txt-muted)' }}>
                                  {tx.shares?.toLocaleString()} sh
                                  {tx.value > 0 ? ` · ${tx.value >= 1e6 ? '$' + (tx.value/1e6).toFixed(1) + 'M' : '$' + (tx.value/1e3).toFixed(0) + 'K'}` : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ marginTop:14, fontSize:9, color:'var(--txt-muted)', lineHeight:1.5 }}>
                        Source: SEC EDGAR Form 4 filings (data.sec.gov). Classification uses only open-market
                        purchases (P) and sales (S). Compensation-related codes (F, M, X, A, D, G) are
                        excluded from totals but displayed separately when reported. Classifier: {d.classifierVersion || 'insider-v1.0'}.
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          <div style={{ height:24 }} />
        </div>
      </div>
    </>
  )
}
