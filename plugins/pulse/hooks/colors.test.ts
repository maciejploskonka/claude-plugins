import { describe, expect, test } from 'claude-code/testing'

import { cacheColor, ctxColor, limitColor, redLevel } from './colors'

describe('colours', () => {
  test('red level is alarm + 15, at most 95', () => {
    expect(redLevel(50)).toBe(65)
    expect(redLevel(75)).toBe(90)
    expect(redLevel(90)).toBe(95)
  })

  test('context: green, yellow from alarm, red from red level, grey when unknown', () => {
    expect(ctxColor(null, 75)).toBe('inactive')
    expect(ctxColor(74, 75)).toBe('success')
    expect(ctxColor(75, 75)).toBe('warning')
    expect(ctxColor(90, 75)).toBe('error')
  })

  test('cache: green from 80, yellow 50-79, red below 50', () => {
    expect(cacheColor(null)).toBe('inactive')
    expect(cacheColor(80)).toBe('success')
    expect(cacheColor(79)).toBe('warning')
    expect(cacheColor(49)).toBe('error')
  })

  test('limits: text below 70, yellow 70-89, red from 90', () => {
    expect(limitColor(69)).toBe('text')
    expect(limitColor(70)).toBe('warning')
    expect(limitColor(90)).toBe('error')
  })
})
