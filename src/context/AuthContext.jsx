/**
 * MODULE: CONTEXT / AuthContext.jsx
 *
 * Lock triggers:
 *  ✓ Page reload    — sessionStorage cleared automatically by browser
 *  ✓ Tab/window close — same
 *  ✓ Away for >30 min — timer-based lock (security for long absences)
 *  ✗ Tab switch      — NO lock (grace period)
 *  ✗ Minimize/maximize — NO lock (grace period)
 *
 * The 30-minute grace period means:
 *  · Switching tabs briefly: stays unlocked
 *  · Minimizing the window: stays unlocked
 *  · Leaving the computer for >30 min: locks automatically
 *  · Reloading the page: always locks (sessionStorage)
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  isWebAuthnSupported,
  hasRegisteredPasskey,
  registerPasskey,
  authenticatePasskey,
  clearPasskeyRegistration,
} from '../auth/webauthn.js'

const SESSION_KEY  = 'tp_session'
const LOCK_TIMEOUT = 30 * 60 * 1000   // 30 minutes of inactivity → lock

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  )
  const [hasPasskey, setHasPasskey] = useState(hasRegisteredPasskey)
  const [webAuthnOk, setWebAuthnOk] = useState(isWebAuthnSupported)
  const lockTimerRef = useRef(null)

  /* ── Start/reset the 30-min inactivity timer ── */
  const resetLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    lockTimerRef.current = setTimeout(() => {
      sessionStorage.removeItem(SESSION_KEY)
      setAuthenticated(false)
    }, LOCK_TIMEOUT)
  }, [])

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current)
      lockTimerRef.current = null
    }
  }, [])

  /* ── Visibility change: start timer when hidden, cancel when visible ── */
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Start the 30-min countdown — does NOT lock immediately
        resetLockTimer()
      } else {
        // User came back before 30 min — cancel the lock
        clearLockTimer()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearLockTimer()
    }
  }, [resetLockTimer, clearLockTimer])

  /* ── Register new passkey ── */
  const register = useCallback(async () => {
    await registerPasskey()
    sessionStorage.setItem(SESSION_KEY, '1')
    setHasPasskey(true)
    setAuthenticated(true)
  }, [])

  /* ── Authenticate with existing passkey ── */
  const unlock = useCallback(async () => {
    await authenticatePasskey()
    sessionStorage.setItem(SESSION_KEY, '1')
    clearLockTimer()
    setAuthenticated(true)
  }, [clearLockTimer])

  /* ── Bypass for unsupported browsers ── */
  const bypassUnsupported = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setAuthenticated(true)
  }, [])

  /* ── Delete profile & clear ALL data ── */
  const deleteProfile = useCallback(() => {
    clearPasskeyRegistration()
    clearLockTimer()
    const allKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      allKeys.push(localStorage.key(i))
    }
    allKeys.forEach(k => localStorage.removeItem(k))
    sessionStorage.removeItem(SESSION_KEY)
    setAuthenticated(false)
    setHasPasskey(false)
  }, [clearLockTimer])

  return (
    <AuthContext.Provider value={{
      authenticated,
      hasPasskey,
      webAuthnOk,
      register,
      unlock,
      bypassUnsupported,
      deleteProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>')
  return ctx
}
