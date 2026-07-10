/**
 * MODULE: WIDGETS / OrderPanel.jsx
 * Buy/Sell order entry form with Market/Limit toggle.
 * Connects to Alpaca paper trading API or any broker in production.
 */

import { useState } from 'react'
import { POSITIONS } from '../../data/positions.js'
import { fUSD } from '../../utils/format.js'

const SIDE_STYLE = {
  buy:  { active: { bg: 'var(--green-dim)', color: 'var(--green)', border: 'var(--green)' } },
  sell: { active: { bg: 'var(--red-dim)',   color: 'var(--red)',   border: 'var(--red)'   } },
}

export default function OrderPanel({ ticker, side, setSide, orderType, setOrderType, qty, incQty, decQty, limitPrice, setLimitPrice }) {
  const [submitted, setSubmitted] = useState(false)

  const pos = POSITIONS.find(p => p.ticker === ticker)
  const price = pos?.currentPrice ?? 0
  const effectivePrice = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : price
  const total = effectivePrice * qty
  const isBuy = side === 'buy'
  const sideColor = isBuy ? 'var(--green)' : 'var(--red)'

  const handleSubmit = () => {
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 2200)
  }

  const labelStyle = {
    fontSize: 10, color: 'var(--txt-muted)',
    fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.07em', marginBottom: 5, display: 'block',
  }

  const inputBase = {
    width: '100%',
    background: 'var(--surface-up)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '8px 11px',
    fontFamily: 'var(--mono)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--txt)',
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: 18,
      width: 250,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-sec)' }}>Order entry</div>

      {/* Buy / Sell */}
      <div style={{ display: 'flex', background: 'var(--surface-up)', borderRadius:'var(--radius)', padding: 2, gap: 2 }}>
        {['buy', 'sell'].map(s => {
          const active = side === s
          const st = SIDE_STYLE[s].active
          return (
            <button key={s} onClick={() => setSide(s)} style={{
              flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              background: active ? st.bg  : 'transparent',
              color:      active ? st.color : 'var(--txt-muted)',
              transition: 'all 0.12s',
            }}>{s}</button>
          )
        })}
      </div>

      {/* Symbol (read-only) */}
      <div>
        <span style={labelStyle}>Symbol</span>
        <div style={{ ...inputBase }}>{ticker}</div>
      </div>

      {/* Order type */}
      <div>
        <span style={labelStyle}>Order type</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {['market', 'limit'].map(t => {
            const active = orderType === t
            return (
              <button key={t} onClick={() => setOrderType(t)} style={{
                flex: 1, padding: '6px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--txt-sec)',
                fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600,
                transition: 'all 0.12s', textTransform: 'capitalize',
              }}>{t}</button>
            )
          })}
        </div>
      </div>

      {/* Quantity */}
      <div>
        <span style={labelStyle}>Quantity</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={decQty} style={{
            width: 30, height: 30, borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface-up)',
            color: 'var(--txt)', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>−</button>
          <div style={{ ...inputBase, textAlign: 'center', flex: 1, padding: '6px 0' }}>{qty}</div>
          <button onClick={incQty} style={{
            width: 30, height: 30, borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface-up)',
            color: 'var(--txt)', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
        </div>
      </div>

      {/* Limit price (conditional) */}
      {orderType === 'limit' && (
        <div>
          <span style={labelStyle}>Limit price</span>
          <input
            type="number"
            value={limitPrice}
            onChange={e => setLimitPrice(e.target.value)}
            placeholder={price.toFixed(2)}
            style={{ ...inputBase, boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* Estimated total */}
      <div style={{
        background: 'var(--surface-up)', borderRadius:'var(--radius)', padding: '10px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>Est. total</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>
          {fUSD(total)}
        </span>
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} style={{
        padding: '11px', borderRadius:'var(--radius)', border: `1px solid ${sideColor}`,
        background: submitted ? sideColor : `${sideColor}22`,
        color: submitted ? '#fff' : sideColor,
        fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 14,
        textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer',
        transition: 'all 0.15s',
      }}>
        {submitted ? '✓ Order placed' : `${isBuy ? 'Buy' : 'Sell'} ${ticker}`}
      </button>

      <div style={{ fontSize: 10, color: 'var(--txt-muted)', textAlign: 'center' }}>
        Paper trading — no real funds
      </div>
    </div>
  )
}
