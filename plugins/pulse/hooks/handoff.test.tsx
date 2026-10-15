import { describe, expect, test } from 'claude-code/testing'

import { defaults } from './config'
import { BAND, START, SURFACES, engine, runCommand, turnEnds } from './test-engine'

const ready = (over: object = {}) => ({ config: { ...defaults(), setupDone: true, ...over } })

describe('handoff', () => {
  for (const surface of SURFACES) {
    test(`/pulse-handoff writes the note, then clears and resumes (${surface})`, async ($, on) => {
      const f = engine(on, ready())
      await $.session.start(START)
      const ui = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })

      await runCommand($, 'pulse-handoff')
      await f.clock.settle()
      const file = /`([^`]+)`/.exec(f.submitted.at(-1) ?? '')?.[1] ?? ''
      expect(file).toMatch(/^\/home\/me\/\.claude\/handoffs\/acme-\d{4}-\d\d-\d\d-\d{4}\.md$/)
      expect(await ui.find({ text: /Writing handoff note/ })).toBeDefined()

      f.files.add(file)
      await turnEnds($)
      expect(await ui.find({ text: /Handoff saved/ })).toBeDefined()

      await ui.press({ key: 'handoff-clear' })
      await f.clock.settle()
      expect(f.commands).toContain('clear')

      await $.classic.SessionStart({ source: 'clear' })
      await f.clock.settle()
      expect(f.submitted.at(-1)).toContain(`Read \`${file}\``)
      expect(await ui.find({ key: 'handoff-clear' })).toBeUndefined()
      await ui.unmount()
    })
  }

  test('the bar’s Handoff button starts the same flow', async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    await ui.press({ key: 'handoff' })
    await f.clock.settle()
    expect(f.submitted.at(-1)).toMatch(/^Write a handoff note to `/)
    expect(await ui.find({ text: /Writing handoff note/ })).toBeDefined()
    await ui.unmount()
  })

  test('project folder: note goes under the project', async ($, on) => {
    const f = engine(on, ready({ handoffDir: 'project' }))
    await $.session.start(START)
    await runCommand($, 'pulse-handoff')
    await f.clock.settle()
    expect(f.submitted.at(-1)).toMatch(/`\/repo\/acme\/\.claude\/handoffs\/acme-[\d-]+\.md`/)
  })

  test('one toast per conversation at the alarm, again after /clear', async ($, on) => {
    const f = engine(on, ready({ alarm: 60 }))
    await $.session.start(START)

    f.ctx.percent = 59
    await turnEnds($)
    expect(f.toasts.length).toBe(0)

    f.ctx.percent = 61
    await turnEnds($)
    f.ctx.percent = 70
    await turnEnds($)
    expect(f.toasts).toEqual(['Context 61% full — time for a handoff (press Handoff below).'])

    await $.classic.SessionStart({ source: 'clear' })
    await turnEnds($)
    expect(f.toasts.length).toBe(2)
  })

  test('with no Handoff button on the bar, the toast names the command', async ($, on) => {
    const f = engine(on, ready({ alarm: 60, features: { bar: false, handoff: true } }))
    await $.session.start(START)
    f.ctx.percent = 61
    await turnEnds($)
    expect(f.toasts).toEqual(['Context 61% full — time for a handoff (/pulse-handoff).'])
  })

  // /pulse-handoff is offered only where no Handoff button is there to press.
  const noButton = { ...defaults().bar, buttons: { summarize: true, handoff: false } }
  for (const [name, store, isOffered] of [
    ['the bar shows the Handoff button', ready(), false],
    ['the bar is off', ready({ features: { bar: false, handoff: true } }), true],
    ['the Handoff button is off', ready({ bar: noButton }), true],
    ['handoff is off', ready({ features: { bar: true, handoff: false } }), false],
  ] as const) {
    test(`/pulse-handoff ${isOffered ? 'is' : 'is not'} offered when ${name}`, async ($, on) => {
      const f = engine(on, store)
      await $.session.start(START)
      expect(f.registered.includes('pulse-handoff')).toBe(isOffered)
    })
  }

  test('turned off: the command answers a hint and nothing is asked', async ($, on) => {
    const c = defaults()
    const f = engine(on, ready({ features: { ...c.features, handoff: false } }))
    await $.session.start(START)
    const out = await runCommand($, 'pulse-handoff')
    await f.clock.settle()
    expect(out.text).toBe('Handoff is turned off. Turn it on in /pulse-setup.')
    expect(f.submitted).toEqual([])
  })

  test('the resume prompt is sent after the /clear hook returns, not inside it', async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    await runCommand($, 'pulse-handoff')
    await f.clock.settle()
    const file = /`([^`]+)`/.exec(f.submitted.at(-1) ?? '')?.[1] ?? ''
    f.files.add(file)
    await turnEnds($)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    await ui.press({ key: 'handoff-clear' })
    await ui.unmount()

    const before = f.submitted.length
    await $.classic.SessionStart({ source: 'clear' })
    expect(f.submitted.length).toBe(before)
    await f.clock.settle()
    expect(f.submitted.at(-1)).toContain(`Read \`${file}\``)
  })
})
