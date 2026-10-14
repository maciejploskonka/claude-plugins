import { describe, expect, test } from 'claude-code/testing'

import { RESET_ICON, resetsIn, withSamples } from './format'

const NOW = Date.parse('2026-10-14T08:00:00Z')
const after = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

describe('reset times', () => {
  test('minutes, hours and minutes, then days, hours and minutes', () => {
    expect(resetsIn(after(7), NOW)).toBe(`${RESET_ICON}7m`)
    expect(resetsIn(after(125), NOW)).toBe(`${RESET_ICON}2h05m`)
    expect(resetsIn(after(4 * 1440 + 3 * 60 + 12), NOW)).toBe(`${RESET_ICON}4d03h12m`)
    expect(resetsIn(after(1440), NOW)).toBe(`${RESET_ICON}1d00h00m`)
  })

  test('past or missing: nothing', () => {
    expect(resetsIn(undefined, NOW)).toBe('')
    expect(resetsIn(after(-5), NOW)).toBe('')
  })
})

describe('preview samples', () => {
  test('a fresh session gets a sample for every number', () => {
    const u = withSamples(null, NOW)
    expect(u.contextPercent).toBe(21)
    expect(u.contextTokens).toBe(210_000)
    expect(u.contextWindow).toBe(1_000_000)
    expect(u.limits.map(l => l.kind)).toEqual(['five_hour', 'seven_day'])
    expect(u.limits.every(l => resetsIn(l.resetsAt, NOW) !== '')).toBe(true)
    expect(u.usd).toBe(1.23)
  })

  test('real numbers win; only missing ones are filled', () => {
    const u = withSamples(
      { contextPercent: 42, contextTokens: null, contextWindow: 200_000, limits: [{ kind: 'five_hour', percentUsed: 5 }], usd: null },
      NOW,
    )
    expect(u.contextPercent).toBe(42)
    expect(u.contextTokens).toBe(84_000)
    expect(u.contextWindow).toBe(200_000)
    expect(u.limits[0]?.percentUsed).toBe(5)
    expect(u.limits[0]?.resetsAt).toBeDefined()
    expect(u.usd).toBe(1.23)
  })
})
