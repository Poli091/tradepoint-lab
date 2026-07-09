/**
 * MODULE: LAYOUT / Sidebar.jsx
 * Desktop: left rail with nav, settings gear, and theme toggle.
 * Mobile:  fixed bottom navigation bar.
 */

import { LayoutDashboard, Briefcase, Eye, CalendarDays, BarChart3, Search, Settings, Sun, Moon } from 'lucide-react'
import { useBreakpoint } from '../../hooks/useBreakpoint.js'
import { useLang }        from '../../context/LanguageContext.jsx'

function NavButton({ label, Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--accent-dim)' : 'transparent',
        color:      active ? 'var(--accent)'     : 'var(--txt-muted)',
        boxShadow: active ? 'inset 0 0 0 1px var(--accent-glow)' : 'none',
        transition: 'all 0.14s',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--surface-up)'; e.currentTarget.style.color = 'var(--txt-sec)' }}}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent';       e.currentTarget.style.color = 'var(--txt-muted)' }}}
    >
      <Icon size={19} />
    </button>
  )
}

function IconBtn({ label, Icon, onClick, color, bg }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg || 'var(--surface-up)',
        color: color || 'var(--txt-muted)',
        transition: 'all 0.14s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = color || 'var(--accent)' }}
      onMouseLeave={e => { e.currentTarget.style.color = color || 'var(--txt-muted)' }}
    >
      <Icon size={18} />
    </button>
  )
}

export default function Sidebar({ view, setView, theme, toggleTheme, onOpenSettings }) {
  const { isMobile } = useBreakpoint()
  const { t }        = useLang()
  const isLight      = theme === 'light'

  // Desktop shows all — mobile shows 5 core views
  const NAV_ITEMS = [
    { id: 'dashboard',   label: t.navDashboard,      Icon: LayoutDashboard },
    { id: 'positions',   label: t.navPositions,      Icon: Briefcase       },
    { id: 'watchlist',   label: t.navWatchlist,      Icon: Eye             },
    { id: 'scan',        label: 'Scanner',            Icon: Search          },
    { id: 'calendar',    label: t.navCalendar,        Icon: CalendarDays    },
    { id: 'diagnostics', label: 'Model Diagnostics',  Icon: BarChart3,  desktopOnly: true },
  ]
  const MOBILE_NAV = NAV_ITEMS.filter(n => !n.desktopOnly)

  /* ── Mobile: fixed bottom nav bar ── */
  if (isMobile) {
    return (
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        height: 58, background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '0 8px',
      }}>
        {MOBILE_NAV.map(({ id, label, Icon }) => (
          <NavButton key={id} label={label} Icon={Icon} active={view === id} onClick={() => setView(id)} />
        ))}
        <IconBtn
          label={isLight ? 'Dark mode' : 'Light mode'}
          Icon={isLight ? Sun : Moon}
          color={isLight ? 'var(--amber)' : undefined}
          onClick={toggleTheme}
        />
      </nav>
    )
  }

  /* ── Desktop: left sidebar ── */
  return (
    <aside style={{
      width: 'var(--sidebar-w)', height: '100vh',
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 14, paddingBottom: 14,
      gap: 4, flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'linear-gradient(135deg, var(--accent), var(--purple))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: '#fff',
        marginBottom: 18,
      }}>TP</div>

      {/* Nav */}
      {NAV_ITEMS.map(({ id, label, Icon }) => (
        <NavButton key={id} label={label} Icon={Icon} active={view === id} onClick={() => setView(id)} />
      ))}

      <div style={{ flex: 1 }} />

      {/* Settings */}
      <IconBtn label={t.navSettings ?? 'Settings'} Icon={Settings} onClick={onOpenSettings} />

      {/* Theme toggle */}
      <IconBtn
        label={isLight ? 'Dark mode' : 'Light mode'}
        Icon={isLight ? Sun : Moon}
        color={isLight ? 'var(--amber)' : undefined}
        onClick={toggleTheme}
      />
    </aside>
  )
}
