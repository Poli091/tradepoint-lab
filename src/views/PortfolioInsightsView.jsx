/**
 * MODULE: VIEWS / PortfolioInsightsView.jsx
 * Portfolio-level analytics: grade distribution, sector concentration,
 * score vs upside correlation, risk metrics.
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { fUSD, fPct } from '../utils/format.js'
import { workerAPI } from '../utils/api/worker.js'
import { getGrade } from '../conviction/grade/index.js'

// Grade config: color = hex (required for SVG/recharts), cssVar = for JSX style props
const GRADE_CONFIG = {
  'STRONG BUY':  { color:'#22C55E', cssVar:'var(--grade-strong-buy)',  short:'S.BUY'  },
  'BUY':         { color:'#86EFAC', cssVar:'var(--grade-buy)',          short:'BUY'    },
  'HOLD':        { color:'#FBBF24', cssVar:'var(--grade-hold)',         short:'HOLD'   },
  'SELL':        { color:'#F97316', cssVar:'var(--grade-sell)',         short:'SELL'   },
  'STRONG SELL': { color:'#EF4444', cssVar:'var(--grade-strong-sell)',  short:'S.SELL' },
}

/* ── Stat pill ─────────────────────────────────── */
function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', padding:'12px 16px' }}>
      <div style={{ fontSize:10, color:'var(--txt-muted)', textTransform:'uppercase',
        letterSpacing:'0.07em', fontWeight:600, marginBottom:4 }}>{label}</div>
      <div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700,
        color: color ?? 'var(--txt)' }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

/* ── Section header ────────────────────────────── */
function Section({ title, children }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', padding:'16px', marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--txt)', marginBottom:14,
        textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</div>
      {children}
    </div>
  )
}

