/**
 * MODULE: UI / EmptyState.jsx
 * Reusable empty/loading state component.
 */

export default function EmptyState({ icon = '⚡', title, sub, loading = false }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 20px', gap: 10,
      color: 'var(--txt-muted)', textAlign: 'center',
    }}>
      <div style={{
        fontSize: 28, marginBottom: 4,
        animation: loading ? 'tp-pulse 1.5s ease-in-out infinite' : 'none',
      }}>{icon}</div>
      <style>{`@keyframes tp-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      {title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-sec)' }}>{title}</div>}
      {sub   && <div style={{ fontSize: 11, color: 'var(--txt-muted)', maxWidth: 240, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )
}
