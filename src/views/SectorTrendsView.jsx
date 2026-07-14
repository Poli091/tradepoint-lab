/**
 * MODULE: VIEWS / SectorTrendsView.jsx
 * Market Map — three views:
 *  · Trend:    Treemap with Industry Trend Score (RS multi-horizon, median)
 *  · Rotation: Table classifying Strengthening / Weakening / Reversing
 *  · Balance:  Portfolio industry exposure + diversification opportunities
 *
 * TradePoint Universe only — reflects companies in the universe, not full market.
 * No impact on Conviction, Swing, or any individual ticker scores.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { workerAPI }     from '../utils/api/worker.js'
import { UNIVERSE }      from '../data/tickerUniverse.js'
import { loadOverrides } from '../utils/positionsStorage.js'

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
const sign   = (v, d=1) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`
const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a,b) => a-b), m = Math.floor(s.length/2)
  return s.length % 2 === 0 ? (s[m-1]+s[m])/2 : s[m]
}
const medianAge = (tickers) => {
  const ages = tickers.filter(t => t.date)
    .map(t => (Date.now() - new Date(t.date+'T12:00:00Z').getTime()) / 86_400_000)
  return ages.length ? median(ages) : null
}

const TREND_COLOR = (s, insufficient=false) => {
  if (insufficient)  return '#374151'
  if (s == null)     return 'var(--surface-up)'
  if (s > 8)  return '#16A34A'
  if (s > 3)  return '#22C55E'
  if (s > 0)  return '#86EFAC'
  if (s > -3) return '#FBBF24'
  if (s > -7) return '#F97316'
  return '#EF4444'
}

/* Deterministic rotation classification — industry-rotation-v1.0
   Rules applied as a strict cascade (first match wins):
   Reversals take priority over short-term neutrality.
   model: industry-rotation-v1.0 */
const ROTATION_MODEL = 'industry-rotation-v1.0'
const classifyRotation = (rs1M, rs3M, rs6M) => {
  if (rs1M == null || rs3M == null || rs6M == null)
    return { label:'No data', color:'var(--txt-muted)', emoji:'—' }

  // Priority 1: trend reversals (6M→1M directional flip)
  if (rs6M < -2 && rs1M > 0)
    return { label:'Reversing Up',   color:'#86EFAC', emoji:'⤴' }   // was weak, turning strong
  if (rs6M > 2  && rs1M < 0)
    return { label:'Reversing Down', color:'#F97316', emoji:'⤵' }   // was strong, turning weak

  // Priority 2: short-term neutrality
  if (Math.abs(rs1M) < 2)
    return { label:'Stable',         color:'var(--txt-muted)', emoji:'→' }

  // Priority 3: directional momentum (consistent with short-term signal)
  if (rs1M > rs3M && rs1M > 0)
    return { label:'Strengthening',  color:'#22C55E', emoji:'↗' }
  if (rs1M < rs3M && rs1M < 0)
    return { label:'Weakening',      color:'#EF4444', emoji:'↘' }

  return { label:'Stable', color:'var(--txt-muted)', emoji:'→' }     // fallback
}

/* Industry → tickers mapping from UNIVERSE */
function buildIndustryMap() {
  const groups = {}
  for (const u of UNIVERSE) {
    if (u.type === 'ETF' || u.type === 'ADR' || u.country === 'AR') continue
    const ind = u.industry || u.sector || 'Other'
    if (!groups[ind]) groups[ind] = []
    groups[ind].push(u.ticker)
  }
  return groups
}

