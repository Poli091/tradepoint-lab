/**
 * MODULE: ROOT / App.jsx
 * Integrates live market data with UI state.
 * liveVisiblePositions override the static positions with real prices.
 */

import { useState, useEffect, useMemo } from 'react'
import { LanguageProvider }       from './context/LanguageContext.jsx'
import { AuthProvider, useAuth }  from './context/AuthContext.jsx'
import LockScreen                 from './auth/LockScreen.jsx'
import Sidebar                    from './components/layout/Sidebar.jsx'
import Header                     from './components/layout/Header.jsx'
import SettingsPanel              from './components/layout/SettingsPanel.jsx'
import DashboardView              from './views/DashboardView.jsx'
import PositionsView              from './views/PositionsView.jsx'
import WatchlistView              from './views/WatchlistView.jsx'
import CalendarView               from './views/CalendarView.jsx'
import DiagnosticsView            from './views/DiagnosticsView.jsx'
import ScanView                   from './views/ScanView.jsx'
import { useTradepoint }          from './hooks/useTradepoint.js'
import { loadOverrides }          from './utils/positionsStorage.js'
import PositionEditor             from './components/widgets/PositionEditor.jsx'
import { useAllConvictions }     from './hooks/useAllConvictions.js'
import { WATCHLIST }             from './data/watchlist.js'
import { useMarketData }          from './hooks/useMarketData.js'
import { filterByAccount, calcPortfolioStats } from './utils/finance.js'
import { getGrade } from './conviction/grade/index.js'

/* ── Live data badge ───────────────────────────────────── */
function LiveBadge({ loading, lastUpdated, error }) {
  if (error)       return <span style={{ fontSize:10, color:'var(--red)',     fontFamily:'var(--mono)' }}>⚠ {error.slice(0,40)}</span>
  if (loading)     return <span style={{ fontSize:10, color:'var(--amber)',   fontFamily:'var(--mono)' }}>↻ Updating…</span>
  if (lastUpdated) {
    const secs  = Math.round((Date.now() - lastUpdated) / 1000)
    const label = secs < 60 ? `${secs}s ago` : `${Math.round(secs/60)}m ago`
    return <span style={{ fontSize:10, color:'var(--green)', fontFamily:'var(--mono)' }}>● Live · {label}</span>
  }
  return <span style={{ fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>○ Simulated</span>
}

/* ── Main app ──────────────────────────────────────────── */
function AppInner() {
  const {
    theme, toggleTheme,
    view, setView,
    account, setAccount,
    ticker, setTicker,
    range, setRange,
    sortBy, sortDir, handleSort,
    side, setSide,
    orderType, setOrderType,
    qty, incQty, decQty,
    limitPrice, setLimitPrice,
  } = useTradepoint()

  const { livePositions, prices, loading: pricesLoading, error: pricesError, lastUpdated } = useMarketData()

  // State declarations must come BEFORE useMemos that reference them
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [editorOpen,    setEditorOpen]    = useState(false)
  const [positionSeed,  setPositionSeed]  = useState(0)

  // Use localStorage overrides if available (bridge before multi-user D1)
  const basePositions = useMemo(() => loadOverrides() ?? null, [positionSeed])

  const liveVisiblePositions = useMemo(() => {
    const base = filterByAccount(account)
    return livePositions.filter(p => base.some(b => b.ticker === p.ticker))
  }, [account, livePositions])

  const portfolioStats = useMemo(
    () => calcPortfolioStats(liveVisiblePositions),
    [liveVisiblePositions]
  )

  /* ── Conviction scores for all positions ── */
  const {
    results: convictionResults,
    loading: convictionLoading,
  } = useAllConvictions(liveVisiblePositions, prices)

  const convictionAvg = useMemo(() => {
    const scores = Object.values(convictionResults).map(r => r.finalScore).filter(s => s != null)
    if (!scores.length) return null
    const avg   = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10
    const grade = getGrade(avg)
    return { score: avg, label: grade.label, color: grade.color }
  }, [convictionResults])

  /* ── Conviction scores for watchlist ── */
  const { results: watchlistResults } = useAllConvictions(WATCHLIST, prices)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
          <DashboardView
            visiblePositions={liveVisiblePositions}
            portfolioStats={portfolioStats}
            prices={prices}
            ticker={ticker} setTicker={setTicker}
            range={range}   setRange={setRange}
            sortBy={sortBy} sortDir={sortDir} handleSort={handleSort}
            convictionResults={convictionResults}
            convictionLoading={convictionLoading}
            watchlistResults={watchlistResults}
          />
        )
      case 'positions':
        return (
          <>
            <PositionsView
              visiblePositions={liveVisiblePositions}
              sortBy={sortBy} sortDir={sortDir} handleSort={handleSort}
              ticker={ticker} setTicker={setTicker}
              convictionResults={convictionResults}
              convictionLoading={convictionLoading}
              prices={prices}
              onManagePositions={() => setEditorOpen(true)}
            />
            {editorOpen && (
              <PositionEditor
                onClose={() => setEditorOpen(false)}
                onSaved={() => setPositionSeed(s => s + 1)}
              />
            )}
          </>
        )
      case 'watchlist':
        return <WatchlistView convictionResults={watchlistResults} prices={prices} />
      case 'calendar':
        return <CalendarView convictionResults={convictionResults} prices={prices} />
      case 'scan':
        return <ScanView />
      case 'diagnostics':
        return (
          <DiagnosticsView
            visiblePositions={liveVisiblePositions}
            prices={prices}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view} setView={setView}
        theme={theme} toggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="app-main">
        <Header
          account={account} setAccount={setAccount}
          visiblePositions={liveVisiblePositions}
          portfolioStats={portfolioStats}
          liveBadge={<LiveBadge loading={pricesLoading} lastUpdated={lastUpdated} error={pricesError} />}
          convictionAvg={convictionAvg}
        />
        <main className="app-content">{renderView()}</main>
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

/* ── Auth gate ─────────────────────────────────────────── */
function AuthGate() {
  const { authenticated } = useAuth()
  if (!authenticated) return <LockScreen />
  return <AppInner />
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </LanguageProvider>
  )
}
