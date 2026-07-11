/**
 * MODULE: VIEWS / SectorTrendsView.jsx
 * Market Map — Sector Trends Treemap
 *
 * Shows where market momentum is flowing using:
 *  · Industry Trend Score = 40% RS1M + 35% RS3M + 25% RS6M
 *  · Breadth: % of tickers above EMA50 / EMA200
 *  · Treemap size = number of tickers in universe (or market weight proxy)
 *
 * Data: latest conviction analysis per ticker from D1, aggregated by industry.
 * Click any block → see tickers sorted by relative strength.
 */

import { useState, useEffect, useMemo } from 'react'
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { workerAPI } from '../utils/api/worker.js'
import { UNIVERSE } from '../data/tickerUniverse.js'

/* ── Helpers ──────────────────────────────────────────────── */
const trendColor = (score, insufficient = false) => {
  if (insufficient)   return '#374151'
  if (score == null) return 'var(--surface-up)'
  if (score >  8)   return '#16A34A'   // strong uptrend
  if (score >  3)   return '#22C55E'   // mild uptrend
  if (score >  0)   return '#86EFAC'   // slight uptrend
  if (score > -3)   return '#FBBF24'   // neutral
  if (score > -7)   return '#F97316'   // mild downtrend
  return '#EF4444'                     // strong downtrend
}
const trendLabel = (score, insufficient = false) => {
  if (insufficient) return 'Insufficient coverage'
  if (score == null) return 'No data'
  if (score >  8)   return 'Strong Uptrend'
  if (score >  3)   return 'Uptrend'
  if (score >  0)   return 'Slight Uptrend'
  if (score > -3)   return 'Neutral'
  if (score > -7)   return 'Mild Downtrend'
  return 'Downtrend'
}
const sign   = (v) => v == null ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}
const medianAge = (tickers) => {
  const ages = tickers
    .filter(t => t.date)
    .map(t => (Date.now() - new Date(t.date + 'T12:00:00Z').getTime()) / 86_400_000)
  return ages.length ? median(ages) : null
}
const pct  = (v) => v == null ? '—' : `${(v * 100).toFixed(0)}%`

/* ── Custom Treemap Cell ──────────────────────────────────── */
function Cell({ x, y, width, height, name, trendScore, tickerCount, breadthEMA200, insufficient }) {
  if (!width || !height || width < 4 || height < 4) return null
  const color = trendColor(trendScore, insufficient)
  const showName  = width > 70 && height > 32
  const showScore = width > 70 && height > 52
  const textColor = (trendScore != null && trendScore < -3) ? '#fff' : '#fff'

  return (
    <g style={{ cursor: 'pointer' }}>
      <rect x={x+1} y={y+1} width={width-2} height={height-2}
        fill={color} rx={4} opacity={0.9} />
      {showName && (
        <text x={x + width/2} y={y + height/2 - (showScore ? 10 : 0)}
          textAnchor="middle" fill={textColor} fontSize={Math.min(12, width/7)}
          fontWeight={700} style={{ userSelect:'none' }}>
          {name.length > 18 && width < 140 ? name.slice(0, 16) + '…' : name}
        </text>
      )}
      {showScore && trendScore != null && (
        <text x={x + width/2} y={y + height/2 + 12}
          textAnchor="middle" fill={textColor} fontSize={Math.min(11, width/8)}
          opacity={0.95} style={{ userSelect:'none' }}>
          {sign(trendScore)} RS · {tickerCount}co
        </text>
      )}
    </g>
  )
}

