/**
 * MODULE: HOOKS / useTradepoint.js
 * Central UI state for the app.
 * NOTE: visiblePositions and portfolioStats are computed in App.jsx
 * using live prices from useMarketData — not here.
 */

import { useState } from 'react'

export function useTradepoint() {
  // ── Navigation ──────────────────────────────────────────
  const [view,    setView]    = useState('dashboard')

  // ── Account selection ────────────────────────────────────
  const [account, setAccount] = useState('combined')

  // ── Chart ────────────────────────────────────────────────
  const [ticker,  setTicker]  = useState('NVDA')
  const [range,   setRange]   = useState('3M')

  // ── Positions table sort ─────────────────────────────────
  const [sortBy,  setSortBy]  = useState('upside')
  const [sortDir, setSortDir] = useState('desc')

  // ── Order panel ──────────────────────────────────────────
  const [side,       setSide]       = useState('buy')
  const [orderType,  setOrderType]  = useState('market')
  const [qty,        setQty]        = useState(1)
  const [limitPrice, setLimitPrice] = useState('')

  // ── Theme ─────────────────────────────────────────────────
  const [theme, setTheme] = useState(
    () => localStorage.getItem('tp-theme') || 'dark'
  )
  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      localStorage.setItem('tp-theme', next)
      return next
    })
  }

  // ── Sort handler ─────────────────────────────────────────
  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  // ── Qty helpers ───────────────────────────────────────────
  const incQty = () => setQty(q => q + 1)
  const decQty = () => setQty(q => Math.max(1, q - 1))

  return {
    // Theme
    theme, toggleTheme,
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
  }
}
