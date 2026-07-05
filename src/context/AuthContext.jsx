/**
 * MODULE: CONTEXT / AuthContext.jsx
 * Manages authentication state.
 *
 * Lock triggers:
 *  · Page reload              — sessionStorage cleared automatically by browser
 *  · Tab/window close         — same
 *  · Screen lock (mobile)     — visibilitychange → 'hidden' clears session immediately
 *  · App backgrounded (mobile)— same
 *
 * Usage: wrap the app with <AuthProvider>, then use useAuth() anywhere.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  isWebAuthnSupported,
  hasRegisteredPasskey,
  registerPasskey,
  authenticatePasskey,
  clearPasskeyRegistration,
} from '../auth/webauthn.js'

const SESSION_KEY = 'tp_session'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  )
  const [hasPasskey, setHasPasskey] = useState(hasRegisteredPasskey)
  const [webAuthnOk, setWebAuthnOk] = useState(isWebAuthnSupported)

  /* ── Lock when tab/screen is hidden ── */
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        sessionStorage.removeItem(SESSION_KEY)
        setAuthenticated(false)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

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
    setAuthenticated(true)
  }, [])

  /* ── Bypass for unsupported browsers (shows warning) ── */
  const bypassUnsupported = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setAuthenticated(true)
  }, [])

  /* ── Delete profile & clear ALL data ── */
  const deleteProfile = useCallback(() => {
    // 1. Remove passkey credential ID
    clearPasskeyRegistration()

    // 2. Clear ALL localStorage (API keys + all tp_* cache)
    const allKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      allKeys.push(localStorage.key(i))
    }
    allKeys.forEach(k => localStorage.removeItem(k))

    // 3. Clear session
    sessionStorage.removeItem(SESSION_KEY)

    // 4. Reset state
    setAuthenticated(false)
    setHasPasskey(false)
  }, [])

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
