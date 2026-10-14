import { describe, expect, test } from 'claude-code/testing'

import { defaults, fromRaw } from './config'
import { START, engine } from './test-engine'

describe('config', () => {
  test('defaults: everything on, alarm 75, not set up', () => {
    const d = defaults()
    expect(d.setupDone).toBe(false)
    expect(d.features).toEqual({ bar: true, handoff: true })
    expect(d.bar.meter).toBe('bar')
    expect(d.bar.buttons).toEqual({ summarize: true, handoff: true })
    expect(d.alarm).toBe(75)
    expect(d.handoffDir).toBe('home')
  })

  test('missing and wrong fields come from defaults', () => {
    const c = fromRaw({ setupDone: true, features: { handoff: false }, bar: { meter: 'pie', cost: 'no' }, alarm: 33 })
    expect(c.setupDone).toBe(true)
    expect(c.features).toEqual({ bar: true, handoff: false })
    expect(c.bar.meter).toBe('bar')
    expect(c.bar.cost).toBe(true)
    expect(c.alarm).toBe(75)
  })

  test('a stored config that is not an object is replaced, with one toast', async ($, on) => {
    const f = engine(on, { config: 'garbage' })
    await $.session.start(START)
    expect(f.toasts).toEqual(['Pulse settings were unreadable and were reset to defaults.'])
  })

  test('a valid stored config raises no toast', async ($, on) => {
    const f = engine(on, { config: { ...defaults(), setupDone: true } })
    await $.session.start(START)
    expect(f.toasts).toEqual([])
  })
})
