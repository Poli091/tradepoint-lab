/**
 * MODULE: AUTH / LockScreen.jsx
 * Lock screen shown on page load, reload, and when the screen is locked.
 * Renders on top of everything — the app content is never visible until unlocked.
 *
 * Three states:
 *  1. hasPasskey + webAuthnOk → show "Unlock with Passkey" button
 *  2. !hasPasskey + webAuthnOk → show "Set Up Passkey" button
 *  3. !webAuthnOk             → show "Browser not supported" message + bypass option
 */

import { useState } from 'react'
import { Fingerprint, Trash2, AlertTriangle, ShieldOff, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

/* ── Branding ─────────────────────────────────────────── */
function AppLogo() {
  return (
    <div style={{
      fontSize: 30, fontWeight: 700, marginBottom: 12,
      fontFamily: 'Inter, system-ui, sans-serif',
      letterSpacing: '-0.04em', userSelect: 'none',
    }}>
      <span style={{ color: '#0EA5E9' }}>Trade</span>
      <span style={{ color: '#818CF8' }}>Point</span>
      <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 300 }}> Lab</span>
    </div>
  )
}

/* ── Glow button ──────────────────────────────────────── */
function GlowButton({ onClick, disabled, loading, icon: Icon, children, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%', padding: '13px 16px', borderRadius:'var(--radius-lg)',
        border: danger ? '1px solid rgba(248,113,113,0.3)' : 'none',
        cursor: loading || disabled ? 'wait' : 'pointer',
        background: danger
          ? 'rgba(248,113,113,0.08)'
          : loading
            ? 'rgba(14,165,233,0.5)'
            : 'linear-gradient(135deg, #0EA5E9 0%, #7C3AED 100%)',
        color: danger ? '#F87171' : '#fff',
        fontSize: 14, fontWeight: 600,
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'all 0.2s ease',
        boxShadow: danger ? 'none' : loading ? 'none' : '0 0 24px rgba(14,165,233,0.25)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {Icon && <Icon size={17} />}
      {children}
    </button>
  )
}

/* ── Separator ────────────────────────────────────────── */
function Separator({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      margin: '22px 0 14px',
    }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.2)', fontFamily: 'Inter, system-ui, sans-serif',
        textTransform: 'uppercase',
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

/* ── Main lock screen ─────────────────────────────────── */
export default function LockScreen() {
  const { hasPasskey, webAuthnOk, register, unlock, bypassUnsupported, deleteProfile } = useAuth()
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteStep2,   setDeleteStep2]   = useState(false)

  const handle = async (fn) => {
    setLoading(true)
    setError('')
    try {
      await fn()
      setSuccess(true)
    } catch (err) {
      const msg = err?.message || 'Authentication failed'
      // Friendly messages for common WebAuthn error codes
      if (msg.includes('cancelled') || msg.includes('NotAllowedError')) {
        setError('Authentication cancelled — please try again.')
      } else if (msg.includes('NotSupportedError')) {
        setError('This device does not support biometric authentication.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = () => {
    if (!deleteStep2) {
      setDeleteConfirm(true)
      setDeleteStep2(true)
    } else {
      deleteProfile()
    }
  }

  return (
    /* Full-screen overlay — always in front, app never visible */
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px 16px',
      /* Dark background with subtle radial glow */
      background: `
        radial-gradient(ellipse 70% 60% at 50% 50%, rgba(124,58,237,0.07) 0%, transparent 60%),
        radial-gradient(ellipse 50% 40% at 50% 55%, rgba(14,165,233,0.06) 0%, transparent 55%),
        #060B14
      `,
    }}>
      {/* Card */}
      <div style={{
        background: 'rgba(13,17,23,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        padding: '36px 28px 28px',
        width: '100%', maxWidth: 360,
        textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
      }}>

        <AppLogo />

        {/* ── WebAuthn not supported ── */}
        {!webAuthnOk && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)',
              borderRadius:'var(--radius-lg)', padding: '10px 14px', marginBottom: 20,
            }}>
              <ShieldOff size={14} color="#FBBF24" />
              <span style={{ fontSize: 12, color: '#FBBF24', fontFamily: 'Inter, system-ui' }}>
                Biometric auth not available in this browser
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20, lineHeight: 1.6 }}>
              For full security, use Chrome, Safari, or Edge on a device with biometrics.
            </p>
            <GlowButton onClick={bypassUnsupported} icon={ShieldCheck}>
              Continue without lock
            </GlowButton>
          </>
        )}

        {/* ── No passkey registered yet — setup ── */}
        {webAuthnOk && !hasPasskey && (
          <>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 24, lineHeight: 1.65 }}>
              Secure your dashboard with biometric authentication.<br />
              Your Face ID, Touch ID, or Windows Hello will protect your API keys and trading data.
            </p>
            <GlowButton onClick={() => handle(register)} loading={loading} icon={Fingerprint}>
              {loading ? 'Setting up…' : 'Set Up Passkey'}
            </GlowButton>
            {error && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <AlertTriangle size={12} color="#F87171" />
                <span style={{ fontSize: 12, color: '#F87171' }}>{error}</span>
              </div>
            )}
          </>
        )}

        {/* ── Passkey registered — unlock ── */}
        {webAuthnOk && hasPasskey && !success && (
          <>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 1.65 }}>
              A passkey profile is registered on this device.<br />
              Use your biometric lock to unlock the application and decrypt your keys.
            </p>

            <GlowButton onClick={() => handle(unlock)} loading={loading} icon={Fingerprint}>
              {loading ? 'Verifying…' : 'Unlock with Passkey'}
            </GlowButton>

            {error && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <AlertTriangle size={12} color="#F87171" />
                <span style={{ fontSize: 12, color: '#F87171' }}>{error}</span>
              </div>
            )}

            {/* Troubleshooting section */}
            <Separator label="Troubleshooting" />

            {deleteConfirm ? (
              /* Confirmation state */
              <div>
                <div style={{
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.2)',
                  borderRadius:'var(--radius-lg)', padding: '14px', marginBottom: 12,
                }}>
                  <p style={{ fontSize: 12, color: '#F87171', lineHeight: 1.6, margin: 0 }}>
                    This will permanently delete all API keys, cached data, and your passkey profile from this device. <strong>This cannot be undone.</strong>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleDeleteClick} style={{
                    flex: 1, padding: '9px', borderRadius:'var(--radius)', cursor: 'pointer',
                    border: '1px solid rgba(248,113,113,0.4)',
                    background: 'rgba(248,113,113,0.12)',
                    color: '#F87171', fontSize: 12, fontWeight: 600,
                    fontFamily: 'Inter, system-ui',
                  }}>
                    Yes, delete everything
                  </button>
                  <button onClick={() => { setDeleteConfirm(false); setDeleteStep2(false) }} style={{
                    padding: '9px 16px', borderRadius:'var(--radius)', cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.4)', fontSize: 12,
                    fontFamily: 'Inter, system-ui',
                  }}>Cancel</button>
                </div>
              </div>
            ) : (
              <GlowButton onClick={handleDeleteClick} danger icon={Trash2}>
                Delete Profile &amp; Clear Cache
              </GlowButton>
            )}
          </>
        )}

        {/* ── Unlock success flash ── */}
        {success && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            color: '#34D399', fontSize: 14, fontWeight: 600, marginTop: 8,
          }}>
            <ShieldCheck size={18} />
            Unlocked successfully
          </div>
        )}
      </div>
    </div>
  )
}
