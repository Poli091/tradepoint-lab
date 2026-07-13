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
import CompareView                from './views/CompareView.jsx'
import PortfolioInsightsView       from './views/PortfolioInsightsView.jsx'
import ScanView                   from './views/ScanView.jsx'
import SectorTrendsView           from './views/SectorTrendsView.jsx'
import { loadOverrides }          from './utils/positionsStorage.js'
import { loadWatchlist }          from './utils/watchlistStorage.js'
import TickerDetailPanel from './components/widgets/TickerDetailPanel.jsx'
import PositionEditor             from './components/widgets/PositionEditor.jsx'
import { useAllConvictions }     from './hooks/useAllConvictions.js'
import { WATCHLIST }             from './data/watchlist.js'
import { useMarketData }          from './hooks/useMarketData.js'
import { calcPortfolioStats } from './utils/finance.js'
import { POSITIONS }               from './data/positions.js'
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
  // App-level state (view routing, theme, sorting, account selection)
  const [theme,       setThemeRaw]   = useState(() => localStorage.getItem('tp_theme') ?? 'dark')
  const toggleTheme = () => setThemeRaw(t => { const n = t==='dark'?'light':'dark'; localStorage.setItem('tp_theme',n); return n })
  const [view,        setView]        = useState('dashboard')
  const [account,     setAccount]     = useState('combined')
  const [privacyMode, setPrivacyMode] = useState(false)
  const togglePrivacy = () => setPrivacyMode(p => !p)
  const [ticker,      setTicker]      = useState('')
  const [range,       setRange]       = useState('1Y')
  const [sortBy,      setSortBy]      = useState('conviction')
  const [sortDir,     setSortDir]     = useState('desc')
  const handleSort = (col) => { setSortBy(col); setSortDir(d => col === sortBy ? (d==='desc'?'asc':'desc') : 'desc') }

  const { livePositions, prices, loading: pricesLoading, error: pricesError, lastUpdated, fetchSingle } = useMarketData()

  // State declarations must come BEFORE useMemos that reference them
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [searchTicker,  setSearchTicker]  = useState(null)
  const [editorOpen,    setEditorOpen]    = useState(false)
  const [positionSeed,  setPositionSeed]  = useState(0)

  // Use localStorage overrides if available (bridge before multi-user D1)
  const { authenticated } = useAuth()
  const basePositions = useMemo(() => loadOverrides() ?? null, [positionSeed, authenticated])

  const liveVisiblePositions = useMemo(() => {
    // Use localStorage overrides if available, else hardcoded defaults
    const source = basePositions ?? POSITIONS

    // Filter by account using position.account field
    let filtered
    if (account === 'combined') {
      // Merge positions with same ticker across accounts:
      // sum qty, weighted avg cost, sum market value
      const byTicker = {}
      for (const p of source) {
        if (!byTicker[p.ticker]) {
          byTicker[p.ticker] = { ...p, _accounts: [p.account] }
        } else {
          const existing = byTicker[p.ticker]
          const totalQty  = (existing.qty || 0) + (p.qty || 0)
          const totalCost = (existing.qty || 0) * (existing.avgPrice || 0)
                          + (p.qty || 0) * (p.avgPrice || 0)
          byTicker[p.ticker] = {
            ...existing,
            qty:      totalQty,
            avgPrice: totalQty > 0 ? totalCost / totalQty : existing.avgPrice,
            avgCost:  totalQty > 0 ? totalCost / totalQty : existing.avgPrice,
            _accounts: [...(existing._accounts ?? []), p.account],
            account: 'Combined',
          }
        }
      }
      filtered = Object.values(byTicker)
    } else {
      filtered = source.filter(p => {
        const acc = p.account?.toLowerCase() ?? ''
        if (account === 'roth')      return acc.includes('roth')
        if (account === 'brokerage') return acc.includes('brokerage')
        return true
      })
    }

    // Apply live prices
    return filtered.map(pos => ({
      ...pos,
      currentPrice: prices[pos.ticker]?.price ?? pos.currentPrice,
      dayChangePct: prices[pos.ticker]?.changePct ?? pos.dayChangePct ?? null,
    }))
  }, [basePositions, account, prices])

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

  /* ── Conviction scores for watchlist — use localStorage if available ── */
  const liveWatchlist = useMemo(() => {
    const items = loadWatchlist() ?? WATCHLIST
    return items.map(item => ({
      ...item,
      currentPrice: prices[item.ticker]?.price      ?? item.currentPrice,
      dayChangePct: prices[item.ticker]?.changePct  ?? item.dayChangePct ?? null,
      dayChange:    prices[item.ticker]?.change      ?? null,
      isLive:       !!prices[item.ticker],
    }))
  }, [positionSeed, prices])
  const { results: watchlistResults } = useAllConvictions(liveWatchlist, prices)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle('privacy-mode', privacyMode)
  }, [privacyMode])

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
            privacyMode={privacyMode}
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
              privacyMode={privacyMode}
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
        return <ScanView onSelectTicker={ticker => { setSearchTicker(ticker); fetchSingle(ticker) }} convictionResults={convictionResults} />
      case 'market':
        return <SectorTrendsView onSelectTicker={ticker => { setSearchTicker(ticker); fetchSingle(ticker) }} />
      case 'insights':
        return (
          <PortfolioInsightsView
            visiblePositions={liveVisiblePositions}
            convictionResults={convictionResults}
            prices={prices}
          />
        )
      case 'compare':
        return <CompareView />
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
          privacyMode={privacyMode} togglePrivacy={togglePrivacy}
          onGlobalSearch={(ticker) => { setSearchTicker(ticker); fetchSingle(ticker) }}
        />
        <main className="app-content">{renderView()}</main>
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} toggleTheme={toggleTheme} onPositionChange={() => setPositionSeed(s => s + 1)} />
      {/* Global search panel — opened from Header search, not tied to any view */}
      {searchTicker && (
        <TickerDetailPanel
          ticker={searchTicker}
          prices={prices}
          onClose={() => setSearchTicker(null)}
        />
      )}
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
