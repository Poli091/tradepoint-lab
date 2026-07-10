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
 *
 * NOTE: Gates override grade by capping the score before grading.
 * e.g. Gate2 active → score capped at 58 → max grade = HOLD
 */

export const GRADES = [
  { min: 85, label: 'STRONG BUY',  stars: 5, color: '#22C55E', cssVar: 'var(--grade-strong-buy)',  bg: 'var(--grade-strong-buy-dim)'  },
  { min: 70, label: 'BUY',         stars: 4, color: '#86EFAC', cssVar: 'var(--grade-buy)',          bg: 'var(--grade-buy-dim)'         },
  { min: 55, label: 'HOLD',        stars: 3, color: '#FBBF24', cssVar: 'var(--grade-hold)',         bg: 'var(--grade-hold-dim)'        },
  { min: 40, label: 'SELL',        stars: 2, color: '#F97316', cssVar: 'var(--grade-sell)',         bg: 'var(--grade-sell-dim)'        },
  { min: 0,  label: 'STRONG SELL', stars: 1, color: '#EF4444', cssVar: 'var(--grade-strong-sell)',  bg: 'var(--grade-strong-sell-dim)' },
]

/**
 * Returns the CSS variable for a grade — use in JSX style props.
 * Falls back to hex for canvas/SVG contexts via grade.color.
 */
export function gradeVar(gradeLabel) {
  const found = GRADES.find(entry => entry.label === gradeLabel)
  return found?.cssVar ?? 'var(--txt-muted)'
}

export function gradeBgVar(gradeLabel) {
  const found = GRADES.find(entry => entry.label === gradeLabel)
  return found?.bg ?? 'transparent'
}

/** Get the display color for a grade label */
export function getGradeColor(gradeLabel) {
  const found = GRADES.find(entry => entry.label === gradeLabel)
  return found?.color ?? 'var(--txt-muted)'
}

export function getGrade(finalScore) {
  return GRADES.find(entry => finalScore >= entry.min) ?? GRADES[GRADES.length - 1]
}
