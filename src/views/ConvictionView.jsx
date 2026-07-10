/**
 * MODULE: VIEWS / ConvictionView.jsx
 * Diagnostic table showing conviction breakdown for all portfolio positions.
 *
 * Designed for calibration validation — reveals patterns like:
 *  "All growth companies score 3/15 in Valuation"
 *  "Technical is dragging every position down"
 *
 * The other AI's insight: don't adjust weights by intuition.
 * First look at this table, then decide.
 */

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePortfolioConviction } from '../hooks/usePortfolioConviction.js'
import { GRADES } from '../conviction/grade/index.js'

/* ── Mini score bar ─────────────────────────────────────── */
function MiniBar({ score, max }) {
  if (score == null) return <span style={{ color:'var(--txt-muted)', fontSize:11 }}>—</span>
  const pct = Math.min((score / max) * 100, 100)
  const col = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
      <div style={{ width:48, height:5, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:3 }} />
      </div>
      <span style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:600, color:col, minWidth:28, textAlign:'right' }}>
        {score.toFixed(0)}<span style={{ color:'var(--txt-muted)', fontWeight:400 }}>/{max}</span>
      </span>
    </div>
  )
}

/* ── Grade badge ────────────────────────────────────────── */
function GradeBadge({ grade, score, gradeColor, gradeBg }) {
  if (!grade) return null
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
      <span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color:gradeColor }}>{score}</span>
      <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, background:gradeBg, color:gradeColor }}>
        {grade}
      </span>
    </div>
  )
}

