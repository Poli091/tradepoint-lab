/**
 * MODULE: UI / Sparkline.jsx
 * Minimal inline SVG price sparkline.
 */

export default function Sparkline({ data, positive, width = 76, height = 26 }) {
  if (!data || data.length < 2) return null

  const prices = data.map(d => d.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width
    const y = height - ((p - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const color = positive ? 'var(--green)' : 'var(--red)'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
