/**
 * MODULE: UTILS / finance.js
 * Pure financial computation helpers.
 */

import { POSITIONS, ROTH_TICKERS, BROKERAGE_TICKERS } from '../data/positions.js'

/** Calculate P&L for a single position */
export function calcPnL(pos) {
  const value   = pos.currentPrice * pos.qty
  const cost    = pos.avgPrice * pos.qty
  const gain    = value - cost
  const gainPct = ((pos.currentPrice / pos.avgPrice) - 1) * 100
  return { value, cost, gain, gainPct }
}

/** Filter positions by account ('roth' | 'brokerage' | 'combined') */
export function filterByAccount(account) {
  if (account === 'combined') return POSITIONS
  const tickers = account === 'roth' ? ROTH_TICKERS : BROKERAGE_TICKERS
  return POSITIONS.filter(p => tickers.includes(p.ticker))
}

/** Aggregate portfolio statistics for a set of positions */
export function calcPortfolioStats(positions) {
  const totalValue = positions.reduce((s, p) => s + p.currentPrice * p.qty, 0)
  const totalCost  = positions.reduce((s, p) => s + p.avgPrice  * p.qty, 0)
  const totalGain  = totalValue - totalCost
  const gainPct    = totalCost > 0 ? (totalGain / totalCost) * 100 : 0
  const _convScores = positions.map(p => p.conviction).filter(Number.isFinite)
  const avgConviction = _convScores.length
    ? Math.round(_convScores.reduce((a,b)=>a+b,0) / _convScores.length)
    : null
  const best = [...positions].sort((a, b) => calcPnL(b).gainPct - calcPnL(a).gainPct)[0] ?? null

  return { totalValue, totalCost, totalGain, gainPct, avgConviction, best, count: positions.length }
}

/**
 * Stable mock day-change percentages (generated once per session).
 * In production, replace with a live price feed.
 */
export const DAY_CHANGES = Object.fromEntries(
  POSITIONS.map(p => [p.ticker, (Math.random() * 0.038 - 0.012)])
)
