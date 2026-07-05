/**
 * MODULE: LAYOUT / Sidebar.jsx
 * Left navigation rail with icon buttons.
 * To add a new view: add an entry to NAV_ITEMS.
 */

import { LayoutDashboard, Briefcase, Eye, CalendarDays, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'positions', label: 'Positions',  Icon: Briefcase       },
  { id: 'watchlist', label: 'Watchlist',  Icon: Eye             },
  { id: 'calendar',  label: 'Calendar',   Icon: CalendarDays    },
]

export default function Sidebar({ view, setView }) {
  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      height: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 14,
      paddingBottom: 14,
      gap: 4,
      flexShrink: 0,
    }}>
      {/* Logo mark */}
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'linear-gradient(135deg, var(--accent), var(--purple))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: '#fff',
        marginBottom: 18,
        boxShadow: '0 0 18px var(--accent-glow)',
      }}>
        TP
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const active = view === id
        return (
          <button
            key={id}
            onClick={() => setView(id)}
            title={label}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            style={{
              width: 42, height: 42,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? 'var(--accent-dim)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--txt-muted)',
              boxShadow: active ? 'inset 0 0 0 1px var(--accent-glow)' : 'none',
              transition: 'all 0.14s ease',
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--surface-up)'; e.currentTarget.style.color = 'var(--txt-sec)' } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--txt-muted)' } }}
          >
            <Icon size={18} />
          </button>
        )
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings */}
      <button
        title="Settings"
        aria-label="Settings"
        style={{
          width: 42, height: 42,
          borderRadius: 10, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', color: 'var(--txt-muted)',
          transition: 'all 0.14s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-up)'; e.currentTarget.style.color = 'var(--txt-sec)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--txt-muted)' }}
      >
        <Settings size={18} />
      </button>
    </aside>
  )
}
