/**
 * MODULE: conviction/grade/index.js
 * Maps final score to conviction grade.
 *
 * Score  Grade         Stars
 * 85–100 STRONG BUY    ⭐⭐⭐⭐⭐
 * 70–84  BUY           ⭐⭐⭐⭐
 * 55–69  HOLD          ⭐⭐⭐
 * 40–54  SELL          ⭐⭐
 * 0–39   STRONG SELL   ⭐
 */

export const GRADES = [
  { min: 85, label: 'STRONG BUY',  stars: 5, color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  { min: 70, label: 'BUY',         stars: 4, color: '#86EFAC', bg: 'rgba(134,239,172,0.10)' },
  { min: 55, label: 'HOLD',        stars: 3, color: '#FBBF24', bg: 'rgba(251,191,36,0.10)'  },
  { min: 40, label: 'SELL',        stars: 2, color: '#F97316', bg: 'rgba(249,115,22,0.10)'  },
  { min: 0,  label: 'STRONG SELL', stars: 1, color: '#EF4444', bg: 'rgba(239,68,68,0.10)'   },
]

export function getGradeColor(gradeLabel) {
  const found = GRADES.find(entry => entry.label === gradeLabel)
  return found?.color ?? 'var(--txt-muted)'
}

export function getGrade(finalScore) {
  return GRADES.find(entry => finalScore >= entry.min) ?? GRADES[GRADES.length - 1]
}
