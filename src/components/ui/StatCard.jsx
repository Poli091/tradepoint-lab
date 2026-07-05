/**
 * MODULE: UI / StatCard.jsx
 * Top-level metric card — used in the dashboard header row.
 */

export default function StatCard({ label, value, sub, subColor, icon: Icon }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
      flex: 1,
      minWidth: 0,
    }}>
      {/* Label + icon row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{
          fontSize: 10, color: 'var(--txt-muted)',
          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {label}
        </span>
        {Icon && <Icon size={15} color="var(--txt-muted)" />}
      </div>

      {/* Main value */}
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--txt)',
        lineHeight: 1,
        letterSpacing: '-0.03em',
      }}>
        {value}
      </div>

      {/* Sub-label */}
      {sub && (
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 12,
          fontWeight: 600,
          color: subColor ?? 'var(--txt-sec)',
          marginTop: 6,
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}
