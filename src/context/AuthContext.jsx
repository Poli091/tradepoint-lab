/**
 * MODULE: CONTEXT / AuthContext.jsx
 *
 * Lock behavior:
 *  ✓ Page reload (any type)  — React state resets to false → lock screen
 *  ✓ Browser/tab close      — React state lost → lock screen on reopen
 *  ✓ Away >30 min           — visibility timer fires → lock
 *  ✗ Tab switch             — no lock (grace period active)
 *  ✗ Minimize/maximize      — no lock (grace period active)
 *
 * Key insight: NO sessionStorage needed.
 * React in-memory state handles "stay authenticated while browsing"
 * and resets on every page reload automatically.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  isWebAuthnSupported,
  hasRegisteredPasskey,
  registerPasskey,
  authenticatePasskey,
  clearPasskeyRegistration,
} from '../auth/webauthn.js'

const LOCK_TIMEOUT = 30 * 60 * 1000   // 30 minutes hidden → lock

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Always starts as false — forces passkey on every page load/reload
  const [authenticated, setAuthenticated] = useState(false)
  const [hasPasskey,    setHasPasskey]    = useState(hasRegisteredPasskey)
  const [webAuthnOk,    setWebAuthnOk]    = useState(isWebAuthnSupported)
  const lockTimerRef = useRef(null)

  /* ── 30-min inactivity timer when tab is hidden ── */
  const resetLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    lockTimerRef.current = setTimeout(() => setAuthenticated(false), LOCK_TIMEOUT)
  }, [])

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null }
  }, [])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') resetLockTimer()
      else clearLockTimer()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => { document.removeEventListener('visibilitychange', handleVisibility); clearLockTimer() }
  }, [resetLockTimer, clearLockTimer])

  /* ── Auth actions ── */
  const register = useCallback(async () => {
    await registerPasskey()
    setHasPasskey(true)
    clearLockTimer()
    setAuthenticated(true)
  }, [clearLockTimer])

  const unlock = useCallback(async () => {
    await authenticatePasskey()
    clearLockTimer()
    setAuthenticated(true)
  }, [clearLockTimer])

  const bypassUnsupported = useCallback(() => {
    setAuthenticated(true)
  }, [])

  const deleteProfile = useCallback(() => {
    clearPasskeyRegistration()
    clearLockTimer()
    const allKeys = []
    for (let i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i))
    allKeys.forEach(k => localStorage.removeItem(k))
    setAuthenticated(false)
    setHasPasskey(false)
  }, [clearLockTimer])

  return (
    <AuthContext.Provider value={{ authenticated, hasPasskey, webAuthnOk, register, unlock, bypassUnsupported, deleteProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>')
  return ctx
}
