import type { Color } from 'claude-code'

// Theme keys only, so Pulse follows the person's theme.

// The bar's grey: labels, separators, reset times, cost and unknown values.
// `inactive` drawn with `dimColor` (one step darker); `subtle` stays for the meter's track.
export const GREY: Color = 'inactive'
export const TRACK: Color = 'subtle'

export const redLevel = (alarm: number) => Math.min(alarm + 15, 95)

export const ctxColor = (p: number | null, alarm: number): Color =>
  p === null ? GREY : p >= redLevel(alarm) ? 'error' : p >= alarm ? 'warning' : 'success'

// A cold cache bills the whole prompt again: low is bad.
export const cacheColor = (p: number | null): Color =>
  p === null ? GREY : p >= 80 ? 'success' : p >= 50 ? 'warning' : 'error'

export const limitColor = (p: number): Color => (p >= 90 ? 'error' : p >= 70 ? 'warning' : 'text')
