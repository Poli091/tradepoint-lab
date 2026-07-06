/**
 * MODULE: VIEWS / DiagnosticsView.jsx
 * Model Diagnostics — permanent calibration tool for TradePoint Lab.
 *
 * Four panels:
 *  1. Summary cards — avg score, biggest limiter, gate activations, missing data
 *  2. Sortable breakdown table — every dimension for every position
 *  3. Component impact bars — avg % of max per dimension (reveals calibration bias)
 *  4. Score loss ranking — which component costs most points on average
 *
 * Use this BEFORE adjusting any threshold or weight.
 * If Valuation consistently scores <30% of max across growth companies,
 * that's calibration evidence — not intuition.
 */

import { useState, useMemo } from 'react'
import { RotateCcw, AlertTriangle } from 'lucide-react'
import { useAllConvictions, calcDiagnostics } from '../hooks/useAllConvictions.js'
import { GRADES } from '../conviction/grade/index.js'

/* ── helpers ───────────────────────────────────────────── */
const pct = (score, max) => score != null ? Math.round((score / max) * 100) : null

function pctColor(p) {
  if (p == null) return 'var(--txt-muted)'
  if (p >= 75)   return 'var(--green)'
  if (p >= 50)   return 'var(--amber)'
  return 'var(--red)'
}

function gradeColor(grade) {
  return GRADES.find(g => g.label === grade)?.color ?? 'var(--txt-muted)'
}

/* ── Sub-components ────────────────────────────────────── */
function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', flex:1 }}>
      <div style={{ fontSize:10, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:600, marginBottom:8 }}>{label}</div>
      <div style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:700, color: color ?? 'var(--txt)', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function DimCell({ score, max }) {
  const p = pct(score, max)
  return (
    <td style={{ padding:'8px 10px', textAlign:'right', whiteSpace:'nowrap' }}>
      {p != null ? (
        <div>
          <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, color:pctColor(p) }}>
            {score?.toFixed(0)}<span style={{ color:'var(--txt-muted)', fontWeight:400 }}>/{max}</span>
          </span>
          <div style={{ height:3, background:'var(--border)', borderRadius:2, marginTop:3, width:48, marginLeft:'auto' }}>
            <div style={{ height:'100%', width:`${p}%`, background:pctColor(p), borderRadius:2 }} />
          </div>
        </div>
      ) : (
        <span style={{ color:'var(--txt-muted)', fontSize:12 }}>—</span>
      )}
    </td>
  )
}

/* ═══════════════════════════════════════════════════════
   MAIN VIEW
═══════════════════════════════════════════════════════ */
const SORT_COLS = ['finalScore','growth','quality','strength','valuation','technical','risk','confidence']
const DIMS = [
  { key:'growth',    max:25, label:'Growth'    },
  { key:'quality',   max:20, label:'Quality'   },
  { key:'strength',  max:15, label:'Strength'  },
  { key:'valuation', max:15, label:'Valuation' },
  { key:'technical', max:15, label:'Technical' },
]

