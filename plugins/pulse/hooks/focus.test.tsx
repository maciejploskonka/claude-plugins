import { describe, expect, test } from 'claude-code/testing'

import { defaults } from './config'
import { BAND, START, engine, runCommand } from './test-engine'

const ready = (over: object = {}) => ({ config: { ...defaults(), setupDone: true, ...over } })
const FOCUS = 'Used your typed text as the focus.'

// Text typed in the prompt box, unsent, steers the button pressed next:
// Summarize keeps it, Handoff writes about it. Nothing typed: as before.
describe('prompt text as the focus', () => {
  test('Summarize with an empty prompt box compacts as /compact does', async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    await ui.press({ key: 'summarize' })
    expect(f.compactInstructions).toEqual([undefined])
    expect(f.toasts).toEqual([])
    await ui.unmount()
  })

  test('Summarize with text typed uses it as /compact <text>, then empties the box', async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    f.draft = '  keep the auth refactor, drop the CSS detour \n'
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    await ui.press({ key: 'summarize' })
    expect(f.compactInstructions).toEqual(['keep the auth refactor, drop the CSS detour'])
    expect(f.draft).toBe('')
    expect(f.toasts).toEqual([FOCUS])
    await ui.unmount()
  })

  test('a Summarize that cannot run leaves the typed text where it was', async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    f.draft = 'keep the auth refactor'
    f.isBusy = true
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    await ui.press({ key: 'summarize' })
    expect(f.compacts).toBe(0)
    expect(f.draft).toBe('keep the auth refactor')
    expect(f.toasts).toEqual(['Cannot summarize while Claude is working.'])
    await ui.unmount()
  })

  test('Handoff with an empty prompt box writes the usual note', async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    await ui.press({ key: 'handoff' })
    await f.clock.settle()
    expect(f.submitted.at(-1)).toMatch(/^Write a handoff note to `/)
    expect(f.submitted.at(-1)).not.toMatch(/Focus/)
    await ui.unmount()
  })

  test('Handoff with text typed writes the note about it, then empties the box', async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    f.draft = 'only the billing export bug'
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    await ui.press({ key: 'handoff' })
    await f.clock.settle()
    expect(f.submitted.at(-1)).toMatch(/Focus the note on: only the billing export bug\./)
    expect(f.submitted.at(-1)).toMatch(/do not continue the work\.$/)
    expect(f.draft).toBe('')
    expect(f.toasts).toEqual([FOCUS])
    await ui.unmount()
  })

  test('/pulse-handoff <text> takes its focus from the command, not the box', async ($, on) => {
    const f = engine(on, ready({ features: { bar: false, handoff: true } }))
    await $.session.start(START)
    // While a command's hook runs, the box still holds the command line.
    f.draft = '/pulse-handoff only the billing export bug'
    await runCommand($, 'pulse-handoff', '  only the billing export bug ')
    await f.clock.settle()
    expect(f.submitted.at(-1)).toMatch(/Focus the note on: only the billing export bug\./)
    expect(f.draft).toBe('/pulse-handoff only the billing export bug')
  })
})