export default function PortfolioInsightsView({ visiblePositions = [], convictionResults = {}, prices = {} }) {
  const [review,        setReview]        = useState(null)
  const [macro,         setMacro]         = useState(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError,   setReviewError]   = useState(null)
  const [reviewKey,     setReviewKey]     = useState(null)

  const stats = useMemo(() => {
    if (!visiblePositions.length) return null
    const positions = visiblePositions

    /* ── Portfolio totals ── */
    let totalValue = 0, totalCost = 0
    for (const p of positions) {
      totalValue += (p.currentPrice || 0) * (p.qty || 0)
      totalCost  += (p.avgPrice    || 0) * (p.qty || 0)
    }
    const totalGain = totalValue - totalCost

    /* ── Grade distribution ── */
    const gradeCounts = {}
    const gradePositions = {}
    for (const p of positions) {
      const cv = convictionResults[p.ticker]
      const gradeStr  = cv?.grade ?? getGrade(p.conviction ?? 0).label
      gradeCounts[gradeStr]    = (gradeCounts[gradeStr] ?? 0) + 1
      gradePositions[gradeStr] = [...(gradePositions[gradeStr] ?? []), p.ticker]
    }

    /* ── Sector concentration ── */
    const SECTOR_MAP = {
      VST:'Utilities', CEG:'Utilities', NEE:'Utilities',
      NVDA:'Semiconductors', AVGO:'Semiconductors', MU:'Semiconductors',
      META:'Comm. Services', GOOGL:'Comm. Services',
      APP:'Software/AI', PLTR:'Software/AI', NOW:'Software/AI',
      TEAM:'Software/AI', CRM:'Software/AI',
      PODD:'MedTech', ISRG:'MedTech', VRTX:'MedTech',
      AXON:'Defense/Ind.',
      MELI:'Fintech', FICO:'Fintech', V:'Fintech',
    }
    const sectorValue = {}
    for (const p of positions) {
      const sector = SECTOR_MAP[p.ticker] ?? 'Other'
      const val    = (p.currentPrice || 0) * (p.qty || 0)
      sectorValue[sector] = (sectorValue[sector] ?? 0) + val
    }
    const sectorData = Object.entries(sectorValue)
      .map(([name, value]) => ({ name, value, pct: ((value / totalValue) * 100).toFixed(1) }))
      .sort((a, b) => b.value - a.value)

    /* ── Avg conviction (weighted by position value) ── */
    let weightedScoreSum = 0, weightedScoreTotal = 0
    let totalBeta = 0, betaCount = 0
    const scatterData = []

    for (const p of positions) {
      const cv  = convictionResults[p.ticker]
      const val = (p.currentPrice || 0) * (p.qty || 0)
      const score = cv?.finalScore ?? p.conviction ?? null
      const grade = cv?.grade ?? null
      const upside = cv?.wallStreet?.upside ?? p.upside ?? null

      if (score != null) {
        weightedScoreSum   += score * val
        weightedScoreTotal += val
      }

      if (upside != null && score != null) {
        scatterData.push({ ticker: p.ticker, score, upside, grade, val })
      }
    }

    const avgScore = weightedScoreTotal > 0
      ? Math.round(weightedScoreSum / weightedScoreTotal * 10) / 10
      : null
    const avgGrade = avgScore != null ? getGrade(avgScore) : null

    /* ── Best/worst ── */
    const withScores = positions
      .map(p => ({ ...p, score: convictionResults[p.ticker]?.finalScore ?? p.conviction ?? 0 }))
      .filter(p => p.score != null)
      .sort((a, b) => b.score - a.score)

    /* ── Avg upside ── */
    const upsideVals = positions.map(p => convictionResults[p.ticker]?.wallStreet?.upside ?? p.upside).filter(Boolean)
    const avgUpside  = upsideVals.length ? upsideVals.reduce((a,b) => a+b, 0) / upsideVals.length : null

    /* ── Risk signals ── */
    const lowConviction = withScores.filter(p => p.score < 50)
    const highConviction = withScores.filter(p => p.score >= 70)

    return {
      totalValue, totalGain, totalGainPct: totalCost > 0 ? ((totalGain/totalCost)*100) : 0,
      gradeCounts, gradePositions,
      sectorData,
      avgScore, avgGrade,
      avgUpside,
      scatterData,
      best: withScores.slice(0, 3),
      worst: withScores.slice(-3).reverse(),
      lowConviction, highConviction,
      total: positions.length,
    }
  }, [visiblePositions, convictionResults])

  // Build payload from current convictionResults and positions
  // Fetch macro context on mount (24h cached in KV)
  useEffect(() => {
    workerAPI.macro()
      .then(r => { if (r?.data) setMacro(r.data) })
      .catch(() => {})
  }, [])

  const generateReview = useCallback(async () => {
    if (!visiblePositions.length) return
    setReviewLoading(true); setReviewError(null)
    try {
      const SECTOR_MAP = {
        VST:'Utilities',CEG:'Utilities',NEE:'Utilities',
        NVDA:'Semiconductors',AVGO:'Semiconductors',MU:'Semiconductors',
        META:'Comm. Services',GOOGL:'Comm. Services',
        APP:'Software/AI',PLTR:'Software/AI',NOW:'Software/AI',TEAM:'Software/AI',
        PODD:'MedTech',ISRG:'MedTech',VRTX:'MedTech',
        AXON:'Defense',MELI:'Fintech',FICO:'Fintech',
      }
      const totalVal = visiblePositions.reduce((s,p)=>s+(p.currentPrice||0)*(p.qty||0),0)
      const positions = visiblePositions.map(p => {
        const cv = convictionResults[p.ticker]
        const val = (p.currentPrice||0)*(p.qty||0)
        return {
          ticker:   p.ticker,
          weight:   totalVal > 0 ? (val/totalVal)*100 : 0,
          value:    val,
          sector:   SECTOR_MAP[p.ticker] ?? 'Other',
          conviction: cv ? {
            score: cv.finalScore, grade: cv.grade,
            gate:  cv.activeGate || 'none',
            components: {
              growth:    cv.breakdown?.growth?.score,
              quality:   cv.breakdown?.quality?.score,
              strength:  cv.breakdown?.strength?.score,
              valuation: cv.breakdown?.valuation?.score,
              technical: cv.breakdown?.technical?.score,
            },
            riskPenalty: cv.riskPenalty,
          } : null,
          swing:    cv ? { score: null, grade: null } : null,
          decision: cv?.decision?.action ?? null,
          nextEarnings: p.nextEarnings ?? null,
        }
      })

      const res = await workerAPI.portfolioReview({ positions, modelVersion:'conviction-v1.0', macro })
      if (res?.data) {
        setReview(res.data)
        setReviewKey(res.meta?.cacheKey ?? null)
      } else {
        setReviewError('No review data returned')
      }
    } catch(err) {
      setReviewError(err.message)
    } finally {
      setReviewLoading(false)
    }
  }, [visiblePositions, convictionResults])

  if (!stats) return (
    <div style={{ padding:16, color:'var(--txt-muted)', fontSize:13 }}>
      No positions loaded. Add positions to see portfolio insights.
    </div>
  )

  const gradeBarData = Object.entries(GRADE_CONFIG)
    .map(([g, cfg]) => ({ name: cfg.short, count: stats.gradeCounts[g] ?? 0, color: cfg.color, full: g }))
    .filter(d => d.count > 0)

  return (
    <div style={{ padding:16, maxWidth:900 }}>
      <h1 style={{ fontSize:18, fontWeight:700, color:'var(--txt)', margin:'0 0 16px' }}>
        Portfolio Insights
      </h1>

      {/* ── Top stats ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:14 }}>
        <Stat label="Portfolio value" value={fUSD(stats.totalValue)}
          sub={`${stats.totalGain >= 0 ? '+' : ''}${fUSD(stats.totalGain)} all-time`} />
        <Stat label="Total return" value={fPct(stats.totalGainPct)}
          color={stats.totalGainPct >= 0 ? 'var(--green)' : 'var(--red)'} />
        {stats.avgScore != null && (
          <Stat label="Avg conviction" value={`${stats.avgScore}/100`}
            sub={stats.avgGrade?.label} color={stats.avgGrade?.color} />
        )}
        {stats.avgUpside != null && (
          <Stat label="Avg analyst upside" value={`+${stats.avgUpside.toFixed(1)}%`}
            color="var(--green)" />
        )}
        <Stat label="Positions" value={stats.total}
          sub={`${stats.highConviction.length} BUY+ · ${stats.lowConviction.length} SELL-`} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

        {/* ── Grade distribution — CSS bars ── */}
        <Section title="Grade distribution">
          <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:90, marginBottom:8 }}>
            {gradeBarData.map(d => {
              const maxC = Math.max(...gradeBarData.map(x => x.count), 1)
              return (
                <div key={d.name} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <span style={{ fontSize:10, fontFamily:'var(--mono)', fontWeight:700, color:d.color }}>{d.count}</span>
                  <div style={{ width:'100%', height:`${(d.count/maxC)*100}%`, minHeight:4,
                    background:d.color, borderRadius:'3px 3px 0 0' }} />
                  <span style={{ fontSize:9, color:'var(--txt-muted)' }}>{d.name}</span>
                </div>
              )
            })}
          </div>
          {/* Grade pills */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
            {Object.entries(GRADE_CONFIG).map(([g, cfg]) => {
              const tickers = stats.gradePositions[g]
              if (!tickers?.length) return null
              return (
                <div key={g} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:cfg.color, flexShrink:0 }} />
                  <span style={{ fontSize:10, color:'var(--txt-muted)' }}>
                    {cfg.short}: {tickers.join(', ')}
                  </span>
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── Sector concentration ── */}
        <Section title="Sector concentration">
          {stats.sectorData.map(s => (
            <div key={s.name} style={{ marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11,
                color:'var(--txt-sec)', marginBottom:3 }}>
                <span>{s.name}</span>
                <span style={{ fontFamily:'var(--mono)', fontWeight:600 }}>{s.pct}%</span>
              </div>
              <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                <div style={{ height:'100%', width:`${s.pct}%`, background:'var(--accent)',
                  borderRadius:2, transition:'width 0.3s' }} />
              </div>
            </div>
          ))}
        </Section>

        {/* ── Score vs Upside — sortable list ── */}
        {stats.scatterData.length > 0 && (
        <Section title="Score vs analyst upside">
          {[...stats.scatterData].sort((a,b) => b.score - a.score).map(d => {
            const cfg = GRADE_CONFIG[d.grade]
            return (
              <div key={d.ticker} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700,
                  width:46, flexShrink:0, color: cfg?.color ?? 'var(--txt)' }}>{d.ticker}</span>
                <div style={{ flex:1, height:5, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${d.score}%`,
                    background: cfg?.color ?? 'var(--accent)', borderRadius:3 }} />
                </div>
                <span style={{ fontSize:10, fontFamily:'var(--mono)', width:28, textAlign:'right',
                  color:'var(--txt-muted)', flexShrink:0 }}>{d.score}</span>
                {d.upside != null
                  ? <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--green)',
                      width:52, textAlign:'right', flexShrink:0 }}>+{d.upside.toFixed(1)}%</span>
                  : <span style={{ fontSize:10, color:'var(--txt-muted)', width:52,
                      textAlign:'right', flexShrink:0 }}>—</span>}
              </div>
            )
          })}
        </Section>
        )}

        {/* ── Best & worst conviction ── */}
        <Section title="Conviction ranking">
          <div style={{ fontSize:10, fontWeight:600, color:'var(--green)', marginBottom:6,
            textTransform:'uppercase', letterSpacing:'0.06em' }}>Highest conviction</div>
          {stats.best.map(p => {
            const cv = convictionResults[p.ticker]
            const gradeCfg  = GRADE_CONFIG[cv?.grade ?? getGrade(p.score).label]
            return (
              <div key={p.ticker} style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color:'var(--txt)' }}>{p.ticker}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, color:'var(--txt-muted)' }}>{p.name}</span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: gradeCfg?.color ?? 'var(--txt)' }}>
                    {p.score}
                  </span>
                  <span style={{ fontSize:9, padding:'1px 6px', borderRadius:4, fontWeight:700,
                    background:`${gradeCfg?.color}22`, color: gradeCfg?.color }}>
                    {cv?.grade ?? getGrade(p.score).label}
                  </span>
                </div>
              </div>
            )
          })}

          <div style={{ borderTop:'1px solid var(--border)', margin:'10px 0' }} />
          <div style={{ fontSize:10, fontWeight:600, color:'var(--red)', marginBottom:6,
            textTransform:'uppercase', letterSpacing:'0.06em' }}>Lowest conviction</div>
          {stats.worst.map(p => {
            const cv = convictionResults[p.ticker]
            const gradeCfg  = GRADE_CONFIG[cv?.grade ?? getGrade(p.score).label]
            return (
              <div key={p.ticker} style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color:'var(--txt)' }}>{p.ticker}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, color:'var(--txt-muted)' }}>{p.name}</span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: gradeCfg?.color ?? 'var(--txt)' }}>
                    {p.score}
                  </span>
                  <span style={{ fontSize:9, padding:'1px 6px', borderRadius:4, fontWeight:700,
                    background:`${gradeCfg?.color}22`, color: gradeCfg?.color }}>
                    {cv?.grade ?? getGrade(p.score).label}
                  </span>
                </div>
              </div>
            )
          })}
        </Section>
      </div>

      {/* ── Macro Regime ── */}
      {macro && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:'var(--radius-lg)', padding:'14px 16px', marginTop:4 }}>
          {/* Header with version + freshness */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)',
                textTransform:'uppercase', letterSpacing:'0.07em' }}>Macro Regime</span>
              <span style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--txt-muted)',
                marginLeft:8, opacity:0.6 }}>{macro.version}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:800,
                color: macro.computed?.overallRegime === 'Adverse'      ? 'var(--red)'
                     : macro.computed?.overallRegime === 'Restrictive'  ? 'var(--amber)'
                     : macro.computed?.overallRegime === 'Mixed'        ? 'var(--amber)'
                     : macro.computed?.overallRegime === 'Supportive'   ? 'var(--green)'
                     : macro.computed?.overallRegime === 'Accommodative'? 'var(--green)'
                     : macro.computed?.overallRegime === 'Partial Coverage' ? 'var(--txt-muted)'
                     : 'var(--txt)' }}>
                {macro.computed?.overallRegime ?? 'Unknown'}
              </span>
              {macro.fetchedAt && (
                <span style={{ fontSize:9, color:'var(--txt-muted)' }}>
                  Updated {Math.round((Date.now()-macro.fetchedAt)/3600000)}h ago
                </span>
              )}
              {macro.coverage && macro.coverage.status !== 'complete' && (
                <span style={{ fontSize:8, color:'var(--amber)', fontWeight:600 }}>
                  {macro.coverage.available}/{macro.coverage.expected} series
                </span>
              )}
            </div>
          </div>

          {/* Series cards — show date + handle unavailable gracefully */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6, marginBottom:10 }}>
            {[
              { label:'EFFR (Daily)',
                value: macro.series?.effr?.value != null ? `${macro.series.effr.value}%` : 'Unavailable',
                sub:   macro.series?.effr?.date ?? null,
                sub2:  macro.computed?.rateRegime },
              { label:'Target Range',
                value: (macro.series?.tgtLow?.value != null && macro.series?.tgtHigh?.value != null)
                  ? `${macro.series.tgtLow.value}–${macro.series.tgtHigh.value}%` : 'Unavailable',
                sub:   macro.series?.tgtLow?.date ?? null,
                sub2:  'FOMC official' },
              { label:'2Y Treasury',
                value: macro.series?.dgs2?.value  != null ? `${macro.series.dgs2.value}%` : 'Unavailable',
                sub:   macro.series?.dgs2?.date   ?? null },
              { label:'10Y Treasury',
                value: macro.series?.dgs10?.value != null ? `${macro.series.dgs10.value}%` : 'Unavailable',
                sub:   macro.series?.dgs10?.date  ?? null },
              { label:'Yield Curve (10-2)',
                value: macro.series?.spread?.value != null
                  ? `${macro.series.spread.value >= 0 ? '+' : ''}${macro.series.spread.value}%` : 'Unavailable',
                sub:   macro.series?.spread?.date  ?? null,
                sub2:  macro.computed?.curveRegime,
                color: macro.series?.spread?.value != null
                  ? macro.series.spread.value < 0 ? 'var(--amber)' : 'var(--green)' : 'var(--txt-muted)' },
              { label:'Core CPI YoY',
                value: macro.series?.coreInf?.yoy != null ? `${macro.series.coreInf.yoy}%` : 'Unavailable',
                sub:   macro.series?.coreInf?.yoyDate ?? null,
                sub2:  macro.computed?.inflRegime,
                color: macro.series?.coreInf?.yoy >= 4 ? 'var(--red)'
                     : macro.series?.coreInf?.yoy >= 3 ? 'var(--amber)' : 'var(--green)' },
            ].map(({ label, value, sub, sub2, color }) => (
              <div key={label} style={{ background:'var(--surface-up)', borderRadius:'var(--radius)',
                padding:'8px 10px' }}>
                <div style={{ fontSize:9, color:'var(--txt-muted)', marginBottom:3,
                  textTransform:'uppercase', letterSpacing:'0.05em', lineHeight:1.2 }}>{label}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700,
                  color: value === 'Unavailable' ? 'var(--txt-muted)' : (color ?? 'var(--txt)') }}>
                  {value}
                </div>
                {sub && <div style={{ fontSize:8, color:'var(--txt-muted)', marginTop:1 }}>As of {sub}</div>}
                {sub2 && <div style={{ fontSize:8, color:'var(--txt-muted)', opacity:0.8 }}>{sub2}</div>}
              </div>
            ))}
          </div>
          <div style={{ fontSize:9, color:'var(--txt-muted)', fontStyle:'italic' }}>
            Source: FRED (St. Louis Fed) · Regime deterministic · {macro.version}
          </div>
        </div>
      )}

      {/* ── Risk signals ── */}
      {stats.lowConviction.length > 0 && (
        <div style={{ background:'var(--red-dim)', border:'1px solid var(--red)',
          borderRadius:'var(--radius-lg)', padding:'12px 16px', marginTop:4 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--red)', marginBottom:6 }}>
            ⚠ {stats.lowConviction.length} position{stats.lowConviction.length > 1 ? 's' : ''} below 50/100
          </div>
          <div style={{ fontSize:11, color:'var(--txt-sec)' }}>
            {stats.lowConviction.map(p => p.ticker).join(', ')} — consider reviewing these positions
          </div>
        </div>
      )}
    </div>
  )
}
