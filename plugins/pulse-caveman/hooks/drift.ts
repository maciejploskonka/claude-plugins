import type { Mode } from '../types'

// Drift: answers sliding back to the ordinary voice while caveman is on.
// A word count, not a judge: it can miss, or flag a long quote. It only
// marks caveman as fading; it never acts on its own.
//
// It looks for what every caveman mode bans: fillers and ceremony. Articles
// do not count: since caveman 3 they are allowed where they help.

const FILLER = new Set(['just', 'really', 'basically', 'actually', 'simply'])
const CEREMONY = [
  /^(sure|certainly|of course|great question)\b/i,
  /\b(i'd be happy to|i would be happy to|let me|i'll now|i will now)\b/i,
  /\b(hope this helps|let me know if)\b/i,
]
const MIN_WORDS = 40
const MAX_FILLER = 2
export const WORDY_IN_A_ROW = 3

// Modes checked: megacave is not English.
export const isChecked = (mode: Mode) => mode !== 'megacave'

// An answer is wordy at 40 words or more with two or more fillers, or any
// ceremony. Code blocks are left out: their words are code, not prose.
export const isWordy = (answer: string) => {
  const prose = answer.replace(/```[\s\S]*?```/g, ' ').trim()
  const words = prose.toLowerCase().match(/[a-z']+/g) ?? []
  if (words.length < MIN_WORDS) return false
  if (words.filter(w => FILLER.has(w)).length >= MAX_FILLER) return true
  return CEREMONY.some(phrase => phrase.test(prose))
}
