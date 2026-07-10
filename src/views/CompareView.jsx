/**
 * MODULE: VIEWS / CompareView.jsx
 * Side-by-side comparison of two tickers using the full conviction engine.
 * Distinguishes: Long-Term Edge (LT score) vs Timing Edge (Swing score).
 * No single "winner" — each dimension has its own leader.
 */

import { useState }              from 'react'
import { ArrowLeftRight }        from 'lucide-react'
import { useConviction }         from '../hooks/useConviction.js'
import { runSwingConviction }    from '../conviction/index.js'
import { computeDecision }       from '../conviction/decision/engine.js'
import ConvictionRing            from '../components/ui/ConvictionRing.jsx'

/* ── Constants ───────────────────────────────────────────────── */
const GRADE_COLOR = {
  'STRONG BUY':'#22C55E','BUY':'#86EFAC',
  'HOLD':'#FBBF24','SELL':'#F97316','STRONG SELL':'#EF4444',
}
const gc = g => GRADE_COLOR[g] ?? 'var(--txt-muted)'

const GRADE_RANK_MAP = {'STRONG BUY':4,'BUY':3,'HOLD':2,'SELL':1,'STRONG SELL':0}

const COMPS = [
  { key:'growth',    label:'Growth',    max:25 },
  { key:'quality',   label:'Quality',   max:20 },
  { key:'strength',  label:'Strength',  max:15 },
  { key:'valuation', label:'Valuation', max:15 },
  { key:'technical', label:'Technical', max:15 },
]

