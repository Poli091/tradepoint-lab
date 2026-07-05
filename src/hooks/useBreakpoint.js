/**
 * MODULE: HOOKS / useBreakpoint.js
 * Reactive breakpoint detection — updates on window resize.
 * Use this in components that need to change layout based on screen size.
 */

import { useState, useEffect } from 'react'

const BP = { MOBILE: 768, TABLET: 1100 }

function detect(w) {
  if (w < BP.MOBILE)  return 'mobile'
  if (w < BP.TABLET)  return 'tablet'
  return 'desktop'
}

export function useBreakpoint() {
  const [bp, setBp] = useState(() => detect(window.innerWidth))

  useEffect(() => {
    const handler = () => setBp(detect(window.innerWidth))
    window.addEventListener('resize', handler, { passive: true })
    return () => window.removeEventListener('resize', handler)
  }, [])

  return {
    breakpoint: bp,
    isMobile:   bp === 'mobile',
    isTablet:   bp === 'tablet',
    isDesktop:  bp === 'desktop',
    isNarrow:   bp !== 'desktop',   // tablet or mobile
  }
}
