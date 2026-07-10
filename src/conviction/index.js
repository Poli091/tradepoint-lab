/**
 * MODULE: conviction/index.js
 * Public API for the Conviction Score engine.
 * Import everything from here — not from internal modules.
 */

export { runConviction } from './engine.js'
export { GRADES, getGrade } from './grade/index.js'

export { runSwingConviction, getSwingGrade } from './swing/engine.js'