/* ── Helpers ─────────────────────────────────────────────────── */
function freshness(result) {
  if (!result?.fetchedAt && !result?.meta?.fetchedAt) return null
  const ts = result.fetchedAt ?? result.meta?.fetchedAt
  if (!ts) return null
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins/60)}h ago`
  return `${Math.round(mins/1440)}d ago`
}

function staleWarning(rA, rB) {
  const tsA = rA?.fetchedAt ?? rA?.meta?.fetchedAt ?? 0
  const tsB = rB?.fetchedAt ?? rB?.meta?.fetchedAt ?? 0
  const diffH = Math.abs(tsA - tsB) / 3600000
  return diffH > 6
}

/* ── Ticker input ────────────────────────────────────────────── */
function TickerInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6))}
      placeholder={placeholder}
      style={{
        width:'100%', padding:'10px 14px', fontFamily:'var(--mono)',
        fontSize:18, fontWeight:800, letterSpacing:'0.04em', textAlign:'center',
        background:'var(--surface-up)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-lg)', color:'var(--txt)', outline:'none',
      }}
      onFocus={e=>e.target.style.borderColor='var(--accent)'}
      onBlur={e=>e.target.style.borderColor='var(--border)'}
    />
  )
}

/* ── Single column ───────────────────────────────────────────── */
function TickerColumn({ ticker, result, loading, otherResult, ltEdge, timingEdge }) {
  if (!ticker) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
      color:'var(--txt-muted)',fontSize:12,minHeight:200}}>
      Enter a ticker above
    </div>
  )
  if (loading) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
      color:'var(--txt-muted)',fontSize:12,minHeight:200}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:24,marginBottom:8}}>⟳</div>Running engines…
      </div>
    </div>
  )
  if (!result) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
      color:'var(--txt-muted)',fontSize:12,minHeight:200}}>No data</div>
  )

  // Swing
  let swing = null
  try {
    swing = runSwingConviction(
      result.fundamentalsData, result.ohlcv ?? [], result.spyOhlcv ?? []
    )
  } catch {}

  // Decision
  let decision = null
  try {
    let alignment_ = null
    if (swing) {
      const ltR = GRADE_RANK_MAP[result.grade]??2, swR = GRADE_RANK_MAP[swing.grade]??2
      const ceil = [100,75,50,25,0][Math.min(Math.abs(ltR-swR),4)]
      const sim  = Math.max(0, 100-Math.abs(result.finalScore-swing.finalScore))
      alignment_ = Math.min(sim, ceil)
    }
    decision = computeDecision(result, swing, alignment_)
  } catch {}

  const color = gc(result.grade)
  const fresh = freshness(result)

  return (
    <div style={{flex:1}}>
      {/* Score + edge badges */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',
        padding:'16px 0 12px',borderBottom:'1px solid var(--border)'}}>
        <ConvictionRing score={result.finalScore} grade={result.grade} size={64} />
        <div style={{marginTop:8,display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',justifyContent:'center'}}>
          <span style={{fontSize:11,fontWeight:800,color,padding:'2px 10px',
            background:`${color}18`,borderRadius:'var(--radius)',letterSpacing:'0.04em'}}>
            {result.grade}
          </span>
          {ltEdge && (
            <span style={{fontSize:8,fontWeight:800,color:'var(--green)',
              background:'var(--green-dim)',padding:'2px 6px',borderRadius:'var(--radius)',letterSpacing:'0.04em'}}>
              LT EDGE
            </span>
          )}
          {timingEdge && (
            <span style={{fontSize:8,fontWeight:800,color:'var(--accent)',
              background:'var(--accent-dim)',padding:'2px 6px',borderRadius:'var(--radius)',letterSpacing:'0.04em'}}>
              TIMING EDGE
            </span>
          )}
        </div>
        {fresh && (
          <div style={{fontSize:9,color:'var(--txt-muted)',marginTop:4}}>{fresh}</div>
        )}
        {result.confidence != null && (
          <div style={{fontSize:9,color:'var(--txt-muted)'}}>{result.confidence}% confidence</div>
        )}
      </div>

      {/* Component bars with deltas */}
      <div style={{padding:'10px 0'}}>
        {COMPS.map(c => {
          const score = result.breakdown?.[c.key]?.score ?? 0
          const other = otherResult?.breakdown?.[c.key]?.score ?? 0
          const delta = otherResult ? score - other : 0
          const pct   = Math.min((score/c.max)*100, 100)
          const win   = otherResult && score > other
          const lose  = otherResult && score < other
          const barColor = win?'var(--green)':lose?'var(--red)':'var(--accent)'
          return (
            <div key={c.key} style={{marginBottom:6}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                <span style={{fontSize:9,color:'var(--txt-muted)'}}>{c.label}</span>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--txt)'}}>
                    {score}/{c.max}
                  </span>
                  {otherResult && delta !== 0 && (
                    <span style={{fontSize:9,fontFamily:'var(--mono)',fontWeight:700,
                      color:win?'var(--green)':'var(--red)',minWidth:22,textAlign:'right'}}>
                      {delta>0?'+':''}{delta}
                    </span>
                  )}
                </div>
              </div>
              <div style={{height:5,background:'var(--border)',borderRadius:3}}>
                <div style={{height:'100%',width:`${pct}%`,background:barColor,
                  borderRadius:3,transition:'width 0.3s ease'}} />
              </div>
            </div>
          )
        })}

        {/* Risk penalty */}
        {result.riskPenalty != null && result.riskPenalty !== 0 && (
          <div style={{marginTop:6,padding:'4px 0',borderTop:'1px solid var(--border)',
            display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:9,color:'var(--txt-muted)'}}>Risk Penalty</span>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--red)'}}>
                {result.riskPenalty}
              </span>
              {otherResult?.riskPenalty != null && result.riskPenalty !== otherResult.riskPenalty && (
                <span style={{fontSize:9,fontFamily:'var(--mono)',fontWeight:700,
                  color:result.riskPenalty > otherResult.riskPenalty?'var(--red)':'var(--green)'}}>
                  {result.riskPenalty - otherResult.riskPenalty > 0?'+':''}
                  {result.riskPenalty - otherResult.riskPenalty}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Swing */}
      {swing && (
        <div style={{padding:'8px 0',borderTop:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:9,color:'var(--txt-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>
              Swing
            </span>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontFamily:'var(--mono)',fontSize:13,fontWeight:800,color:gc(swing.grade)}}>
                {swing.finalScore}
              </span>
              <span style={{fontSize:9,fontWeight:700,color:gc(swing.grade),
                padding:'1px 6px',background:`${gc(swing.grade)}18`,borderRadius:'var(--radius)'}}>
                {swing.grade}
              </span>
            </div>
          </div>
          {swing.setup && (
            <div style={{fontSize:9,color:'var(--txt-muted)',marginTop:2}}>{swing.setup}</div>
          )}
        </div>
      )}

      {/* Key metrics */}
      <div style={{padding:'8px 0',borderTop:'1px solid var(--border)'}}>
        {[
          ['Upside',   result.wallStreet?.upside!=null ? `+${result.wallStreet.upside.toFixed(1)}%` : '—'],
          ['Analysts', result.wallStreet?.analysts ?? '—'],
          ['Gate',     result.activeGate || 'None'],
        ].map(([label,val]) => (
          <div key={label} style={{display:'flex',justifyContent:'space-between',
            marginBottom:4,alignItems:'center'}}>
            <span style={{fontSize:9,color:'var(--txt-muted)'}}>{label}</span>
            <span style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--txt)',
              fontWeight:label==='Gate'&&val!=='None'?700:400}}>{val}</span>
          </div>
        ))}
      </div>

      {/* Decision */}
      {decision && (
        <div style={{padding:'8px',background:`${decision.color}14`,
          border:`1px solid ${decision.color}33`,borderRadius:'var(--radius-lg)',marginTop:4}}>
          <div style={{fontSize:9,fontWeight:700,color:decision.color,
            textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Decision</div>
          <div style={{fontSize:11,fontWeight:700,color:'var(--txt)'}}>{decision.action}</div>
          <div style={{fontSize:10,color:'var(--txt-muted)',marginTop:2}}>{decision.phase}</div>
        </div>
      )}
    </div>
  )
}

/* ── Summary block ───────────────────────────────────────────── */
function ComparisonSummary({ tA, tB, rA, rB }) {
  if (!rA || !rB) return null

  // LT Edge
  const ltDelta = rA.finalScore - rB.finalScore
  const ltEdgeTicker  = ltDelta > 0 ? tA : ltDelta < 0 ? tB : null
  const ltEdgeMargin  = Math.abs(ltDelta)

  // Timing Edge (Swing)
  let swA = null, swB = null
  try { swA = runSwingConviction(rA.fundamentalsData, rA.ohlcv??[], rA.spyOhlcv??[]) } catch {}
  try { swB = runSwingConviction(rB.fundamentalsData, rB.ohlcv??[], rB.spyOhlcv??[]) } catch {}
  const swDelta = (swA?.finalScore??0) - (swB?.finalScore??0)
  const timingEdgeTicker = swDelta > 2 ? tA : swDelta < -2 ? tB : null
  const timingMargin = Math.abs(swDelta)

  // Valuation Edge
  const valA = rA.breakdown?.valuation?.score ?? 0
  const valB = rB.breakdown?.valuation?.score ?? 0
  const valDelta = valA - valB
  const valEdgeTicker = Math.abs(valDelta) >= 2 ? (valDelta > 0 ? tA : tB) : null

  // Risk Edge
  const rpA = rA.riskPenalty ?? 0
  const rpB = rB.riskPenalty ?? 0
  const rpDelta = rpA - rpB // more negative = worse
  const riskEdgeTicker = Math.abs(rpDelta) >= 2 ? (rpA > rpB ? tB : tA) : null

  // No clear winner?
  const ltAndTimingSplit = ltEdgeTicker && timingEdgeTicker && ltEdgeTicker !== timingEdgeTicker

  // model_version guard
  if (rA.modelVersion && rB.modelVersion && rA.modelVersion !== rB.modelVersion) {
    return (
      <div style={{padding:'12px 14px',background:'var(--amber-dim)',border:'1px solid var(--amber)',
        borderRadius:'var(--radius-lg)',marginBottom:14,fontSize:11,color:'var(--amber)'}}>
        ⚠ Different scoring methodologies ({rA.modelVersion} vs {rB.modelVersion}) — comparison may not be valid.
      </div>
    )
  }

  const rows = [
    ltEdgeTicker && {
      label: 'Long-Term Edge',
      ticker: ltEdgeTicker,
      detail: `+${ltEdgeMargin} pts · ${ltEdgeTicker === tA ? rA.grade : rB.grade}`,
      color: 'var(--green)',
    },
    timingEdgeTicker && {
      label: 'Timing Edge',
      ticker: timingEdgeTicker,
      detail: `Swing +${timingMargin} pts · ${timingEdgeTicker === tA ? swA?.grade : swB?.grade}`,
      color: 'var(--accent)',
    },
    valEdgeTicker && {
      label: 'Valuation Edge',
      ticker: valEdgeTicker,
      detail: `+${Math.abs(valDelta)} valuation pts`,
      color: 'var(--amber)',
    },
    riskEdgeTicker && {
      label: 'Risk Edge',
      ticker: riskEdgeTicker,
      detail: `${Math.abs(rpDelta)} fewer model penalty pts`,  // model penalties only
      color: 'var(--purple)',
    },
  ].filter(Boolean)

  return (
    <div style={{background:'var(--surface-up)',borderRadius:'var(--radius-lg)',
      border:'1px solid var(--border)',padding:'12px 14px',marginBottom:14}}>
      <div style={{fontSize:9,fontWeight:700,color:'var(--txt-muted)',
        textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>
        Comparison Summary
      </div>

      {rows.map(r => (
        <div key={r.label} style={{display:'flex',justifyContent:'space-between',
          alignItems:'center',marginBottom:7}}>
          <span style={{fontSize:10,color:'var(--txt-muted)'}}>{r.label}</span>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:11,fontWeight:800,fontFamily:'var(--mono)',color:r.color}}>
              {r.ticker}
            </span>
            <span style={{fontSize:9,color:'var(--txt-muted)'}}>· {r.detail}</span>
          </div>
        </div>
      ))}

      {/* Conclusion — 6 deterministic states */}
      {(() => {
        // Thresholds: LT >3 pts = edge, Swing >2 pts = timing edge
        const ltClear     = Math.abs(ltDelta) > 3
        const timingClear = Math.abs(swDelta) > 2
        const ltWinner    = ltEdgeTicker
        const swWinner    = timingEdgeTicker
        const ltLoserColor  = gc(ltWinner === tA ? rB.grade : rA.grade)
        const ltWinnerColor = gc(ltWinner === tA ? rA.grade : rB.grade)

        let line1 = null, line2 = null

        if (ltClear && timingClear && ltWinner !== swWinner) {
          // Split: different leaders
          line1 = <><span style={{color:ltWinnerColor,fontWeight:700}}>{ltWinner}</span> has stronger long-term conviction.</>
          line2 = <><span style={{color:'var(--accent)',fontWeight:700}}>{swWinner}</span> currently offers the better technical entry.</>
        } else if (ltClear && timingClear && ltWinner === swWinner) {
          // Same winner across both
          line1 = <><span style={{color:ltWinnerColor,fontWeight:700}}>{ltWinner}</span> leads across both conviction and timing.</>
        } else if (ltClear && !timingClear) {
          // LT edge, timing comparable
          line1 = <><span style={{color:ltWinnerColor,fontWeight:700}}>{ltWinner}</span> has stronger long-term conviction.</>
          line2 = <span style={{color:'var(--txt-muted)'}}>Current technical timing is comparable.</span>
        } else if (!ltClear && timingClear) {
          // Timing edge, LT comparable
          line1 = <span style={{color:'var(--txt-muted)'}}>Long-term conviction is comparable.</span>
          line2 = <><span style={{color:'var(--accent)',fontWeight:700}}>{swWinner}</span> offers the stronger technical setup.</>
        } else {
          // No clear edge
          line1 = <span style={{color:'var(--txt-muted)'}}>No clear edge — both tickers score closely across all dimensions.</span>
        }

        return (
          <div style={{marginTop:10,paddingTop:8,borderTop:'1px solid var(--border)',
            fontSize:10,color:'var(--txt)',lineHeight:1.7}}>
            <div>{line1}</div>
            {line2 && <div style={{marginTop:2}}>{line2}</div>}
          </div>
        )
      })()}

      {/* Stale data warning */}
      {staleWarning(rA, rB) && (
        <div style={{marginTop:8,fontSize:9,color:'var(--amber)',padding:'4px 8px',
          background:'var(--amber-dim)',borderRadius:'var(--radius)'}}>
          ⚠ Analysis timestamps differ by more than 6h — data freshness may affect comparison.
        </div>
      )}
    </div>
  )
}

/* ── Main view ───────────────────────────────────────────────── */
export default function CompareView() {
  const [tickerA, setTickerA] = useState('')
  const [tickerB, setTickerB] = useState('')
  const [runA, setRunA]       = useState('')
  const [runB, setRunB]       = useState('')

  const { result:resultA, loading:loadingA } = useConviction(runA)
  const { result:resultB, loading:loadingB } = useConviction(runB)

  const handleCompare = () => {
    if (tickerA) setRunA(tickerA)
    if (tickerB) setRunB(tickerB)
  }

  const handleSwap = () => {
    const [a,b] = [tickerA,tickerB]
    setTickerA(b); setTickerB(a)
    setRunA(runB); setRunB(runA)
  }

  // Compute edges for badge display
  const ltDelta  = (resultA?.finalScore??0) - (resultB?.finalScore??0)
  const ltEdgeA  = resultA && resultB && ltDelta > 0
  const ltEdgeB  = resultA && resultB && ltDelta < 0

  let swA = null, swB = null
  try { if (resultA) swA = runSwingConviction(resultA.fundamentalsData, resultA.ohlcv??[], resultA.spyOhlcv??[]) } catch {}
  try { if (resultB) swB = runSwingConviction(resultB.fundamentalsData, resultB.ohlcv??[], resultB.spyOhlcv??[]) } catch {}
  const swDelta      = (swA?.finalScore??0) - (swB?.finalScore??0)
  const timingEdgeA  = resultA && resultB && swDelta > 2
  const timingEdgeB  = resultA && resultB && swDelta < -2

  return (
    <div style={{padding:'16px',maxWidth:720,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
        <ArrowLeftRight size={18} color="var(--accent)" />
        <span style={{fontSize:14,fontWeight:700,color:'var(--txt)'}}>Compare Stocks</span>
      </div>

      {/* Inputs */}
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:14}}>
        <div style={{flex:1}}>
          <TickerInput value={tickerA} onChange={setTickerA} placeholder="NVDA" />
        </div>
        <button onClick={handleSwap} title="Swap tickers"
          style={{width:36,height:36,borderRadius:'var(--radius)',flexShrink:0,
            border:'1px solid var(--border)',background:'var(--surface-up)',
            cursor:'pointer',color:'var(--txt-muted)',display:'flex',
            alignItems:'center',justifyContent:'center'}}>
          <ArrowLeftRight size={14} />
        </button>
        <div style={{flex:1}}>
          <TickerInput value={tickerB} onChange={setTickerB} placeholder="AVGO" />
        </div>
        <button onClick={handleCompare} disabled={!tickerA||!tickerB}
          style={{padding:'10px 18px',borderRadius:'var(--radius)',flexShrink:0,
            border:'none',background:(!tickerA||!tickerB)?'var(--border)':'var(--accent)',
            color:(!tickerA||!tickerB)?'var(--txt-muted)':'#fff',
            cursor:(!tickerA||!tickerB)?'not-allowed':'pointer',
            fontSize:12,fontWeight:700,letterSpacing:'0.03em'}}>
          Compare
        </button>
      </div>

      {/* Summary */}
      {resultA && resultB && (
        <ComparisonSummary tA={runA} tB={runB} rA={resultA} rB={resultB} />
      )}

      {/* Columns */}
      {(runA || runB) && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1,
          background:'var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden'}}>
          <div style={{background:'var(--surface)',padding:'0 14px 14px'}}>
            <div style={{padding:'10px 0 6px',fontFamily:'var(--mono)',fontSize:16,
              fontWeight:800,color:'var(--txt)',letterSpacing:'0.04em'}}>{runA||'—'}</div>
            <TickerColumn ticker={runA} result={resultA} loading={loadingA}
              otherResult={resultB} ltEdge={ltEdgeA} timingEdge={timingEdgeA} />
          </div>
          <div style={{background:'var(--surface)',padding:'0 14px 14px'}}>
            <div style={{padding:'10px 0 6px',fontFamily:'var(--mono)',fontSize:16,
              fontWeight:800,color:'var(--txt)',letterSpacing:'0.04em'}}>{runB||'—'}</div>
            <TickerColumn ticker={runB} result={resultB} loading={loadingB}
              otherResult={resultA} ltEdge={ltEdgeB} timingEdge={timingEdgeB} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!runA && !runB && (
        <div style={{textAlign:'center',padding:'48px 0',color:'var(--txt-muted)'}}>
          <ArrowLeftRight size={32} style={{opacity:0.3,marginBottom:12}} />
          <div style={{fontSize:13}}>Enter two tickers and press Compare</div>
          <div style={{fontSize:11,marginTop:6}}>Runs both conviction engines in parallel</div>
        </div>
      )}
    </div>
  )
}
EOSX
cd /home/claude/tradepoint-dashboard && npm run build 2>&1 | grep -E "error|✓ built" | head -3