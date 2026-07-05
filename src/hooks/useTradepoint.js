/**
 * MODULE: HOOKS / useTradepoint.js
 * Central state for the entire app.
 * All shared state lives here — no prop drilling beyond 1 level.
 */

import { useState, useMemo } from 'react'
import { filterByAccount, calcPortfolioStats } from '../utils/finance.js'

export function useTradepoint() {
  // ── Navigation ──────────────────────────────────────────
  const [view,    setView]    = useState('dashboard')

  // ── Account selection ────────────────────────────────────
  const [account, setAccount] = useState('combined')   // 'roth' | 'brokerage' | 'combined'

  // ── Chart state ──────────────────────────────────────────
  const [ticker,  setTicker]  = useState('NVDA')
  const [range,   setRange]   = useState('3M')

  // ── Positions table sort ─────────────────────────────────
  const [sortBy,  setSortBy]  = useState('upside')     // field name
  const [sortDir, setSortDir] = useState('desc')        // 'asc' | 'desc'

  // ── Order panel ──────────────────────────────────────────
  const [side,      setSide]      = useState('buy')    // 'buy' | 'sell'
  const [orderType, setOrderType] = useState('market') // 'market' | 'limit'
  const [qty,       setQty]       = useState(1)
  const [limitPrice, setLimitPrice] = useState('')

  // ── Derived: visible positions for the selected account ──
  const visiblePositions = useMemo(
    () => filterByAccount(account),
    [account]
  )

  // ── Derived: portfolio stats ──────────────────────────────
  const portfolioStats = useMemo(
    () => calcPortfolioStats(visiblePositions),
    [visiblePositions]
  )

  // ── Sort handler ─────────────────────────────────────────
  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  // ── Qty helpers ───────────────────────────────────────────
  const incQty = () => setQty(q => q + 1)
  const decQty = () => setQty(q => Math.max(1, q - 1))

  return {
    // Navigation
    view, setView,
    // Account
    account, setAccount,
    // Chart
    ticker, setTicker,
    range, setRange,
    // Sort
    sortBy, sortDir, handleSort,
    // Order
    side, setSide,
    orderType, setOrderType,
    qty, setQty, incQty, decQty,
    limitPrice, setLimitPrice,
    // Derived
    visiblePositions,
    portfolioStats,
  }
}
