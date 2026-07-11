/**
 * MODULE: VIEWS / WatchlistView.jsx
 * Full-page watchlist with conviction rings from the engine.
 */

import { useMemo, useState, useEffect } from 'react'
import Sparkline       from '../components/ui/Sparkline.jsx'
import Badge           from '../components/ui/Badge.jsx'
import ConvictionRing  from '../components/ui/ConvictionRing.jsx'
import { WATCHLIST }   from '../data/watchlist.js'
import { genSparklines } from '../utils/chartData.js'
import { fUSD, fPct }  from '../utils/format.js'
import EmptyState from '../components/ui/EmptyState.jsx'
import WatchlistEditor from '../components/widgets/WatchlistEditor.jsx'
import { loadWatchlist } from '../utils/watchlistStorage.js'
import { useLang } from '../context/LanguageContext.jsx'
import TickerDetailPanel from '../components/widgets/TickerDetailPanel.jsx'
import { workerAPI } from '../utils/api/worker.js'
import { runConviction } from '../conviction/index.js'

export default function WatchlistView({ convictionResults = {}, prices = {} }) {
  const [items,       setItems]       = useState(() => loadWatchlist() ?? WATCHLIST)
  const [editorOpen,  setEditorOpen]  = useState(false)
  const [activeTicker, setActiveTicker] = useState(null)
  const { t } = useLang()
  const [scanning,     setScanning]     = useState(false)
  const [scanProgress, setScanProgress] = useState({ done:0, total:0 })
  const sparklines = useMemo(() => genSparklines(items, 21), [items])

  const handleScanWatchlist = async () => {
    const list = items.length > 0 ? items : WATCHLIST
    setScanning(true)
    setScanProgress({ done:0, total:list.length })
    try {
      const spyRes = await workerAPI.ohlcv('SPY', '1Y').catch(() => null)
      const spyOhlcv = spyRes?.data ?? []
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        try {
          const [fundRes, ohlcvRes] = await Promise.all([
            workerAPI.fundamentals(item.ticker),
            workerAPI.ohlcv(item.ticker, '1Y'),
          ])
          if (fundRes?.data) {
            const result = runConviction({ fundamentals: fundRes.data, ohlcv: ohlcvRes?.data ?? [], spyOhlcv, prices: {} })
            await workerAPI.saveAnalysis(item.ticker, result).catch(() => {})
          }
        } catch(e) { console.warn('[Scan watchlist]', item.ticker, e.message) }
        setScanProgress({ done:i+1, total:list.length })
        if (i < list.length - 1) await new Promise(r => setTimeout(r, 300))
      }
    } finally { setScanning(false) }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ fontSize:18, fontWeight:700, color:'var(--txt)', margin:0 }}>{t.watchlistTitle}</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handleScanWatchlist} disabled={scanning} style={{
            padding:'6px 14px', borderRadius:6, border:'1px solid var(--border)',
            background: scanning ? 'var(--accent-dim)' : 'transparent',
            cursor: scanning ? 'wait' : 'pointer', fontSize:12, fontWeight:600,
            color: scanning ? 'var(--accent)' : 'var(--txt-muted)', whiteSpace:'nowrap',
          }}>
            {scanning ? `${t.watchlistScanning} ${scanProgress.done}/${scanProgress.total}…` : t.watchlistScan}
          </button>
          <button onClick={() => setEditorOpen(true)} style={{
            padding:'6px 14px', borderRadius:6, border:'1px solid var(--border)',
            background:'transparent', cursor:'pointer', fontSize:12,
            color:'var(--accent)', fontWeight:600 }}>{t.watchlistManage}</button>
        </div>
      </div>

      {items.length === 0 && (
        <EmptyState icon="👁" title="No watchlist items" sub="Add tickers to your watchlist to track them here" />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {items.map(item => {
          const isUp  = item.dayChangePct >= 0
          const spark = sparklines[item.ticker] ?? []
          const cv    = convictionResults[item.ticker]

          return (
            <div key={item.ticker}
              onClick={() => setActiveTicker(item.ticker)}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${getGradeColor(cv?.grade) ? getGradeColor(cv?.grade) + '33' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: 16,
                transition: 'all 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-up)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--txt)' }}>
                    {item.ticker}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 2 }}>{item.name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge label={item.priority === 'high' ? 'Priority' : 'Watch'} type={item.priority} />
                  {/* Conviction ring */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <ConvictionRing
                      score={cv?.finalScore ?? null}
                      grade={cv?.grade ?? null}
                      loading={false}
                      size={40}
                    />
                    {cv?.grade && (
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.03em',
                        color: getGradeColor(cv?.grade) ?? 'var(--txt-muted)' }}>
                        {cv.grade.replace('STRONG ', 'S.')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div style={{ marginBottom: 10 }}>
                <Sparkline data={spark} positive={isUp} width="100%" height={40} />
              </div>

              {/* Price row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--txt)' }}>
                    {fUSD(item.currentPrice)}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                    color: isUp ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>
                    {fPct(item.dayChangePct)} today
                  </div>
                </div>

                {/* Score breakdown mini if available */}
                {cv && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginBottom: 2 }}>Conviction</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                      color: getGradeColor(cv?.grade) ?? 'var(--txt)' }}>
                      {cv.finalScore}/100
                    </div>
                    <div style={{ fontSize: 9, color: getGradeColor(cv?.grade) ?? 'var(--txt-muted)', fontWeight: 700 }}>
                      {cv.grade}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>Analyst upside</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                  +{item.upside?.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {editorOpen && (
        <WatchlistEditor
          onClose={() => setEditorOpen(false)}
          onSaved={() => setItems(loadWatchlist() ?? [])}
        />
      )}

      {activeTicker && (
        <TickerDetailPanel
          ticker={activeTicker}
          prices={prices}
          onClose={() => setActiveTicker(null)}
        />
      )}
    </div>
  )
}
