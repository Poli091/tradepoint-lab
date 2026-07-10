/**
 * MODULE: VIEWS / PortfolioInsightsView.jsx
 * Portfolio-level analytics: grade distribution, sector concentration,
 * score vs upside correlation, risk metrics.
 */

import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, ReferenceLine,
} from 'recharts'
import { calcPnL } from '../utils/finance.js'
import { fUSD, fPct } from '../utils/format.js'
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
      const g  = cv?.grade ?? getGrade(p.conviction ?? 0).label
      gradeCounts[g]    = (gradeCounts[g] ?? 0) + 1
      gradePositions[g] = [...(gradePositions[g] ?? []), p.ticker]
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

  if (!stats) return (
    <div style={{ padding:16, color:'var(--txt-muted)', fontSize:13 }}>
      No positions loaded. Add positions to see portfolio insights.
    </div>
  )

  const gradeBarData = Object.entries(GRADE_CONFIG)
    .map(([g, cfg]) => ({ name: cfg.short, count: stats.gradeCounts[g] ?? 0, color: cfgrade.color, full: g }))
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

        {/* ── Grade distribution ── */}
        <Section title="Grade distribution">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={gradeBarData} barSize={28}>
              <XAxis dataKey="name" tick={{ fontSize:10, fill:'var(--txt-muted)' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background:'var(--surface-up)', border:'1px solid var(--border)', borderRadius:6, fontSize:11 }}
                formatter={(val, name, props) => [
                  `${val} position${val !== 1 ? 's' : ''}`,
                  props.payload.full,
                ]}
              />
              <Bar dataKey="count" radius={[4,4,0,0]}>
                {gradeBarData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Grade pills */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
            {Object.entries(GRADE_CONFIG).map(([g, cfg]) => {
              const tickers = stats.gradePositions[g]
              if (!tickers?.length) return null
              return (
                <div key={g} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:cfgrade.color, flexShrink:0 }} />
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

        {/* ── Score vs Upside scatter ── */}
        <Section title="Score vs analyst upside">
          <div style={{ fontSize:10, color:'var(--txt-muted)', marginBottom:8 }}>
            Top-right = best candidates (high score + high upside)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ScatterChart margin={{ top:5, right:20, bottom:20, left:0 }}>
              <XAxis dataKey="score" name="Score" type="number" domain={[0,100]}
                tick={{ fontSize:9, fill:'var(--txt-muted)' }} label={{ value:'Conviction', position:'insideBottom', offset:-10, fontSize:9, fill:'var(--txt-muted)' }} />
              <YAxis dataKey="upside" name="Upside" unit="%" type="number"
                tick={{ fontSize:9, fill:'var(--txt-muted)' }} width={35} />
              <ReferenceLine x={70} stroke="var(--green)" strokeDasharray="3 3" strokeWidth={0.8} />
              <ReferenceLine x={55} stroke="var(--amber)" strokeDasharray="3 3" strokeWidth={0.8} />
              <ReferenceLine x={40} stroke="var(--red)" strokeDasharray="3 3" strokeWidth={0.8} />
              <ReferenceLine y={35} stroke="var(--txt-muted)" strokeDasharray="3 3" strokeWidth={0.8} />
              <Tooltip
                cursor={{ strokeDasharray:'3 3' }}
                contentStyle={{ background:'var(--surface-up)', border:'1px solid var(--border)', borderRadius:6, fontSize:11 }}
                formatter={(val, name) => [name === 'Upside' ? `+${val.toFixed(1)}%` : val, name]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.ticker ?? ''}
              />
              <Scatter data={stats.scatterData} fill="var(--accent)">
                {stats.scatterData.map((d, i) => {
                  const gc = GRADE_CONFIG[d.grade]
                  return <Cell key={i} fill={gc?.color ?? 'var(--accent)'} />
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Section>

        {/* ── Best & worst conviction ── */}
        <Section title="Conviction ranking">
          <div style={{ fontSize:10, fontWeight:600, color:'var(--green)', marginBottom:6,
            textTransform:'uppercase', letterSpacing:'0.06em' }}>Highest conviction</div>
          {stats.best.map(p => {
            const cv = convictionResults[p.ticker]
            const gradeConfig  = GRADE_CONFIG[cv?.grade ?? getGrade(p.score).label]
            return (
              <div key={p.ticker} style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color:'var(--txt)' }}>{p.ticker}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, color:'var(--txt-muted)' }}>{p.name}</span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: grade?.color ?? 'var(--txt)' }}>
                    {p.score}
                  </span>
                  <span style={{ fontSize:9, padding:'1px 6px', borderRadius:4, fontWeight:700,
                    background:`${grade?.color}22`, color: grade?.color }}>
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
            const gradeConfig  = GRADE_CONFIG[cv?.grade ?? getGrade(p.score).label]
            return (
              <div key={p.ticker} style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color:'var(--txt)' }}>{p.ticker}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, color:'var(--txt-muted)' }}>{p.name}</span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: grade?.color ?? 'var(--txt)' }}>
                    {p.score}
                  </span>
                  <span style={{ fontSize:9, padding:'1px 6px', borderRadius:4, fontWeight:700,
                    background:`${grade?.color}22`, color: grade?.color }}>
                    {cv?.grade ?? getGrade(p.score).label}
                  </span>
                </div>
              </div>
            )
          })}
        </Section>
      </div>

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
