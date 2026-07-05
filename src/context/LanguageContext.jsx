/**
 * MODULE: CONTEXT / LanguageContext.jsx
 * Provides the translation function t() and language switcher to all components.
 * Usage in any component:
 *   import { useLang } from '../../context/LanguageContext.jsx'
 *   const { t, lang, switchLang } = useLang()
 *   <span>{t.navDashboard}</span>
 */

import { createContext, useContext, useState } from 'react'
import { T } from '../data/translations.js'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem('tp_lang') || 'en'
  )

  const switchLang = (newLang) => {
    if (!T[newLang]) return
    setLang(newLang)
    localStorage.setItem('tp_lang', newLang)
  }

  return (
    <LanguageContext.Provider value={{ lang, switchLang, t: T[lang] ?? T.en }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>')
  return ctx
}