export default function ConvictionView({ visiblePositions, prices = {} }) {
  const { results, loading, progress, error, refresh } = usePortfolioConviction(visiblePositions, prices)
  const [sortBy, setSortBy] = useState('finalScore')
  const [sortDir, setSortDir] = useState('desc')

  const rows = visiblePositions
    .map(pos => ({ pos, result: results[pos.ticker] }))
    .filter(({ result }) => result && !result.error)
    .sort((a, b) => {
      const va = a.result?.[sortBy] ?? a.result?.breakdown?.[sortBy]?.score ?? 0
      const vb = b.result?.[sortBy] ?? b.result?.breakdown?.[sortBy]?.score ?? 0
      return sortDir === 'desc' ? vb - va : va - vb
    })

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const ColHdr = ({ col, label, right = true }) => (
    <th onClick={() => handleSort(col)} style={{
      padding:'8px 10px', fontSize:10, fontWeight:600, color: sortBy === col ? 'var(--accent)' : 'var(--txt-muted)',
      textTransform:'uppercase', letterSpacing:'0.06em', cursor:'pointer', userSelect:'none',
      textAlign: right ? 'right' : 'left', whiteSpace:'nowrap', background:'none', border:'none',
    }}>
      {label}{sortBy === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )

  const done    = Object.keys(results).length
  const total   = visiblePositions.length
  const allDone = done >= total

  return (
    <div style={{ padding:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:700, color:'var(--txt)', marginBottom:4 }}>
            Conviction Overview
          </h1>
          <div style={{ fontSize:12, color:'var(--txt-muted)' }}>
            Full breakdown for calibration · click any column to sort
          </div>
        </div>
        <button onClick={refresh} disabled={loading} style={{
          display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
          borderRadius:'var(--radius)', border:'1px solid var(--border)', background:'transparent',
          color:'var(--txt-sec)', cursor:loading ? 'wait' : 'pointer', fontSize:12,
        }}>
          <RefreshCw size={13} style={{ animation: loading ? 'tp-spin 1s linear infinite' : 'none' }} />
          {loading ? `Computing ${done}/${total}…` : 'Recompute all'}
        </button>
      </div>

      <style>{`@keyframes tp-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Progress bar */}
      {loading && (
        <div style={{ marginBottom:14 }}>
          <div style={{ height:3, background:'var(--border)', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'var(--accent)', borderRadius:2, transition:'width 0.3s' }} />
          </div>
          <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:5 }}>
            Fetching fundamentals + OHLCV + computing…  {progress}%
          </div>
        </div>
      )}

      {error && (
        <div style={{ background:'var(--red-dim)', border:'1px solid var(--red)', borderRadius:'var(--radius)', padding:'10px 14px', marginBottom:14, fontSize:12, color:'var(--red)' }}>
          ⚠ {error}
        </div>
      )}

      {/* Diagnostic table */}
      {rows.length > 0 && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Ticker</th>
                  <ColHdr col="finalScore"  label="Score" />
                  <ColHdr col="confidence"  label="Conf." />
                  <ColHdr col="growth"      label="Growth /25" />
                  <ColHdr col="quality"     label="Quality /20" />
                  <ColHdr col="strength"    label="Strength /15" />
                  <ColHdr col="valuation"   label="Valuation /15" />
                  <ColHdr col="technical"   label="Technical /15" />
                  <th style={{ padding:'8px 10px', fontSize:10, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'right' }}>Risk</th>
                  <th style={{ padding:'8px 10px', fontSize:10, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center' }}>Gates</th>
                  <th style={{ padding:'8px 10px', fontSize:10, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'right' }}>Val. metric</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ pos, result: r }) => (
                  <tr key={pos.ticker} style={{ borderBottom:'1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hov)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Ticker */}
                    <td style={{ padding:'10px 12px', minWidth:120 }}>
                      <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--txt)' }}>{pos.ticker}</div>
                      <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{pos.name}</div>
                    </td>
                    {/* Score + Grade */}
                    <td style={{ padding:'10px 10px', textAlign:'right', whiteSpace:'nowrap' }}>
                      <GradeBadge grade={r.grade} score={r.finalScore} gradeColor={r.gradeColor} gradeBg={r.gradeBg} />
                    </td>
                    {/* Confidence */}
                    <td style={{ padding:'10px 10px', textAlign:'right' }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:12, color: r.confidence >= 80 ? 'var(--green)' : r.confidence >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                        {r.confidence}%
                      </span>
                    </td>
                    {/* Dimension bars */}
                    <td style={{ padding:'10px 10px' }}><MiniBar score={r.breakdown.growth.score}    max={25} /></td>
                    <td style={{ padding:'10px 10px' }}><MiniBar score={r.breakdown.quality.score}   max={20} /></td>
                    <td style={{ padding:'10px 10px' }}><MiniBar score={r.breakdown.strength.score}  max={15} /></td>
                    <td style={{ padding:'10px 10px' }}><MiniBar score={r.breakdown.valuation.score} max={15} /></td>
                    <td style={{ padding:'10px 10px' }}><MiniBar score={r.breakdown.technical.score} max={15} /></td>
                    {/* Risk */}
                    <td style={{ padding:'10px 10px', textAlign:'right' }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:12, color: r.riskPenalty < 0 ? 'var(--red)' : 'var(--txt-muted)' }}>
                        {r.riskPenalty === 0 ? '—' : r.riskPenalty}
                      </span>
                    </td>
                    {/* Gates */}
                    <td style={{ padding:'10px 10px', textAlign:'center', whiteSpace:'nowrap' }}>
                      <span style={{ fontSize:11, color: r.gates.gate1.pass ? 'var(--green)' : 'var(--red)' }}>G1:{r.gates.gate1.pass ? '✓' : '✗'}</span>
                      {' '}
                      <span style={{ fontSize:11, color: r.gates.gate2.skipped ? 'var(--txt-muted)' : r.gates.gate2.pass ? 'var(--green)' : 'var(--red)' }}>
                        G2:{r.gates.gate2.skipped ? '—' : r.gates.gate2.pass ? '✓' : '✗'}
                      </span>
                      {r.activeGate && <div style={{ fontSize:9, color:'var(--amber)' }}>cap {r.gateCap}</div>}
                    </td>
                    {/* Valuation metric used */}
                    <td style={{ padding:'10px 10px', textAlign:'right', whiteSpace:'nowrap' }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--txt-muted)' }}>
                        {r.breakdown.valuation.metric ?? '—'}
                        {r.breakdown.valuation.value != null ? ` ${r.breakdown.valuation.value.toFixed(1)}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          {allDone && rows.length > 0 && (
            <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:24, flexWrap:'wrap' }}>
              {['growth','quality','strength','valuation','technical'].map(dim => {
                const vals = rows.map(r => r.result?.breakdown[dim]?.score).filter(v => v != null)
                const avg  = vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : '—'
                const max  = { growth:25, quality:20, strength:15, valuation:15, technical:15 }[dim]
                const pct  = vals.length ? (parseFloat(avg) / max * 100).toFixed(0) : 0
                return (
                  <div key={dim} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:9, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{dim}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700,
                      color: pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                      {avg}<span style={{ fontSize:10, color:'var(--txt-muted)' }}>/{max}</span>
                    </div>
                    <div style={{ fontSize:9, color:'var(--txt-muted)' }}>avg</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && done === 0 && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--txt-muted)' }}>
          <div style={{ fontSize:24, marginBottom:12 }}>⊞</div>
          <div style={{ fontSize:14 }}>Computing conviction scores…</div>
        </div>
      )}
    </div>
  )
}
