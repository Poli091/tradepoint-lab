/**
 * MODULE: WIDGETS / PriceChart.jsx
 * Full-featured price chart with 9 ranges, overlay indicators and signal sub-panels.
 *
 * Ranges:   1D · 1W · 1M · 6M · YTD · 1Y · 2Y · 5Y · ALL
 * Overlays: SMA 20 · SMA 50 · EMA 200 · BB · vs SPY
 * Signals:  RSI(14) · MACD(12/26/9) · FORECAST
 *
 * Data flow: mock → localStorage cache → Worker (Alpaca split-adjusted)
 * Sub-charts use recharts syncId for synchronized crosshair across all panels.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ComposedChart, Area, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { POSITIONS }                from '../../data/positions.js'
import { genPriceData, RANGE_DAYS } from '../../utils/chartData.js'
import {
  calcSMA, calcEMA, calcRSI, calcMACD, calcBB, calcForecast, thinData,
} from '../../utils/indicators.js'
import { cache }                    from '../../utils/cache.js'
import { workerAPI, getWorkerUrl }  from '../../utils/api/worker.js'
import { fUSD, fPct }               from '../../utils/format.js'

/* ── Constants ──────────────────────────────────────────────────────────── */
const RANGES   = ['1D', '1W', '1M', '6M', 'YTD', '1Y', '2Y', '5Y', 'ALL']
const GRAD_ID  = 'tp-price-grad'
const SYNC_ID  = 'tp-chart-sync'

/** Overlay / signal indicator config */
const IND = {
  sma20:    { label: 'SMA 20',   color: '#F59E0B', kind: 'overlay' },
  sma50:    { label: 'SMA 50',   color: '#3B82F6', kind: 'overlay' },
  ema200:   { label: 'EMA 200',  color: '#A855F7', kind: 'overlay' },
  bb:       { label: 'BB',       color: '#94A3B8', kind: 'overlay' },
  spy:      { label: 'vs SPY',   color: '#22C55E', kind: 'overlay' },
  rsi:      { label: 'RSI',      color: '#22D3EE', kind: 'panel'   },
  macd:     { label: 'MACD',     color: '#F97316', kind: 'panel'   },
  forecast: { label: 'FORECAST', color: '#60A5FA', kind: 'overlay' },
}

/** Min data points needed for each indicator to be meaningful */
const IND_MIN = { sma20: 20, sma50: 50, ema200: 200, bb: 20, rsi: 15, macd: 27, forecast: 5, spy: 5 }

/* ── Tooltip components ─────────────────────────────────────────────────── */
function PriceTooltip({ active, payload, ind }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{
      background: 'var(--surface-up)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '8px 12px', minWidth: 130,
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>
        {d.price != null ? fUSD(d.price) : d.forecast != null ? `${fUSD(d.forecast)} ↗` : '—'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 2 }}>{d.date}</div>
      {ind.sma20    && d.sma20   != null && <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 3 }}>SMA 20: {fUSD(d.sma20)}</div>}
      {ind.sma50    && d.sma50   != null && <div style={{ fontSize: 10, color: '#3B82F6' }}>SMA 50: {fUSD(d.sma50)}</div>}
      {ind.ema200   && d.ema200  != null && <div style={{ fontSize: 10, color: '#A855F7' }}>EMA 200: {fUSD(d.ema200)}</div>}
      {ind.bb       && d.bbUpper != null && (
        <div style={{ fontSize: 10, color: '#94A3B8' }}>
          BB: {fUSD(d.bbLower)} – {fUSD(d.bbUpper)}
        </div>
      )}
      {ind.forecast && d.forecast != null && <div style={{ fontSize: 10, color: '#60A5FA' }}>Forecast: {fUSD(d.forecast)}</div>}
    </div>
  )
}

function RSITooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const rsi = payload[0]?.payload?.rsi
  if (rsi == null) return null
  const color = rsi >= 70 ? 'var(--red)' : rsi <= 30 ? 'var(--green)' : '#22D3EE'
  const label = rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral'
  return (
    <div style={{
      background: 'var(--surface-up)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '6px 10px',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color }}>
        RSI {rsi.toFixed(1)} — {label}
      </div>
    </div>
  )
}

function MACDTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d?.macdLine && !d?.histogram) return null
  return (
    <div style={{
      background: 'var(--surface-up)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '6px 10px',
    }}>
      {d.macdLine   != null && <div style={{ fontSize: 10, color: '#F97316', fontFamily: 'var(--mono)' }}>MACD: {d.macdLine.toFixed(3)}</div>}
      {d.signalLine != null && <div style={{ fontSize: 10, color: '#EF4444', fontFamily: 'var(--mono)' }}>Signal: {d.signalLine.toFixed(3)}</div>}
      {d.histogram  != null && <div style={{ fontSize: 10, color: d.histogram >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)' }}>Hist: {d.histogram.toFixed(3)}</div>}
    </div>
  )
}

/* ── Indicator toggle pill ───────────────────────────────────────────────── */
function IndBtn({ id, active, disabled, onClick }) {
  const cfg = IND[id]
  return (
    <button
      onClick={() => !disabled && onClick(id)}
      title={disabled ? `Need more data for ${cfg.label}` : cfg.label}
      style={{
        padding: '3px 9px', borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
        border: `1px solid ${active ? cfg.color : 'var(--border)'}`,
        background: active ? `${cfg.color}22` : 'transparent',
        color: disabled ? 'var(--txt-muted)' : active ? cfg.color : 'var(--txt-sec)',
        transition: 'all 0.12s', opacity: disabled ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </button>
  )
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function PriceChart({ ticker, onTickerChange, range, onRangeChange, prices = {} }) {
  const pos       = POSITIONS.find(p => p.ticker === ticker)
  const livePrice = prices[ticker]?.price ?? pos?.currentPrice ?? 0

  const [rawData,   setRawData]   = useState([])
  const [isLive,    setIsLive]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [ind, setInd] = useState({
    sma20: false, sma50: false, ema200: false, bb: false,
    spy: false, rsi: false, macd: false, forecast: false,
  })

  const toggle = useCallback(key => setInd(p => ({ ...p, [key]: !p[key] })), [])

  /* ── Data loading ───────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false
    setIsLive(false)
    setRawData([])

    if (!ticker) return

    // Immediate mock fallback
    const mockDays = range === 'YTD'
      ? Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / 86400000)
      : (RANGE_DAYS[range] || 90)
    setRawData(genPriceData(livePrice || 100, mockDays))

    // Local cache check
    const cached = cache.getOHLCV(ticker, range)
    if (cached?.length > 0) {
      if (!cancelled) { setRawData(cached); setIsLive(true) }
      return
    }

    // Worker fetch
    if (!getWorkerUrl()) return
    setLoading(true)
    workerAPI.ohlcv(ticker, range)
      .then(result => {
        if (!cancelled && result?.data?.length > 0) {
          cache.setOHLCV(ticker, range, result.data)
          setRawData(result.data)
          setIsLive(true)
        }
      })
      .catch(err => console.warn('[PriceChart]', err.message))
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [ticker, range])  // eslint-disable-line

  /* ── Indicator computation ──────────────────────────────────────────── */
  const { mainData, availablePoints } = useMemo(() => {
    if (!rawData.length) return { mainData: [], availablePoints: 0 }

    const closes = rawData.map(d => d.price)
    const n      = closes.length

    // Compute all (on full dataset before thinning)
    const sma20      = calcSMA(closes, 20)
    const sma50      = calcSMA(closes, 50)
    const ema200     = calcEMA(closes, 200)
    const bbArr      = calcBB(closes, 20)
    const rsiArr     = calcRSI(closes, 14)
    const macdResult = calcMACD(closes)

    const full = rawData.map((d, i) => ({
      ...d,
      sma20:      sma20[i],
      sma50:      sma50[i],
      ema200:     ema200[i],
      bbUpper:    bbArr[i].upper,
      bbMiddle:   bbArr[i].middle,
      bbLower:    bbArr[i].lower,
      rsi:        rsiArr[i],
      macdLine:   macdResult.macdLine[i],
      signalLine: macdResult.signalLine[i],
      histogram:  macdResult.histogram[i],
    }))

    // Thin for performance on large datasets
    return { mainData: thinData(full, 300), availablePoints: n }
  }, [rawData])

  /* ── Forecast extension ─────────────────────────────────────────────── */
  const chartData = useMemo(() => {
    if (!ind.forecast || mainData.length < 5) return mainData

    const closes = rawData.map(d => d.price)
    const projected = calcForecast(closes, 12)

    // Bridge: last real point also carries forecast value for visual continuity
    const bridged = [...mainData]
    bridged[bridged.length - 1] = {
      ...bridged[bridged.length - 1],
      forecast: bridged[bridged.length - 1].price,
    }

    return [
      ...bridged,
      ...projected.map((f, i) => ({
        date: `+${i + 1}`, price: null, forecast: f.forecast,
        fUpper: f.fUpper, fLower: f.fLower,
        sma20: null, sma50: null, ema200: null,
        bbUpper: null, bbMiddle: null, bbLower: null,
        rsi: null, macdLine: null, signalLine: null, histogram: null,
      })),
    ]
  }, [mainData, ind.forecast, rawData])

  /* ── Chart metrics ──────────────────────────────────────────────────── */
  const realPoints = mainData.filter(d => d.price != null)
  const first      = realPoints[0]?.price ?? 0
  const last       = livePrice || (realPoints[realPoints.length - 1]?.price ?? 0)
  const isUp       = last >= first
  const pct        = first > 0 ? ((last - first) / first) * 100 : 0
  const lineColor  = 'var(--chart-line)'

  /* ── Which indicators are disabled (not enough data) ───────────────── */
  const disabled = Object.fromEntries(
    Object.keys(IND).map(k => [k, availablePoints < (IND_MIN[k] ?? 1)])
  )

  /* ── Sub-chart visibility ───────────────────────────────────────────── */
  const showRSI  = ind.rsi  && !disabled.rsi
  const showMACD = ind.macd && !disabled.macd
  const hasPanel = showRSI || showMACD

  /* ── Shared axis config ─────────────────────────────────────────────── */
  const xAxisTick = { fill: 'var(--txt-muted)', fontSize: 9, fontFamily: 'var(--mono)' }
  const yAxisTick = { fill: 'var(--txt-muted)', fontSize: 9, fontFamily: 'var(--mono)' }
  const gridProps = { stroke: 'var(--border)', strokeDasharray: '3 3', vertical: false }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 16,
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10,
    }}>

      {/* ── Header: price + badge + change ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700, color: 'var(--txt)', letterSpacing: '-0.03em' }}>
              {fUSD(livePrice || last)}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em',
              background: isLive ? 'var(--green-dim)' : 'var(--surface-up)',
              color:      isLive ? 'var(--green)'      : 'var(--txt-muted)',
            }}>
              {loading ? '↻' : isLive ? 'Live' : 'Sim'}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: isUp ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
            {isUp ? '▲' : '▼'} {fPct(Math.abs(pct))} ({range})
          </div>
        </div>

        {/* Range picker */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--surface-up)', borderRadius: 8, padding: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {RANGES.map(r => (
            <button key={r} onClick={() => onRangeChange(r)} style={{
              padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: range === r ? 'var(--surface-hov)' : 'transparent',
              color:      range === r ? 'var(--txt)'         : 'var(--txt-muted)',
              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, transition: 'all 0.12s',
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* ── Indicator buttons ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Overlays row */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--txt-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 2 }}>
            Overlay
          </span>
          {['sma20', 'sma50', 'ema200', 'bb', 'spy'].map(k => (
            <IndBtn key={k} id={k} active={ind[k]} disabled={disabled[k]} onClick={toggle} />
          ))}
        </div>
        {/* Signals row */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--txt-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 2 }}>
            Signal
          </span>
          {['rsi', 'macd', 'forecast'].map(k => (
            <IndBtn key={k} id={k} active={ind[k]} disabled={disabled[k]} onClick={toggle} />
          ))}
        </div>
      </div>

      {/* ── Ticker strip ── */}
      <div style={{
        display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2,
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {POSITIONS.map(p => {
          const active = ticker === p.ticker
          return (
            <button key={p.ticker} onClick={() => onTickerChange(p.ticker)} style={{
              padding: '4px 9px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
              border: `1px solid ${active ? lineColor : 'var(--border)'}`,
              background: active ? `${lineColor}18` : 'transparent',
              color:      active ? lineColor : 'var(--txt-muted)',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: active ? 700 : 500,
              transition: 'all 0.11s',
            }}>{p.ticker}</button>
          )
        })}
      </div>

      {/* ── Main price chart ── */}
      <ResponsiveContainer width="100%" height={hasPanel ? 195 : 230} syncId={SYNC_ID}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={GRAD_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--chart-line)" stopOpacity={0.18} />
              <stop offset="95%" stopColor="var(--chart-line)" stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" tick={xAxisTick} tickLine={false} axisLine={false}
            interval="preserveStartEnd" hide={hasPanel} />
          <YAxis
            domain={['auto', 'auto']}
            tick={yAxisTick} tickLine={false} axisLine={false}
            tickFormatter={v => `$${Number(v).toFixed(0)}`} width={50}
          />
          <Tooltip content={props => <PriceTooltip {...props} ind={ind} />} />

          {/* Price area */}
          <Area type="monotone" dataKey="price"
            stroke="var(--chart-line)" strokeWidth={2}
            fill={`url(#${GRAD_ID})`} dot={false} connectNulls={false}
            activeDot={{ r: 4, fill: 'var(--chart-line)', stroke: 'var(--bg)', strokeWidth: 2 }}
          />

          {/* Overlays */}
          {ind.sma20  && !disabled.sma20  && <Line type="monotone" dataKey="sma20"   stroke="#F59E0B" strokeWidth={1.5} dot={false} connectNulls={false} />}
          {ind.sma50  && !disabled.sma50  && <Line type="monotone" dataKey="sma50"   stroke="#3B82F6" strokeWidth={1.5} dot={false} connectNulls={false} />}
          {ind.ema200 && !disabled.ema200 && <Line type="monotone" dataKey="ema200"  stroke="#A855F7" strokeWidth={1.5} dot={false} connectNulls={false} />}
          {ind.bb     && !disabled.bb     && <>
            <Line type="monotone" dataKey="bbUpper"  stroke="#94A3B8" strokeWidth={1} strokeDasharray="4 2" dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="bbMiddle" stroke="#94A3B8" strokeWidth={1} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="bbLower"  stroke="#94A3B8" strokeWidth={1} strokeDasharray="4 2" dot={false} connectNulls={false} />
          </>}

          {/* Forecast */}
          {ind.forecast && !disabled.forecast && <>
            <Line type="monotone" dataKey="forecast" stroke="#60A5FA" strokeWidth={2}
              strokeDasharray="6 3" dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="fUpper" stroke="#60A5FA" strokeWidth={1}
              strokeDasharray="2 4" dot={false} connectNulls={false} opacity={0.4} />
            <Line type="monotone" dataKey="fLower" stroke="#60A5FA" strokeWidth={1}
              strokeDasharray="2 4" dot={false} connectNulls={false} opacity={0.4} />
          </>}
        </ComposedChart>
      </ResponsiveContainer>

      {/* ── RSI sub-chart ── */}
      {showRSI && (
        <div>
          <div style={{ fontSize: 9, color: '#22D3EE', fontWeight: 700, fontFamily: 'var(--mono)', marginBottom: 2, paddingLeft: 50 }}>
            RSI (14)
          </div>
          <ResponsiveContainer width="100%" height={100} syncId={SYNC_ID}>
            <ComposedChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tick={xAxisTick} tickLine={false} axisLine={false}
                interval="preserveStartEnd" hide={showMACD} />
              <YAxis domain={[0, 100]} tick={yAxisTick} tickLine={false} axisLine={false}
                ticks={[30, 70]} width={50} />
              <Tooltip content={<RSITooltip />} />
              <ReferenceLine y={70} stroke="var(--red)"   strokeDasharray="4 2" strokeWidth={1} />
              <ReferenceLine y={30} stroke="var(--green)" strokeDasharray="4 2" strokeWidth={1} />
              <Line type="monotone" dataKey="rsi" stroke="#22D3EE" strokeWidth={1.5}
                dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── MACD sub-chart ── */}
      {showMACD && (
        <div>
          <div style={{ fontSize: 9, color: '#F97316', fontWeight: 700, fontFamily: 'var(--mono)', marginBottom: 2, paddingLeft: 50 }}>
            MACD (12, 26, 9)
          </div>
          <ResponsiveContainer width="100%" height={100} syncId={SYNC_ID}>
            <ComposedChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tick={xAxisTick} tickLine={false} axisLine={false}
                interval="preserveStartEnd" />
              <YAxis domain={['auto', 'auto']} tick={yAxisTick} tickLine={false} axisLine={false}
                width={50} tickFormatter={v => v.toFixed(1)} />
              <Tooltip content={<MACDTooltip />} />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
              {/* Histogram bars — color based on value */}
              <Bar dataKey="histogram" maxBarSize={4}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.histogram >= 0 ? '#22C55E' : '#EF4444'} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="macdLine"   stroke="#F97316" strokeWidth={1.5} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="signalLine" stroke="#EF4444" strokeWidth={1}   dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  )
}