/* ── Ticker sidebar ───────────────────────────────────────── */
function IndustryPanel({ industry, tickers, onSelect, onClose, medianAgeVal, oldestAgeVal }) {
  const sorted = [...tickers].sort((a, b) => (b.trendScore ?? -999) - (a.trendScore ?? -999))
  return (
    <div style={{ width: 280, flexShrink:0, borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column', background:'var(--surface)', overflowY:'auto' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{industry}</div>
          <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:2 }}>
            {tickers.length} companies · sorted by RS
          </div>
          {medianAgeVal != null && (
            <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:1 }}>
              Data freshness: median {Math.round(medianAgeVal)}d · oldest {Math.round(oldestAgeVal)}d
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background:'transparent', border:'none',
          cursor:'pointer', color:'var(--txt-muted)', fontSize:16 }}>✕</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
        {sorted.map(t => (
          <button key={t.ticker}
            onClick={() => onSelect(t.ticker)}
            style={{ width:'100%', padding:'10px 16px', border:'none', background:'transparent',
              cursor:'pointer', textAlign:'left', borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', gap:10 }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--surface-up)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ width:40, flexShrink:0 }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700,
                color: t.trendScore > 0 ? 'var(--green)' : t.trendScore < 0 ? 'var(--red)' : 'var(--txt)' }}>
                {t.ticker}
              </div>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, color:'var(--txt)', fontWeight:600 }}>
                RS {sign(t.trendScore)}
              </div>
              <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:1 }}>
                {t.rs1M != null ? `1M ${sign(t.rs1M)}` : ''}
                {t.rs3M != null ? ` · 3M ${sign(t.rs3M)}` : ''}
              </div>
            </div>
            <div style={{ flexShrink:0, textAlign:'right' }}>
              {t.grade && (
                <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3,
                  background: t.grade === 'STRONG BUY' ? '#22C55E22' : t.grade === 'BUY' ? '#86EFAC22' : '#FBBF2422',
                  color: t.grade === 'STRONG BUY' ? '#22C55E' : t.grade === 'BUY' ? '#86EFAC' : '#FBBF24' }}>
                  {t.grade?.replace('STRONG ', 'S.')}
                </span>
              )}
              {t.upside != null && (
                <div style={{ fontSize:9, color:'var(--green)', fontFamily:'var(--mono)', marginTop:2 }}>
                  +{t.upside?.toFixed(0)}%↑
                </div>
              )}
            </div>
          </button>
        ))}
        {sorted.length === 0 && (
          <div style={{ padding:'24px 16px', fontSize:11, color:'var(--txt-muted)', textAlign:'center' }}>
            No conviction data yet.<br />Run the Scanner on these tickers first.
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main View ────────────────────────────────────────────── */
export default function SectorTrendsView({ onSelectTicker }) {
  const [raw,      setRaw]      = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [selected, setSelected] = useState(null)   // selected industry name
  const [sizeMode, setSizeMode] = useState('count') // 'count' | 'equal'

  useEffect(() => {
    setLoading(true)
    workerAPI.get('/api/sector-trends')
      .then(r => { setRaw(r?.tickers ?? []); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Build industry data from UNIVERSE + D1 ticker results
  const industries = useMemo(() => {
    const tickerMap = {}
    for (const t of raw) tickerMap[t.ticker] = t

    // Group UNIVERSE by industry (exclude ETFs and Argentine ADRs)
    const MAX_STALE_DAYS = 14
    const groups = {}
    for (const u of UNIVERSE) {
      if (u.type === 'ETF' || u.type === 'ADR' || u.country === 'AR') continue
      const ind = u.industry || u.sector || 'Other'
      if (!groups[ind]) groups[ind] = { name: ind, sector: u.sector, tickers: [] }
      const analysis = tickerMap[u.ticker]
      const ageInDays = analysis?.date
        ? (Date.now() - new Date(analysis.date + 'T12:00:00Z').getTime()) / 86_400_000
        : null
      groups[ind].tickers.push({
        ticker: u.ticker, name: u.name, ageInDays,
        ...(analysis ?? { trendScore: null, rs1M: null, rs3M: null, rs6M: null, grade: null, upside: null }),
      })
    }

    return Object.values(groups).map(g => {
      // Exclude stale analyses from trend computation
      const fresh    = g.tickers.filter(t => t.ageInDays != null && t.ageInDays <= MAX_STALE_DAYS)
      const withData = fresh.filter(t => t.trendScore != null)

      // Coverage metrics
      const coverage     = g.tickers.length > 0 ? withData.length / g.tickers.length : 0
      const insufficient = coverage < 0.40 || withData.length < 3

      // Use MEDIAN to resist outliers (one big winner shouldn't dominate)
      const trendScore   = withData.length > 0 ? median(withData.map(t => t.trendScore)) : null
      const rs1M         = withData.length > 0 ? median(withData.filter(t=>t.rs1M!=null).map(t=>t.rs1M)) : null
      const rs3M         = withData.length > 0 ? median(withData.filter(t=>t.rs3M!=null).map(t=>t.rs3M)) : null
      const rs6M         = withData.length > 0 ? median(withData.filter(t=>t.rs6M!=null).map(t=>t.rs6M)) : null

      // Breadth (positive RS, EMA position)
      const positiveRS   = withData.filter(t => (t.trendScore ?? 0) > 0).length
      const breadthEMA200 = withData.filter(t => t.aboveEMA200 === true).length
      const breadthEMA50  = withData.filter(t => t.aboveEMA50  === true).length

      // Freshness
      const mAge    = medianAge(g.tickers)
      const oldestAge = g.tickers.reduce((max, t) => t.ageInDays != null ? Math.max(max, t.ageInDays) : max, 0)

      return {
        name: g.name, sector: g.sector,
        tickers: g.tickers,
        tickerCount: g.tickers.length,
        dataCount: withData.length,
        freshCount: fresh.length,
        coverage, insufficient,
        trendScore, rs1M, rs3M, rs6M,
        positiveRS, breadthEMA200, breadthEMA50,
        medianAge: mAge, oldestAge,
        value: sizeMode === 'equal' ? 1 : g.tickers.length,
      }
    }).filter(g => g.tickerCount >= 2)
      .sort((a, b) => {
        // Insufficient → bottom; then sort by trendScore
        if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1
        return (b.trendScore ?? -999) - (a.trendScore ?? -999)
      })
  }, [raw, sizeMode])

  const selectedIndustry = industries.find(i => i.name === selected)

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--txt)' }}>Market Map</div>
          <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>
            Industry momentum · RS multi-horizon · Breadth EMA50/EMA200
          </div>
          <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:2, fontStyle:'italic' }}>
            TradePoint Universe only — trends reflect companies currently included.
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {/* Size selector */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:10, color:'var(--txt-muted)' }}>Block size:</span>
          <div style={{ display:'flex', background:'var(--surface-up)', borderRadius:6,
            border:'1px solid var(--border)', overflow:'hidden' }}>
            {[['count','Number of stocks'],['equal','Equal size']].map(([v,l]) => (
              <button key={v} onClick={() => setSizeMode(v)} style={{
                padding:'4px 10px', border:'none', cursor:'pointer', fontSize:10, fontWeight:600,
                background: sizeMode===v ? 'var(--accent)' : 'transparent',
                color:      sizeMode===v ? '#fff'          : 'var(--txt-muted)', transition:'all 0.12s' }}>
                {l}
              </button>
            ))}
          </div></div>
          {/* Legend */}
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {[['#16A34A','Strong ↑'],[' #22C55E','↑'],['#FBBF24','Neutral'],['#F97316','↓'],['#EF4444','Strong ↓']].map(([c,l]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:3 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:c }} />
                <span style={{ fontSize:9, color:'var(--txt-muted)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Treemap */}
        <div style={{ flex:1, padding:16, overflow:'hidden', minWidth:0 }}>
          {loading && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%',
              color:'var(--txt-muted)', fontSize:12 }}>
              Loading market data…
            </div>
          )}
          {error && (
            <div style={{ padding:20, color:'var(--red)', fontSize:12 }}>
              Error: {error}. Make sure the Worker is configured and you've run the Scanner on some tickers first.
            </div>
          )}
          {!loading && !error && industries.length === 0 && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              height:'100%', gap:12, color:'var(--txt-muted)' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>No conviction data yet</div>
              <div style={{ fontSize:12, textAlign:'center', maxWidth:300 }}>
                Run the Scanner on a few tickers first to populate the D1 analysis database.
                Then come back here to see industry trends.
              </div>
            </div>
          )}
          {!loading && industries.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={industries}
                dataKey="value"
                aspectRatio={4/3}
                stroke="var(--surface)"
                strokeWidth={2}
                onClick={(data) => setSelected(data?.name ?? null)}
                content={({ x, y, width, height, name, trendScore, tickerCount, breadthEMA200 }) => (
                  <Cell x={x} y={y} width={width} height={height}
                    name={name} trendScore={trendScore}
                    tickerCount={tickerCount} breadthEMA200={breadthEMA200}
                    insufficient={insufficient} />
                )}
              />
            </ResponsiveContainer>
          )}
        </div>

        {/* Industry detail sidebar */}
        {selected && selectedIndustry && (
          <IndustryPanel
            industry={selected}
            tickers={selectedIndustry.tickers}
            medianAgeVal={selectedIndustry?.medianAge}
            oldestAgeVal={selectedIndustry?.oldestAge}
            onClose={() => setSelected(null)}
            onSelect={(ticker) => {
              setSelected(null)
              onSelectTicker?.(ticker)
            }}
          />
        )}

        {/* Right stats panel when nothing selected */}
        {!selected && !loading && industries.length > 0 && (
          <div style={{ width:240, flexShrink:0, borderLeft:'1px solid var(--border)',
            overflowY:'auto', padding:'14px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)',
              textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12 }}>
              Industry Ranking
            </div>
            {industries.slice(0, 15).map((ind, i) => (
              <button key={ind.name} onClick={() => setSelected(ind.name)}
                style={{ width:'100%', padding:'7px 8px', border:'none', background:'transparent',
                  cursor:'pointer', textAlign:'left', borderRadius:'var(--radius)',
                  display:'flex', alignItems:'center', gap:8, marginBottom:2 }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--surface-up)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
                  background: trendColor(ind.trendScore) }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, color:'var(--txt)', fontWeight:600,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {i+1}. {ind.name}
                  </div>
                  <div style={{ fontSize:9, color:'var(--txt-muted)', marginTop:1 }}>
                    {ind.dataCount}/{ind.tickerCount} analyzed
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:10, fontFamily:'var(--mono)', fontWeight:700,
                    color: ind.insufficient ? 'var(--txt-muted)'
                         : ind.trendScore == null ? 'var(--txt-muted)'
                         : ind.trendScore > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {ind.insufficient ? 'low cov.' : sign(ind.trendScore)}
                  </div>
                  {!ind.insufficient && ind.positiveRS != null && (
                    <div style={{ fontSize:8, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>
                      {ind.positiveRS}/{ind.dataCount} ↑RS
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
