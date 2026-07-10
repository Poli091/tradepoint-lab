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
import { useConviction }           from '../../hooks/useConviction.js'
import { runSwingConviction, getSwingGrade } from '../../conviction/swing/engine.js'
import { computeDecision }                    from '../../conviction/decision/engine.js'
import { useBreakpoint }  from '../../hooks/useBreakpoint.js'
import { POSITIONS }      from '../../data/positions.js'
import { fUSD, fPct, fPctRaw, fMult, fBig, fRatio } from '../../utils/format.js'
import { workerAPI }       from '../../utils/api/worker.js'
import { cache }          from '../../utils/cache.js'

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

  const pos       = POSITIONS.find(p => p.ticker === ticker)
  const f         = result?.fundamentalsData ?? null
  const freshness = cache.infoFund(ticker)

  const [activeTab, setActiveTab] = useState('score')
  const [mode,       setMode]       = useState('long-term')  // 'long-term' | 'swing'

  // Pre-compute alignment value for Decision Engine
  const altResult = useMemo(() => {
    if (!result) return null
    try {
      if (mode === 'long-term') {
        const ohlcv    = result.ohlcv    ?? []
        const spyOhlcv = result.spyOhlcv ?? []
        return runSwingConviction(result.fundamentalsData, ohlcv, spyOhlcv)
      }
      return null  // in swing mode, long-term is already available as the other hook
    } catch { return null }
  }, [result, mode])
  const [aiData,    setAiData]    = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState(null)
  const [news,      setNews]      = useState(null)
  const [marketIntel, setMarketIntel] = useState(null)
  const [miLoading,   setMiLoading]   = useState(false)
  const [scoreHistory, setScoreHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const alignment_ = useMemo(() => {
    if (!result || !altResult) return null
    const ltR = GRADE_RANK_MAP[result.grade]??2, swR = GRADE_RANK_MAP[altResult.grade]??2
    const ceiling   = [100,75,50,25,0][Math.min(Math.abs(ltR-swR),4)]
    const similarity = Math.max(0, 100-Math.abs(result.finalScore-altResult.finalScore))
    return Math.min(similarity, ceiling)
  }, [result, altResult])

  // Compute Decision Engine output (deterministic synthesis)
  const decision = useMemo(() => {
    if (!result) return null
    try {
      return computeDecision(result, altResult, alignment_)
    } catch { return null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, altResult])

  // Always compute swing for alignment display (uses cached OHLCV, no extra API calls)
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
  }, [activeTab, result]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-load news when fundamentals tab opens
  useEffect(() => {
    if (activeTab === 'fundamentals' && !news && ticker) {
      workerAPI.news(ticker)
        .then(r => setNews(r?.data ?? []))
        .catch(() => setNews([]))
    }
  }, [activeTab, ticker]) // eslint-disable-line react-hooks/exhaustive-deps // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {!embedded && <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:149, background:'rgba(0,0,0,0.3)' }} />}

      <div style={embedded ? {
        flex:1, display:'flex', flexDirection:'column', minWidth:0,
      } : {
        position:'fixed', top:0, right:0,
        width: isMobile ? '100vw' : 440,
        height:'100vh',
        background:'var(--surface)',
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
        zIndex:150, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.4)',
      }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 16px', borderBottom:'1px solid var(--border)',
          flexShrink:0, background:'var(--surface)', position:'sticky', top:0, zIndex:10 }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color:'var(--txt)' }}>{ticker}</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{pos?.name}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {/* Alignment Score v2 — agreement as ceiling, strategy phrase */}
            {mode === 'long-term' && altResult && result && (() => {
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
                  title={`LT: ${result.finalScore} (${result.grade}) · SW: ${altResult.finalScore} (${altResult.grade}) · Ceiling: ${ceiling}% · Similarity: ${similarity}%`}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center',
                    padding:'4px 10px', borderRadius:6, marginRight:6,
                    background:`${color}15`, border:`1px solid ${color}44`,
                    cursor:'default', minWidth:76 }}>
                  <div style={{ fontSize:13, fontWeight:800, color, lineHeight:1.1 }}>
                    {alignment}%
                  </div>
                  <div style={{ fontSize:9.5, color, fontWeight:700,
                    whiteSpace:'nowrap', marginTop:2, textAlign:'center' }}>
                    {matrixLabel}
                  </div>
                  <div style={{ fontSize:9, color:'var(--txt-muted)',
                    whiteSpace:'nowrap', marginTop:1, textAlign:'center', fontStyle:'italic' }}>
                    {strategy}
                  </div>
                </div>
              )
            })()}

            {/* Mode toggle */}
            <div style={{ display:'flex', background:'var(--surface-up)', borderRadius:6,
              border:'1px solid var(--border)', overflow:'hidden', marginRight:4 }}>
              {[['long-term','Long-Term'],['swing','Swing']].map(([m,label]) => (
                <button key={m} onClick={() => { setMode(m); recompute() }} style={{
                  padding:'4px 10px', border:'none', cursor:'pointer', fontSize:10, fontWeight:700,
                  background: mode===m ? 'var(--accent)' : 'transparent',
                  color:      mode===m ? '#fff'           : 'var(--txt-muted)',
                  transition:'all 0.12s',
                }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={recompute} disabled={loading}
              style={{ width:32, height:32, borderRadius:'var(--radius)', border:'1px solid var(--border)',
                background:'transparent', cursor:loading?'wait':'pointer',
                color:loading?'var(--accent)':'var(--txt-muted)',
                display:'flex', alignItems:'center', justifyContent:'center',
                animation:loading?'tp-spin 1s linear infinite':'none' }}>
              <RotateCcw size={14} />
            </button>
            {!embedded && (
              <button onClick={onClose}
                style={{ width:32, height:32, borderRadius:'var(--radius)', border:'1px solid var(--border)',
                  background:'transparent', cursor:'pointer', color:'var(--txt-muted)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                <X size={14} />
              </button>
            )}
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
{/* ══ SECTION 1: CONVICTION SCORE ══ */}
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

              {/* ══ SCORE HISTORY ══ */}
              {(() => {
                if (historyLoading) return (
                  <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'12px 14px',
                    marginBottom:10, fontSize:11, color:'var(--txt-muted)' }}>
                    Loading score history…
                  </div>
                )
                if (!scoreHistory || scoreHistory.length === 0) return (
                  <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'12px 14px',
                    marginBottom:10, fontSize:11, color:'var(--txt-muted)' }}>
                    No snapshots yet — first snapshot runs next Sunday via Cron.
                  </div>
                )

                // Chronological order (oldest first for chart)
                const pts = [...scoreHistory].reverse()
                const latest = pts[pts.length - 1]
                const prev   = pts[pts.length - 2]
                const first  = pts[0]
                const delta  = latest && first ? (latest.score ?? 0) - (first.score ?? 0) : 0
                const weekDelta = latest && prev ? (latest.score ?? 0) - (prev.score ?? 0) : null

                // Component deltas (latest vs previous)
                const COMP_KEYS = [
                  { key:'growth_score',    label:'Growth',    max:25 },
                  { key:'quality_score',   label:'Quality',   max:20 },
                  { key:'strength_score',  label:'Strength',  max:15 },
                  { key:'valuation_score', label:'Valuation', max:15 },
                  { key:'technical_score', label:'Technical', max:15 },
                ]

                return (
                  <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:10 }}>
                    {/* Header */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)',
                        textTransform:'uppercase', letterSpacing:'0.06em' }}>
                        Score History · {pts.length} snapshot{pts.length !== 1 ? 's' : ''}
                      </div>
                      <div style={{ display:'flex', gap:12, fontSize:11 }}>
                        {weekDelta !== null && (
                          <span style={{ color: weekDelta > 0 ? 'var(--green)' : weekDelta < 0 ? 'var(--red)' : 'var(--txt-muted)', fontWeight:700 }}>
                            {weekDelta > 0 ? '↑' : weekDelta < 0 ? '↓' : '→'} {weekDelta > 0 ? '+' : ''}{weekDelta} this week
                          </span>
                        )}
                        {pts.length > 1 && (
                          <span style={{ color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--txt-muted)', fontWeight:600 }}>
                            {delta > 0 ? '+' : ''}{delta} total
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Chart */}
                    {pts.length >= 2 && (() => {
                      const scores = pts.map(p => p.score ?? 0)
                      const minS   = Math.max(0, Math.min(...scores) - 5)
                      const maxS   = Math.min(100, Math.max(...scores) + 5)
                      const W = 280, H = 52
                      const x = i => (i / (pts.length - 1)) * W
                      const y = s => H - ((s - minS) / (maxS - minS)) * H

                      // Grade color for latest point
                      const latestColor = result.grade === 'STRONG BUY' ? '#22C55E'
                        : result.grade === 'BUY' ? '#86EFAC'
                        : result.grade === 'HOLD' ? '#FBBF24'
                        : result.grade === 'SELL' ? '#F97316' : '#EF4444'

                      return (
                        <div style={{ marginBottom:10, overflowX:'auto' }}>
                          <svg width={W} height={H + 16} style={{ display:'block' }}>
                            {/* Grade threshold lines */}
                            {[{v:85,c:'#22C55E'},{v:70,c:'#86EFAC'},{v:55,c:'#FBBF24'},{v:40,c:'#F97316'}]
                              .filter(t => t.v > minS && t.v < maxS)
                              .map(t => (
                                <line key={t.v} x1={0} y1={y(t.v)} x2={W} y2={y(t.v)}
                                  stroke={t.c} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.4} />
                              ))}

                            {/* Score line */}
                            {pts.slice(1).map((p, i) => (
                              <line key={i}
                                x1={x(i)} y1={y(pts[i].score ?? 0)}
                                x2={x(i+1)} y2={y(p.score ?? 0)}
                                stroke="var(--accent)" strokeWidth={1.5} />
                            ))}

                            {/* Data points */}
                            {pts.map((p, i) => (
                              <g key={i}>
                                <circle cx={x(i)} cy={y(p.score ?? 0)}
                                  r={i === pts.length-1 ? 4 : 2.5}
                                  fill={i === pts.length-1 ? latestColor : 'var(--surface)'}
                                  stroke={i === pts.length-1 ? latestColor : 'var(--accent)'}
                                  strokeWidth={1.5} />
                                {i === 0 || i === pts.length-1 ? (
                                  <text x={x(i)} y={y(p.score ?? 0) - 7}
                                    textAnchor={i === 0 ? 'start' : 'end'}
                                    fontSize={8} fill="var(--txt-muted)">
                                    {p.score}
                                  </text>
                                ) : null}
                              </g>
                            ))}

                            {/* Date labels */}
                            {[0, pts.length-1].map(i => (
                              <text key={i} x={x(i)} y={H + 13}
                                textAnchor={i === 0 ? 'start' : 'end'}
                                fontSize={8} fill="var(--txt-muted)">
                                {new Date(pts[i].snapshot_date).toLocaleDateString('en-US', {month:'short', day:'numeric'})}
                              </text>
                            ))}
                          </svg>
                        </div>
                      )
                    })()}

                    {/* Component deltas (latest vs previous) */}
                    {prev && (
                      <div>
                        <div style={{ fontSize:9, fontWeight:600, color:'var(--txt-muted)',
                          textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>
                          Week-over-week component change
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                          {COMP_KEYS.map(c => {
                            const curr = latest[c.key] ?? 0
                            const old  = prev[c.key] ?? 0
                            const d    = curr - old
                            return (
                              <div key={c.key} style={{ display:'flex', alignItems:'center',
                                justifyContent:'space-between', fontSize:10, gap:4 }}>
                                <span style={{ color:'var(--txt-muted)' }}>{c.label}</span>
                                <span style={{ fontFamily:'var(--mono)',
                                  color: d > 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--txt-muted)',
                                  fontWeight: d !== 0 ? 700 : 400 }}>
                                  {d > 0 ? '+' : ''}{d !== 0 ? d : '—'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Single snapshot message */}
                    {pts.length === 1 && (
                      <div style={{ fontSize:10, color:'var(--txt-muted)' }}>
                        First snapshot: {new Date(pts[0].snapshot_date).toLocaleDateString('en-US', {month:'long', day:'numeric'})}
                        · Next update Sunday
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

                  <SectionHeader icon={Clock} label="Data Freshness" />
                  <FreshnessRow label="Fundamentals (90d TTL)" freshness={freshness} />
                  <div style={{ marginTop:10, fontSize:11, color:'var(--txt-muted)', lineHeight:1.6 }}>
                    Sources: Finnhub (growth · quality · strength · valuation · consensus · earnings · RS)
                    + FMP (Consensus Wall St. target)
                    + Alpaca (OHLCV → EMA · RSI · Relative Strength)
                  </div>
                  {/* ── NEWS ── */}
                  {news && news.length > 0 && (
                    <>
                      <SectionHeader icon={TrendingUp} label="Recent News" />
                      {news.map((item, i) => {
                        const date = new Date(item.datetime * 1000)
                        const daysAgo = Math.floor((Date.now() - date) / 86400000)
                        const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`
                        return (
                          <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                            style={{ display:'block', marginBottom:8, textDecoration:'none',
                              padding:'8px 10px', borderRadius:6, background:'var(--surface-up)',
                              transition:'background 0.1s', cursor:'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background='var(--surface-hov)'}
                            onMouseLeave={e => e.currentTarget.style.background='var(--surface-up)'}>
                            <div style={{ fontSize:11, color:'var(--txt)', lineHeight:1.5, marginBottom:3 }}>
                              {item.headline}
                            </div>
                            <div style={{ display:'flex', gap:8, fontSize:10, color:'var(--txt-muted)' }}>
                              <span>{item.source}</span>
                              <span>·</span>
                              <span>{timeLabel}</span>
                            </div>
                          </a>
                        )
                      })}
                    </>
                  )}

                  <div style={{ marginTop:8, fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>
                    Sector profile: {result.sectorProfile} · Conviction model: TradePoint v1.0
                  </div>

                </>
              )}
                  {/* ── NEWS ── */}
                  {news && news.length > 0 && (
                    <>
                      <SectionHeader icon={TrendingUp} label="Recent News" />
                      {news.map((item, i) => {
                        const date = new Date(item.datetime * 1000)
                        const daysAgo = Math.floor((Date.now() - date) / 86400000)
                        const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`
                        return (
                          <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                            style={{ display:'block', marginBottom:8, textDecoration:'none',
                              padding:'8px 10px', borderRadius:6, background:'var(--surface-up)',
                              transition:'background 0.1s', cursor:'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background='var(--surface-hov)'}
                            onMouseLeave={e => e.currentTarget.style.background='var(--surface-up)'}>
                            <div style={{ fontSize:11, color:'var(--txt)', lineHeight:1.5, marginBottom:3 }}>
                              {item.headline}
                            </div>
                            <div style={{ display:'flex', gap:8, fontSize:10, color:'var(--txt-muted)' }}>
                              <span>{item.source}</span>
                              <span>·</span>
                              <span>{timeLabel}</span>
                            </div>
                          </a>
                        )
                      })}
                    </>
                  )}

                  <div style={{ marginTop:8, fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>
                    Sector profile: {result.sectorProfile} · Conviction model: TradePoint v1.0
                  </div>
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
                      <div style={{fontSize:9,fontWeight:700,color:'var(--txt-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Headlines</div>
                      {(marketIntel.headlines??[]).slice(0,6).map((h,i)=>(
                        <a key={i} href={h.url||'#'} target="_blank" rel="noopener noreferrer"
                          style={{display:'block',padding:'7px 8px',marginBottom:4,background:'var(--surface-up)',borderRadius:'var(--radius)',textDecoration:'none'}}>
                          <div style={{fontSize:10,color:'var(--txt)',lineHeight:1.4}}>{h.headline}</div>
                          <div style={{fontSize:9,color:'var(--txt-muted)',marginTop:2}}>{h.source}</div>
                        </a>
                      ))}
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

          <div style={{ height:24 }} />
        </div>
      </div>
    </>
  )
}