export default function DiagnosticsView({ visiblePositions, prices }) {
  const [sortBy,  setSortBy]  = useState('finalScore')
  const [sortDir, setSortDir] = useState('desc')

  const { results, loading, progress, error, recompute } = useAllConvictions(visiblePositions, prices)
  const diag = useMemo(() => calcDiagnostics(results), [results])

  const sorted = useMemo(() => {
    const rows = Object.entries(results).map(([ticker, r]) => ({ ticker, ...r }))
    return rows.sort((a, b) => {
      const getVal = r => {
        if (sortBy === 'growth')    return r.breakdown.growth.score    ?? -1
        if (sortBy === 'quality')   return r.breakdown.quality.score   ?? -1
        if (sortBy === 'strength')  return r.breakdown.strength.score  ?? -1
        if (sortBy === 'valuation') return r.breakdown.valuation.score ?? -1
        if (sortBy === 'technical') return r.breakdown.technical.score ?? -1
        if (sortBy === 'risk')      return r.riskPenalty ?? 0
        if (sortBy === 'confidence')return r.confidence ?? 0
        return r.finalScore ?? 0
      }
      return sortDir === 'desc' ? getVal(b) - getVal(a) : getVal(a) - getVal(b)
    })
  }, [results, sortBy, sortDir])

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const ColH = ({ col, label, align = 'right' }) => (
    <th onClick={() => handleSort(col)} style={{
      padding:'7px 10px', textAlign:align, cursor:'pointer', userSelect:'none', border:'none',
      fontSize:10, fontWeight:600, color: sortBy === col ? 'var(--accent)' : 'var(--txt-muted)',
      textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap', background:'transparent',
    }}>
      {label} {sortBy === col ? (sortDir==='desc'?'↓':'↑') : ''}
    </th>
  )

  const isLoading = loading
  const hasData   = Object.keys(results).length > 0

  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:700, color:'var(--txt)', margin:0 }}>Model Diagnostics</h1>
          <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>
            Calibration tool — use this before adjusting any threshold or weight
          </div>
        </div>
        <button onClick={recompute} disabled={isLoading} style={{
          display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
          borderRadius:8, border:'1px solid var(--border)', background:'transparent',
          cursor: isLoading ? 'wait' : 'pointer', color:'var(--txt-sec)', fontSize:12,
        }}>
          <RotateCcw size={13} style={{ animation: isLoading ? 'tp-spin 1s linear infinite' : 'none' }} />
          {isLoading ? `${progress.done}/${progress.total}…` : 'Recompute all'}
        </button>
      </div>
      <style>{`@keyframes tp-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>

      {/* Error */}
      {error && (
        <div style={{ background:'var(--red-dim)', border:'1px solid var(--red)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--red)', display:'flex', gap:8 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Progress bar */}
      {isLoading && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 16px' }}>
          <div style={{ fontSize:12, color:'var(--txt-sec)', marginBottom:8 }}>
            Computing conviction scores… {progress.done}/{progress.total}
          </div>
          <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
            <div style={{ height:'100%', borderRadius:2, background:'var(--accent)', transition:'width 0.3s',
              width: progress.total > 0 ? `${(progress.done/progress.total)*100}%` : '0%' }} />
          </div>
        </div>
      )}

      {hasData && diag && (
        <>
          {/* ═══ PANEL 1: SUMMARY CARDS ═══ */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12 }}>
            <SummaryCard label="Avg conviction score" value={`${diag.avgScore}/100`}
              sub={`${diag.tickerCount} positions analyzed`} />
            <SummaryCard label="Biggest limiter"
              value={diag.rankingByLimit[0]?.label ?? '—'}
              sub={`avg ${diag.rankingByLimit[0]?.avgPct?.toFixed(0)}% of max`}
              color="var(--red)" />
            <SummaryCard label="Gate activations"
              value={`G1: ${diag.gate1Count}  G2: ${diag.gate2Count}`}
              sub={`${diag.gate1Count + diag.gate2Count} total caps applied`}
              color={diag.gate1Count + diag.gate2Count > 0 ? 'var(--amber)' : 'var(--green)'} />
            <SummaryCard label="Missing data fields"
              value={diag.nullFieldsTotal}
              sub="across all positions"
              color={diag.nullFieldsTotal > 10 ? 'var(--amber)' : 'var(--green)'} />
          </div>

          {/* ═══ PANEL 2: BREAKDOWN TABLE ═══ */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>Full breakdown table</span>
              <span style={{ fontSize:11, color:'var(--txt-muted)', marginLeft:8 }}>Click headers to sort · bars show % of max</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:780 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    <ColH col="ticker"     label="Ticker"    align="left" />
                    <ColH col="finalScore" label="Score"     />
                    <th style={{ padding:'7px 10px', fontSize:10, color:'var(--txt-muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.06em', background:'transparent' }}>Grade</th>
                    <ColH col="growth"    label="Growth/25"    />
                    <ColH col="quality"   label="Quality/20"   />
                    <ColH col="strength"  label="Strength/15"  />
                    <ColH col="valuation" label="Valuation/15" />
                    <ColH col="technical" label="Technical/15" />
                    <ColH col="risk"      label="Risk"         />
                    <th style={{ padding:'7px 10px', fontSize:10, color:'var(--txt-muted)', textAlign:'right', textTransform:'uppercase', letterSpacing:'0.06em', background:'transparent' }}>Gate</th>
                    <ColH col="confidence" label="Conf."       />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => {
                    const bd = r.breakdown
                    const gColor = gradeColor(r.grade)
                    return (
                      <tr key={r.ticker} style={{ borderBottom:'1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--surface-hov)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        <td style={{ padding:'8px 10px', fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--txt)' }}>{r.ticker}</td>
                        <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color:gColor }}>{r.finalScore}</td>
                        <td style={{ padding:'8px 10px' }}>
                          <span style={{ fontSize:11, fontWeight:600, color:gColor, background:`${gColor}18`, padding:'2px 8px', borderRadius:4 }}>{r.grade}</span>
                        </td>
                        <DimCell score={bd.growth.score}    max={25} />
                        <DimCell score={bd.quality.score}   max={20} />
                        <DimCell score={bd.strength.skipped ? null : bd.strength.score} max={15} />
                        <DimCell score={bd.valuation.score} max={15} />
                        <DimCell score={bd.technical.score} max={15} />
                        <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12, fontWeight:600, color: r.riskPenalty < 0 ? 'var(--red)' : 'var(--txt-muted)' }}>
                          {r.riskPenalty < 0 ? r.riskPenalty : '0'}
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'right' }}>
                          {r.activeGate
                            ? <span style={{ fontSize:10, color:'var(--amber)', background:'var(--amber-dim)', padding:'2px 6px', borderRadius:4 }}>{r.activeGate.toUpperCase()}</span>
                            : <span style={{ fontSize:10, color:'var(--green)' }}>✓</span>}
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12, color:'var(--txt-sec)' }}>{r.confidence}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ PANELS 3 & 4: SIDE BY SIDE ═══ */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

            {/* Panel 3: Component impact bars */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', marginBottom:4 }}>Component efficiency</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginBottom:14 }}>Average % of max across all positions</div>
              {diag.dimStats.map(d => (
                <div key={d.key} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:12, color:'var(--txt-sec)', fontWeight:500 }}>{d.label}</span>
                    <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color:pctColor(d.avgPct) }}>
                      {d.avgPct != null ? `${d.avgPct.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                  <div style={{ height:8, background:'var(--border)', borderRadius:4 }}>
                    <div style={{ height:'100%', borderRadius:4, background:pctColor(d.avgPct), width:`${d.avgPct ?? 0}%`, transition:'width 0.5s ease' }} />
                  </div>
                  <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:3 }}>
                    avg {d.avgLoss?.toFixed(1)} pts left on table · {d.n} positions
                  </div>
                </div>
              ))}
            </div>

            {/* Panel 4: Score loss ranking */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', marginBottom:4 }}>Score loss ranking</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginBottom:14 }}>Which component costs most — investigate lowest first</div>
              {diag.rankingByLimit.map((d, i) => (
                <div key={d.key} style={{
                  display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:8, marginBottom:6,
                  background: i === 0 ? 'var(--red-dim)' : i === 1 ? 'var(--amber-dim)' : 'var(--surface-up)',
                  border: `1px solid ${i === 0 ? 'var(--red)' : i === 1 ? 'var(--amber)' : 'var(--border)'}`,
                }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:16, fontWeight:700, color: i===0?'var(--red)':i===1?'var(--amber)':'var(--txt-muted)', minWidth:20 }}>#{i+1}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--txt)' }}>{d.label}</div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)' }}>avg {d.avgLoss?.toFixed(1)} pts lost · {d.avgPct?.toFixed(0)}% efficiency</div>
                  </div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color:pctColor(d.avgPct) }}>
                    {d.avgPct?.toFixed(0)}%
                  </div>
                </div>
              ))}

              {/* Grade distribution */}
              <div style={{ marginTop:16, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                <div style={{ fontSize:11, color:'var(--txt-muted)', marginBottom:8, fontWeight:600 }}>Grade distribution</div>
                {Object.entries(diag.gradeCounts).filter(([,v]) => v > 0).map(([grade, count]) => (
                  <div key={grade} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:12, color:gradeColor(grade) }}>{grade}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ height:6, background:'var(--border)', borderRadius:3, width:60 }}>
                        <div style={{ height:'100%', borderRadius:3, background:gradeColor(grade), width:`${(count/diag.tickerCount)*100}%` }} />
                      </div>
                      <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, color:gradeColor(grade), minWidth:16, textAlign:'right' }}>{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