/* ══════════════════════════════════════════
   TREEMAP CELL
══════════════════════════════════════════ */
function TCell({ x, y, width, height, name, trendScore, tickerCount, insufficient }) {
  if (!width || !height || width < 4 || height < 4) return null
  const col  = TREND_COLOR(trendScore, insufficient)
  const showName  = width > 70 && height > 30
  const showScore = width > 70 && height > 52
  return (
    <g style={{ cursor:'pointer' }}>
      <rect x={x+1} y={y+1} width={width-2} height={height-2} fill={col} rx={4} opacity={0.9} />
      {showName && (
        <text x={x+width/2} y={y+height/2-(showScore?10:0)}
          textAnchor="middle" fill="#fff" fontSize={Math.min(12,width/7)}
          fontWeight={700} style={{ userSelect:'none' }}>
          {name.length > 18 && width < 140 ? name.slice(0,16)+'…' : name}
        </text>
      )}
      {showScore && trendScore != null && (
        <text x={x+width/2} y={y+height/2+12}
          textAnchor="middle" fill="#fff" fontSize={Math.min(11,width/8)}
          opacity={0.9} style={{ userSelect:'none' }}>
          {sign(trendScore)} · {tickerCount}co
        </text>
      )}
    </g>
  )
}

/* ══════════════════════════════════════════
   INDUSTRY SIDE PANEL (ticker list)
══════════════════════════════════════════ */
function IndustryPanel({ industry, onClose, onSelectTicker }) {
  return (
    <div style={{ width:280, flexShrink:0, borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column', background:'var(--surface)', overflowY:'auto' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{industry.name}</div>
          <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:2 }}>
            {industry.dataCount}/{industry.tickerCount} analyzed
            {industry.medianAge != null && ` · median ${Math.round(industry.medianAge)}d old`}
          </div>
        </div>
        <button onClick={onClose} style={{ background:'transparent', border:'none',
          cursor:'pointer', color:'var(--txt-muted)', fontSize:16 }}>✕</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
        {[...industry.tickers]
          .sort((a,b) => (b.trendScore??-999)-(a.trendScore??-999))
          .map(t => (
          <button key={t.ticker} onClick={() => onSelectTicker(t.ticker)}
            style={{ width:'100%', padding:'9px 16px', border:'none', background:'transparent',
              cursor:'pointer', textAlign:'left', borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', gap:10 }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--surface-up)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, width:40, flexShrink:0,
              color: t.trendScore>0?'var(--green)':t.trendScore<0?'var(--red)':'var(--txt)' }}>
              {t.ticker}
            </span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, color:'var(--txt)', fontWeight:600 }}>RS {sign(t.trendScore)}</div>
              <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:1 }}>
                {t.rs1M!=null?`1M ${sign(t.rs1M)}`:''}
                {t.rs3M!=null?` · 3M ${sign(t.rs3M)}`:''}
              </div>
            </div>
            {t.grade && (
              <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:3, flexShrink:0,
                background: t.grade==='STRONG BUY'?'#22C55E22':t.grade==='BUY'?'#86EFAC22':'#FBBF2422',
                color:      t.grade==='STRONG BUY'?'#22C55E'  :t.grade==='BUY'?'#86EFAC'  :'#FBBF24' }}>
                {t.grade?.replace('STRONG ','S.')}
              </span>
            )}
          </button>
        ))}
        {industry.tickers.length === 0 && (
          <div style={{ padding:20, fontSize:11, color:'var(--txt-muted)', textAlign:'center' }}>
            No conviction data. Run Scanner on these tickers first.
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   ROTATION TABLE VIEW
══════════════════════════════════════════ */
function RotationView({ industries, onSelectIndustry }) {
  const [sortCol, setSortCol] = useState('rs1M')
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    return [...industries]
      .filter(i => !i.insufficient)
      .sort((a, b) => {
        const va = a[sortCol] ?? -999
        const vb = b[sortCol] ?? -999
        return sortDir === 'desc' ? vb - va : va - vb
      })
  }, [industries, sortCol, sortDir])

  const COLS = [
    { key:'name',       label:'Industry',  w:'auto', align:'left'  },
    { key:'rs1M',       label:'RS 1M',     w:70,     align:'right' },
    { key:'rs3M',       label:'RS 3M',     w:70,     align:'right' },
    { key:'rs6M',       label:'RS 6M',     w:70,     align:'right' },
    { key:'rotation',   label:'Momentum',  w:140,    align:'left'  },
  ]

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
      <div style={{ fontSize:11, color:'var(--txt-muted)', marginBottom:12 }}>
        Rotation = momentum direction inferred from RS 1M vs 3M vs 6M vs SPY.
        Deterministic — no model assumptions about inter-industry relationships.
      </div>

      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr>
            {COLS.map(c => (
              <th key={c.key}
                onClick={() => c.key !== 'rotation' && c.key !== 'name' && handleSort(c.key)}
                style={{ padding:'8px 10px', textAlign: c.align, fontSize:10, fontWeight:700,
                  color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em',
                  borderBottom:'1px solid var(--border)', width: c.w,
                  cursor: c.key !== 'rotation' && c.key !== 'name' ? 'pointer' : 'default',
                  userSelect:'none', whiteSpace:'nowrap' }}>
                {c.label} {sortCol === c.key ? (sortDir==='desc'?'↓':'↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.every(ind => ind.rs1M == null && ind.rs3M == null && ind.rs6M == null) && (
            <tr><td colSpan={8} style={{ padding:'32px 20px', textAlign:'center', color:'var(--txt-muted)' }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>Rotation data not yet available</div>
              <div style={{ fontSize:11, lineHeight:1.8 }}>
                Rotation requires RS 1M, 3M and 6M for each industry.<br/>
                Trend Map may show scores from the latest available snapshot.<br/>
                Click ↺ Refresh after more OHLCV history has been collected.
              </div>
            </td></tr>
          )}
          {sorted.map((ind, i) => {
            const rot = classifyRotation(ind.rs1M, ind.rs3M, ind.rs6M)
            return (
              <tr key={ind.name}
                onClick={() => onSelectIndustry(ind.name)}
                style={{ cursor:'pointer', background: i%2===0?'transparent':'var(--surface-up)' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--surface-hov)'}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'transparent':'var(--surface-up)'}>
                <td style={{ padding:'9px 10px', fontSize:12, fontWeight:600, color:'var(--txt)',
                  borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
                      background: TREND_COLOR(ind.trendScore) }} />
                    {ind.name}
                    <span style={{ fontSize:9, color:'var(--txt-muted)' }}>
                      {ind.dataCount}/{ind.tickerCount}
                    </span>
                  </div>
                </td>
                {['rs1M','rs3M','rs6M'].map(k => (
                  <td key={k} style={{ padding:'9px 10px', textAlign:'right', fontFamily:'var(--mono)',
                    fontSize:12, fontWeight:600, borderBottom:'1px solid var(--border)',
                    color: ind[k]>0?'var(--green)':ind[k]<0?'var(--red)':'var(--txt-muted)' }}>
                    {sign(ind[k])}
                  </td>
                ))}
                <td style={{ padding:'9px 10px', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4,
                    background:`${rot.color}22`, color: rot.color }}>
                    {rot.emoji} {rot.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div style={{ padding:40, textAlign:'center', color:'var(--txt-muted)', fontSize:12 }}>
          Run Scanner on tickers first to build the RS dataset.
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════
   PORTFOLIO BALANCE VIEW
══════════════════════════════════════════ */
function BalanceView({ industries }) {
  // loadOverrides reads from localStorage — re-read on mount only
  // (positionSeed from App would require prop drilling; direct read is fine here)
  const [positionsTick, setPositionsTick] = useState(0)
  const positions = useMemo(() => loadOverrides() ?? [], [positionsTick]) // eslint-disable-line

  // Map each position to its industry
  const tickerToIndustry = useMemo(() => {
    const map = {}
    for (const u of UNIVERSE) {
      if (u.type === 'ETF' || u.type === 'ADR' || u.country === 'AR') continue
      map[u.ticker] = u.industry || u.sector || 'Other'
    }
    return map
  }, [])

  // Industry exposure from positions
  const exposure = useMemo(() => {
    const byInd = {}
    let totalValue = 0
    for (const p of positions) {
      const val = (p.currentPrice || p.avgPrice || 0) * (p.qty || 0)
      if (!val) continue
      const ind = tickerToIndustry[p.ticker] || 'Other'
      byInd[ind] = (byInd[ind] || 0) + val
      totalValue += val
    }
    if (!totalValue) return []
    return Object.entries(byInd)
      .map(([ind, val]) => ({ name: ind, value: val, pct: val / totalValue * 100 }))
      .sort((a,b) => b.pct - a.pct)
  }, [positions, tickerToIndustry])

  // Concentration label
  const top2Pct = exposure.slice(0,2).reduce((s,e) => s+e.pct, 0)
  const top1Pct = exposure[0]?.pct ?? 0
  const concLevel = top1Pct > 40 ? 'High' : top2Pct > 60 ? 'High' : top2Pct > 40 ? 'Moderate' : 'Low'
  const concColor = concLevel === 'High' ? 'var(--red)' : concLevel === 'Moderate' ? 'var(--amber)' : 'var(--green)'

  // Industries held by user
  const heldIndustries = new Set(exposure.map(e => e.name))

  // Potential diversifiers: industries in universe NOT heavily held, sufficient coverage, reasonable trend
  const diversifiers = industries
    .filter(i => !i.insufficient && i.trendScore != null)
    .filter(i => !heldIndustries.has(i.name) || (exposure.find(e=>e.name===i.name)?.pct ?? 0) < 10)
    .filter(i => i.trendScore > -5)  // not in strong downtrend
    .sort((a,b) => {
      // Prefer industries that appear to complement held industries
      const pctHeld = exposure.find(e=>e.name===a.name)?.pct ?? 0
      const pctHeldB = exposure.find(e=>e.name===b.name)?.pct ?? 0
      return pctHeld - pctHeldB  // lower held % first
    })
    .slice(0, 5)

  if (positions.length === 0) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
      color:'var(--txt-muted)', fontSize:12 }}>
      No positions found. Add positions to your portfolio first.
    </div>
  )

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', gap:16, flexWrap:'wrap', alignContent:'flex-start' }}>

      {/* Industry Exposure */}
      <div style={{ flex:'1 1 280px', background:'var(--surface-up)', borderRadius:'var(--radius-lg)', padding:'14px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase',
          letterSpacing:'0.07em', marginBottom:12 }}>Current Industry Exposure</div>
        {exposure.map(e => (
          <div key={e.name} style={{ marginBottom:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:11, color:'var(--txt)', fontWeight:600 }}>{e.name}</span>
              <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--txt)' }}>
                {e.pct.toFixed(1)}%
              </span>
            </div>
            <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${e.pct}%`,
                background: TREND_COLOR(industries.find(i=>i.name===e.name)?.trendScore),
                borderRadius:3, transition:'width 0.3s' }} />
            </div>
          </div>
        ))}
        {exposure.length === 0 && (
          <div style={{ fontSize:11, color:'var(--txt-muted)' }}>
            Tickers not found in universe sector map. Check if positions are classified.
          </div>
        )}
      </div>

      {/* Concentration + Diversification */}
      <div style={{ flex:'1 1 280px', display:'flex', flexDirection:'column', gap:12 }}>
        {/* Concentration */}
        <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius-lg)', padding:'14px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase',
            letterSpacing:'0.07em', marginBottom:10 }}>Concentration Analysis</div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ fontSize:20, fontWeight:800, color: concColor }}>{concLevel}</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)' }}>
              Top industry: {top1Pct.toFixed(0)}%
              {exposure.length > 1 && <>, top 2: {top2Pct.toFixed(0)}%</>}
            </div>
          </div>
          {exposure.length >= 2 && (
            <div style={{ fontSize:11, color:'var(--txt-muted)', lineHeight:1.5 }}>
              {concLevel === 'High'
                ? `${exposure[0]?.name}${exposure[1]?.pct > 20 ? ` and ${exposure[1]?.name}` : ''} dominate the portfolio.`
                : concLevel === 'Moderate'
                ? 'Exposure is concentrated but distributed across a few industries.'
                : 'Portfolio shows balanced industry distribution.'}
            </div>
          )}
        </div>

        {/* Diversification Opportunities */}
        <div style={{ background:'var(--surface-up)', borderRadius:'var(--radius-lg)', padding:'14px', flex:1 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase',
            letterSpacing:'0.07em', marginBottom:10 }}>Potential Balance Areas</div>
          <div style={{ fontSize:9, color:'var(--txt-muted)', marginBottom:10, lineHeight:1.5 }}>
            Industries not heavily represented in your portfolio, with sufficient data and not in strong downtrend.
            Use ScanView to find specific candidates within each.
          </div>
          {diversifiers.length === 0 && (
            <div style={{ fontSize:11, color:'var(--txt-muted)' }}>
              No diversifiers found — run more Scanner analyses first.
            </div>
          )}
          {diversifiers.map(d => {
            const rot = classifyRotation(d.rs1M, d.rs3M, d.rs6M)
            const heldPct = exposure.find(e=>e.name===d.name)?.pct ?? 0
            return (
              <div key={d.name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8,
                padding:'7px 10px', background:'var(--surface)', borderRadius:'var(--radius)',
                border:'1px solid var(--border)' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: TREND_COLOR(d.trendScore), flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--txt)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {d.name}
                  </div>
                  <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:1 }}>
                    {heldPct > 0 ? `${heldPct.toFixed(0)}% held · ` : 'Not in portfolio · '}
                    {rot.label === 'No data' ? 'Rotation unavailable' : rot.label} · RS {sign(d.trendScore)}
                  </div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:3, flexShrink:0,
                  background:`${rot.color}22`, color: rot.color }}>
                  {rot.emoji}
                </span>
              </div>
            )
          })}

          <div style={{ marginTop:12, padding:'8px 10px', background:'rgba(99,102,241,0.08)',
            borderRadius:'var(--radius)', border:'1px solid rgba(99,102,241,0.2)', fontSize:10,
            color:'var(--txt-muted)', lineHeight:1.5 }}>
            💡 These are <b style={{color:'var(--txt)'}}>potential balance areas</b> based on industry exposure and current trend.
            Does not yet account for historical return correlation — industries listed may still move similarly to your existing positions.
            Use ScanView → Conviction to evaluate specific candidates.
          </div>
        </div>
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════
   Pure SVG Squarified Treemap — no recharts
══════════════════════════════════════════ */
function squarify(items, x, y, w, h) {
  if (!items?.length || !w || !h) return []
  const total = items.reduce((s, i) => s + (i.value||0), 0)
  if (!total) return []
  const result = [], remaining = [...items]
  let rx = x, ry = y, rw = w, rh = h

  while (remaining.length) {
    const area = rw * rh
    const short = Math.min(rw, rh)
    const row = [remaining[0]]
    let rowSum = remaining[0].value || 1

    for (let i = 1; i < remaining.length; i++) {
      const trial = rowSum + (remaining[i].value || 1)
      const rowArea = (trial / total) * area
      const thick = rowArea / short
      const worstCurr = Math.max(...row.map(it => {
        const len = ((it.value||1) / rowSum) * short
        return Math.max(thick/len, len/thick)
      }))
      const newLen = ((remaining[i].value||1) / trial) * short
      const worstNew = Math.max(thick/newLen, newLen/thick)
      if (worstNew <= worstCurr || row.length === 0) { row.push(remaining[i]); rowSum = trial }
      else break
    }

    const rowArea = (rowSum / total) * area
    const thick = rowArea / short
    let off = 0
    for (const it of row) {
      const len = ((it.value||1) / rowSum) * short
      if (rw >= rh) result.push({ ...it, x: rx, y: ry + off, w: thick, h: len })
      else           result.push({ ...it, x: rx + off, y: ry, w: len, h: thick })
      off += len
    }
    remaining.splice(0, row.length)
    if (rw >= rh) { rx += thick; rw -= thick } else { ry += thick; rh -= thick }
  }
  return result
}

function useSize(ref) {
  const [s, setS] = useState({ w:0, h:0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setS({ w:Math.floor(e.contentRect.width), h:Math.floor(e.contentRect.height) }))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return s
}


function TreemapContainer({ industries, onSelect }) {
  const ref = useRef(null)
  const { w, h } = useSize(ref)
  return (
    <div ref={ref} style={{ width:'100%', height:'100%' }}>
      {w > 0 && h > 0 && <SVGTreemap industries={industries} onSelect={onSelect} width={w} height={h} />}
    </div>
  )
}

function SVGTreemap({ industries, onSelect, width, height }) {
  const PAD = 2
  const nodes = squarify(
    (industries||[]).filter(i => (i.value||0) > 0 && i.name),
    0, 0, width, height
  )
  if (!nodes.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', height:'100%', gap:10, color:'var(--txt-muted)' }}>
      <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>No conviction data yet</div>
      <div style={{ fontSize:11, textAlign:'center', maxWidth:300 }}>
        Run the Scanner on a few tickers to populate the database.
      </div>
    </div>
  )
  return (
    <svg width={width} height={height} style={{ cursor:'pointer', overflow:'hidden', display:'block' }}>
      {nodes.map(n => {
        const col  = TREND_COLOR(n.trendScore, n.insufficient)
        const nw   = Math.max(0, n.w - PAD*2), nh = Math.max(0, n.h - PAD*2)
        const show = nw > 55 && nh > 24
        const showScore = nw > 70 && nh > 44
        const fs   = Math.min(11, Math.max(8, nw/9))
        return (
          <g key={n.name} onClick={() => onSelect(n.name)}>
            <rect x={n.x+PAD} y={n.y+PAD} width={nw} height={nh}
              fill={col} rx={3} opacity={0.9} />
            {show && (
              <text x={n.x+PAD+nw/2} y={n.y+PAD+nh/2-(showScore?9:0)}
                textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize={fs} fontWeight={700}
                style={{ userSelect:'none', pointerEvents:'none' }}>
                {n.name.length > 20 && nw < 130 ? n.name.slice(0,17)+'…' : n.name}
              </text>
            )}
            {showScore && n.trendScore != null && (
              <text x={n.x+PAD+nw/2} y={n.y+PAD+nh/2+10}
                textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize={Math.max(7,fs-2)} opacity={0.85}
                style={{ userSelect:'none', pointerEvents:'none' }}>
                {n.trendScore>0?'+':''}{n.trendScore.toFixed(1)}% · {n.tickerCount}co
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ══════════════════════════════════════════
   MAIN VIEW
══════════════════════════════════════════ */
export default function SectorTrendsView({ onSelectTicker }) {
  const [raw,      setRaw]      = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [selected, setSelected] = useState(null)
  const [viewMode, setViewMode] = useState('trend')   // 'trend'|'rotation'|'balance'
  const [sizeMode, setSizeMode] = useState('count')

  const [snapshotMeta, setSnapshotMeta] = useState(null)

  useEffect(() => {
    setLoading(true)
    workerAPI.get('/api/market-map/latest')
      .then(r => {
        setRaw(r?.tickers ?? [])
        setSnapshotMeta({ asOf: r?.asOf, status: r?.snapshotStatus, coveragePct: r?.coveragePct })
        setError(null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Industries come pre-aggregated from /api/market-map/latest
  // raw = array of industry objects: { name, sector, trendScore, rs1M/3M/6M, rotation,
  //   dataCount, tickerCount, coveragePct, tickers:[{ticker, trendScore, rs1M, ...}] }
  const industries = useMemo(() => {
    return raw
      .map(ind => ({
        name:        ind.name,
        sector:      ind.sector,
        tickers:     (ind.tickers ?? []).map(t => ({
          ticker:     t.ticker,
          name:       t.company ?? t.ticker,
          trendScore: t.trendScore ?? null,
          rs1M:       t.rs1M ?? null,
          rs3M:       t.rs3M ?? null,
          rs6M:       t.rs6M ?? null,
          grade:      t.grade ?? null,
          score:      t.score ?? null,
          spyWeight:  t.spyWeight ?? null,
        })),
        tickerCount: ind.tickerCount ?? 0,
        dataCount:   ind.dataCount   ?? 0,
        coverage:    (ind.coveragePct ?? 0) / 100,
        insufficient: (ind.coveragePct ?? 0) < 40 || (ind.dataCount ?? 0) < 3,
        trendScore:  ind.trendScore ?? null,
        rs1M:        ind.rs1M       ?? null,
        rs3M:        ind.rs3M       ?? null,
        rs6M:        ind.rs6M       ?? null,
        rotation:    ind.rotation   ?? null,
        value: sizeMode === 'equal' ? 1
             : sizeMode === 'weight' ? (ind.tickers ?? []).reduce((s,t) => s + (t.spyWeight ?? 0), 0)
             : ind.tickerCount ?? 1,
      }))
      .filter(g => g.tickerCount >= 1)
      .sort((a,b) => {
        if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1
        return (b.trendScore ?? -999) - (a.trendScore ?? -999)
      })
  }, [raw, sizeMode])

  const selectedInd = industries.find(i => i.name === selected)

  const VIEWS = [
    { id:'trend',    label:'Trend Map'  },
    { id:'rotation', label:'Rotation'   },
    { id:'balance',  label:'Portfolio Balance' },
  ]

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:12, flexShrink:0, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--txt)' }}>Market Map</div>
          <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:1, fontStyle:'italic' }}>
            S&P 500 (503 constituents) · RS vs SPY · No impact on Conviction or Swing scores
          </div>
          {snapshotMeta?.asOf && (
            <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:2 }}>
              <span style={{ color: snapshotMeta.status === 'complete' ? 'var(--green)' : 'var(--amber)' }}>
                ● {snapshotMeta.status}
              </span>
              {' · as of '}{snapshotMeta.asOf}
              {snapshotMeta.coveragePct != null && ` · ${snapshotMeta.coveragePct}% coverage`}
            </div>
          )}
        </div>

        {/* Refresh button */}
        <button onClick={() => {
          setRaw([]); setLoading(true); setError(null)
          workerAPI.get('/api/market-map/latest?refresh=1')
            .then(r => { setRaw(r?.tickers ?? []); setError(null) })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
        }} title="Refresh market data from D1" style={{
          padding:'5px 10px', borderRadius:'var(--radius)', border:'1px solid var(--border)',
          background:'transparent', color:'var(--txt-muted)', cursor:'pointer', fontSize:10,
          display:'flex', alignItems:'center', gap:4,
        }}>↺ Refresh</button>

        {/* View selector */}
        <div style={{ display:'flex', background:'var(--surface-up)', borderRadius:6,
          border:'1px solid var(--border)', overflow:'hidden' }}>
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => { setViewMode(v.id); setSelected(null) }} style={{
              padding:'5px 12px', border:'none', cursor:'pointer', fontSize:11, fontWeight:600,
              background: viewMode===v.id ? 'var(--accent)' : 'transparent',
              color:      viewMode===v.id ? '#fff'          : 'var(--txt-muted)',
              transition:'all 0.12s' }}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Size selector (Trend only) */}
        {viewMode === 'trend' && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
            <span style={{ fontSize:10, color:'var(--txt-muted)' }}>Block size:</span>
            <div style={{ display:'flex', background:'var(--surface-up)', borderRadius:6,
              border:'1px solid var(--border)', overflow:'hidden' }}>
              {[['count','# stocks'],['equal','Equal'],['weight','SPY weight']].map(([v,l]) => (
                <button key={v} onClick={() => setSizeMode(v)} style={{
                  padding:'4px 9px', border:'none', cursor:'pointer', fontSize:10, fontWeight:600,
                  background: sizeMode===v?'var(--accent)':'transparent',
                  color:      sizeMode===v?'#fff':'var(--txt-muted)', transition:'all 0.12s' }}>
                  {l}
                </button>
              ))}
            </div>
            {/* Legend */}
            <div style={{ display:'flex', gap:5, alignItems:'center', marginLeft:8 }}>
              {[['#16A34A','↑↑'],['#22C55E','↑'],['#FBBF24','→'],['#F97316','↓'],['#EF4444','↓↓'],['#374151','?']].map(([c,l]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:2 }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:c }} />
                  <span style={{ fontSize:9, color:'var(--txt-muted)' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          color:'var(--txt-muted)', fontSize:12 }}>Loading market data…</div>
      )}
      {error && (
        <div style={{ flex:1, padding:24, color:'var(--red)', fontSize:12 }}>
          Error: {error}. Make sure the Worker is deployed and you've run the Scanner on some tickers first.
        </div>
      )}

      {!loading && !error && (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

          {/* TREND MAP */}
          {viewMode === 'trend' && (
            <>
              <div style={{ flex:1, padding:12, overflow:'hidden', minWidth:0 }}>
                <TreemapContainer industries={industries} onSelect={setSelected} />
              </div>

              {/* Side panel */}
              {selected && selectedInd
                ? <IndustryPanel industry={selectedInd}
                    onClose={() => setSelected(null)}
                    onSelectTicker={t => { setSelected(null); onSelectTicker?.(t) }} />
                : industries.length > 0 && (
                  <div style={{ width:230, flexShrink:0, borderLeft:'1px solid var(--border)',
                    overflowY:'auto', padding:'12px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)',
                      textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
                      Industry Ranking
                    </div>
                    {industries.slice(0,14).map((ind,i) => (
                      <button key={ind.name} onClick={() => setSelected(ind.name)}
                        style={{ width:'100%', padding:'6px 8px', border:'none', background:'transparent',
                          cursor:'pointer', textAlign:'left', borderRadius:'var(--radius)',
                          display:'flex', alignItems:'center', gap:7, marginBottom:2 }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface-up)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
                          background: TREND_COLOR(ind.trendScore, ind.insufficient) }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:10, color:'var(--txt)', fontWeight:600,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {i+1}. {ind.name}
                          </div>
                          <div style={{ fontSize:9, color:'var(--txt-muted)' }}>
                            {ind.dataCount}/{ind.tickerCount} · {ind.positiveRS}↑RS
                          </div>
                        </div>
                        <span style={{ fontSize:10, fontFamily:'var(--mono)', fontWeight:700, flexShrink:0,
                          color: ind.insufficient?'var(--txt-muted)':ind.trendScore>0?'var(--green)':ind.trendScore<0?'var(--red)':'var(--txt-muted)' }}>
                          {ind.insufficient ? 'low cov.' : sign(ind.trendScore)}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              }
            </>
          )}

          {/* ROTATION TABLE */}
          {viewMode === 'rotation' && (
            <>
              <RotationView industries={industries}
                onSelectIndustry={name => { setSelected(name); setViewMode('trend') }} />
              {selected && selectedInd && (
                <IndustryPanel industry={selectedInd}
                  onClose={() => setSelected(null)}
                  onSelectTicker={t => { setSelected(null); onSelectTicker?.(t) }} />
              )}
            </>
          )}

          {/* PORTFOLIO BALANCE */}
          {viewMode === 'balance' && (
            <BalanceView industries={industries} />
          )}
        </div>
      )}
    </div>
  )
}
