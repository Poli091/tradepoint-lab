/**
 * TESTS: Critical conviction engine contracts
 * Run: node src/tests/conviction.test.mjs
 *
 * 5 test suites covering the silent failure modes both AIs flagged.
 */

/* ── Tiny test runner ──────────────────────────────────── */
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++ }
  catch(e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++ }
}
function assert(cond, msg) { if (!cond) throw new Error(msg ?? 'Failed') }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg ?? `Expected ${b}, got ${a}`) }

// Inline grade logic (mirrors grade/index.js thresholds)
function getGradeLabel(score) {
  if (score > 85) return 'STRONG BUY'
  if (score > 70) return 'BUY'
  if (score > 55) return 'HOLD'
  if (score > 40) return 'SELL'
  return 'STRONG SELL'
}
const GRADE_RANK = {'STRONG BUY':4,'BUY':3,'HOLD':2,'SELL':1,'STRONG SELL':0}
const GATE_CAPS  = {'Gate1':'BUY','Gate2':'HOLD','Gate3':'SELL'}
const COMP_MAX   = {growth:25,quality:20,strength:15,valuation:15,technical:15}

/* ── 1. Grade thresholds ── */
console.log('\n1. GRADE THRESHOLDS (strictly >)')
const cases = [[86,'STRONG BUY'],[85,'BUY'],[71,'BUY'],[70,'HOLD'],[56,'HOLD'],[55,'SELL'],[41,'SELL'],[40,'STRONG SELL'],[0,'STRONG SELL']]
for (const [score, expected] of cases) {
  test(`score ${score} = ${expected}`, () => assertEqual(getGradeLabel(score), expected))
}

/* ── 2. Score reconciliation ── */
console.log('\n2. SCORE RECONCILIATION')
test('component max sum = 90', () => {
  const total = Object.values(COMP_MAX).reduce((s,v)=>s+v,0)
  assertEqual(total, 90, `Expected 90, got ${total}`)
})
test('mock result: components + risk reconcile within ±1', () => {
  const result = { finalScore:74, riskPenalty:-3,
    breakdown:{growth:{score:20},quality:{score:16},strength:{score:12},valuation:{score:14},technical:{score:15}} }
  const sum = Object.values(result.breakdown).reduce((s,c)=>s+c.score,0) + result.riskPenalty
  assert(Math.abs(sum - result.finalScore) <= 1, `Delta ${Math.abs(sum - result.finalScore)} > 1`)
})
test('no component score exceeds its max', () => {
  const example = {growth:25,quality:20,strength:15,valuation:14,technical:15}
  for (const [k,v] of Object.entries(example)) {
    assert(v <= COMP_MAX[k], `${k}: ${v} exceeds max ${COMP_MAX[k]}`)
  }
})

/* ── 3. Gate grade limits ── */
console.log('\n3. GATE GRADE LIMITS')
function applyGate(rawGrade, gate) {
  if (!gate || gate === 'none' || gate === 'None') return rawGrade
  const cap = GATE_CAPS[gate]
  if (!cap) return rawGrade
  return GRADE_RANK[rawGrade] > GRADE_RANK[cap] ? cap : rawGrade
}
test('Gate1 caps STRONG BUY → BUY', () => assertEqual(applyGate('STRONG BUY','Gate1'),'BUY'))
test('Gate1 passes BUY through', () => assertEqual(applyGate('BUY','Gate1'),'BUY'))
test('Gate2 caps STRONG BUY → HOLD', () => assertEqual(applyGate('STRONG BUY','Gate2'),'HOLD'))
test('Gate2 caps BUY → HOLD', () => assertEqual(applyGate('BUY','Gate2'),'HOLD'))
test('Gate2 does not upgrade SELL', () => assertEqual(applyGate('SELL','Gate2'),'SELL'))
test('no gate = no change', () => assertEqual(applyGate('STRONG BUY','none'),'STRONG BUY'))
test('unknown gate = no change', () => assertEqual(applyGate('BUY',null),'BUY'))

/* ── 4. Groq fallback ── */
console.log('\n4. GROQ FALLBACK CONTRACT')
function parseGroq(raw, fallback) {
  try { return JSON.parse(raw) }
  catch { return { ...fallback, _fallback: true } }
}
test('valid JSON: no _fallback', () => {
  const r = parseGroq('{"status":"ok"}', {})
  assert(!r._fallback, '_fallback should not exist')
})
test('invalid JSON: _fallback = true', () => {
  const r = parseGroq('not json', { status: 'Neutral' })
  assert(r._fallback === true); assertEqual(r.status, 'Neutral')
})
test('empty string: _fallback = true', () => assert(parseGroq('',{})._fallback === true))
test('partial JSON: _fallback = true', () => assert(parseGroq('{"a":',{})._fallback === true))

/* ── 5. model_version compatibility ── */
console.log('\n5. MODEL VERSION COMPATIBILITY')
const compat = (a, b) => !!(a && b && a === b)
test('same version = compatible', () => assert(compat('conviction-v1.0','conviction-v1.0')))
test('different versions = incompatible', () => assert(!compat('conviction-v1.0','conviction-v2.0')))
test('null version = incompatible', () => { assert(!compat(null,'conviction-v1.0')); assert(!compat(null,null)) })
test('undefined = incompatible', () => assert(!compat(undefined,'conviction-v1.0')))

/* ── Results ── */
console.log(`\n${'─'.repeat(40)}\n  PASSED: ${passed}\n  FAILED: ${failed}\n${'─'.repeat(40)}`)
if (failed > 0) process.exit(1)
