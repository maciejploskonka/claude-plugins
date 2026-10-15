import { describe, expect, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'

import { defaults, focusOrder } from './config'
import { BAND, PANE_PROPS, START, SURFACES, engine, runCommand } from './test-engine'

const PANE = { component: 'Pane', requestId: 'pulse-setup', props: PANE_PROPS } as const

// The wizard as a terminal or desktop draws it.
type Wizard = Mounted<'terminal' | 'desktop', 'Pane'>

// Next's key names its step (next-features, next-bar, ...): press whichever is drawn.
const nextKey = async (pane: Wizard) =>
  (await pane.findAll({ type: 'Button' })).find(b => b.key?.startsWith('next-'))?.key ?? 'next-missing'
const next = async (pane: Wizard) => pane.press({ key: await nextKey(pane) })

describe('setup wizard', () => {
  for (const surface of SURFACES) {
    test(`first launch opens it; choices apply on Finish and persist (${surface})`, async ($, on) => {
      const f = engine(on)
      await $.session.start(START)
      expect(f.opened).toEqual(['pulse-setup'])

      const pane = (await $.ui.mount({ plugin: 'pulse', surface, ...PANE } as never)) as Wizard
      expect(await pane.find({ text: /step 1\/4/ })).toBeDefined()

      // Handoff off: the details step drops out.
      await pane.press({ key: 'f-handoff' })
      expect(await pane.find({ text: /\[ \] Handoff/ })).toBeDefined()
      expect(await pane.find({ text: /step 1\/3/ })).toBeDefined()

      await next(pane)
      await pane.press({ key: 'b-cost' })
      await pane.press({ key: 'meter-number' })
      // Under the wizard, the bar's place previews the answers: no cost, no meter bar.
      f.panes = [{ id: 'pulse-setup', title: 'Pulse setup', isShown: true, isFocused: true, isPlaced: true }]
      const under = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })
      const shown = (await under.find({ key: 'setup-preview' }))?.text ?? ''
      expect(shown).toMatch(/^Preview: ctx/)
      expect(shown).not.toMatch(/█|\$1\.23/)
      await under.unmount()
      f.panes = []
      expect(await pane.find({ text: /Preview|ctx / })).toBeUndefined()

      await pane.press({ key: 'back' })
      expect(await pane.find({ text: /step 1\/3/ })).toBeDefined()
      await next(pane)
      await next(pane)
      await pane.press({ key: 'alarm-50' })
      expect(await pane.find({ text: /Yellow from 50%, red from 65%\./ })).toBeDefined()
      await pane.press({ key: 'finish' })
      // A result screen, not an instant close: it says it worked and what is on.
      expect(f.closed).not.toContain('pulse-setup')
      expect(await pane.find({ text: /✓ Pulse is set up\. You're ready to roll\./ })).toBeDefined()
      expect(await pane.find({ text: /On: usage bar \(warns at 50%\)/ })).toBeDefined()
      expect(await pane.find({ text: /Change it any time with \/pulse-setup\./ })).toBeDefined()
      expect((await pane.find({ type: 'Button', key: 'done-close' }))?.props?.hotkey).toBe('c')
      await pane.press({ key: 'done-close' })
      expect(f.closed).toContain('pulse-setup')
      await pane.unmount()

      const band = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })
      expect(await band.find({ text: /ctx 42%/ })).toBeDefined()
      expect(await band.find({ text: /\$1\.23/ })).toBeUndefined()
      expect(await band.find({ text: /not set up/ })).toBeUndefined()
      await band.unmount()

      // A new session reads the saved answers and does not ask again.
      await $.session.start(START)
      expect(f.opened).toEqual(['pulse-setup'])
      expect((await runCommand($, 'pulse-handoff')).text).toBe('Handoff is turned off. Turn it on in /pulse-setup.')
    })

    test(`"Use defaults" from the row saves and stops asking (${surface})`, async ($, on) => {
      const f = engine(on)
      await $.session.start(START)
      const band = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })
      expect(await band.find({ text: /Pulse is not set up yet/ })).toBeDefined()

      await band.press({ key: 'setup-defaults' })
      expect(await band.find({ text: /not set up/ })).toBeUndefined()
      await band.unmount()

      await $.session.start(START)
      expect(f.opened).toEqual(['pulse-setup'])
    })
  }

  test('closing without Finish saves nothing and keeps the row', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    await pane.press({ key: 'f-bar' })
    // Left without Finish (the kit cannot raise the person's close mark).
    await pane.unmount()

    const band = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect(await band.find({ text: /ctx/ })).toBeDefined()
    expect(await band.find({ text: /Pulse is not set up yet/ })).toBeDefined()
    await band.unmount()
  })

  test('/pulse-setup starts from the saved config', async ($, on) => {
    const c = defaults()
    const f = engine(on, { config: { ...c, setupDone: true, features: { ...c.features, handoff: false } } })
    await $.session.start(START)
    expect(f.opened).toEqual([])

    expect((await runCommand($, 'pulse-setup')).text).toBe('Pulse setup opened.')
    expect(f.opened).toEqual(['pulse-setup'])
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    expect(await pane.find({ text: /\[ \] Handoff/ })).toBeDefined()
    expect(await pane.find({ text: /\[x\] Usage bar/ })).toBeDefined()
    await pane.unmount()
  })

  test('project note folder shows the .gitignore hint', async ($, on) => {
    engine(on, { config: { ...defaults(), setupDone: true } })
    await $.session.start(START)
    await runCommand($, 'pulse-setup')
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    await next(pane)
    await next(pane)
    await next(pane)
    expect(await pane.find({ text: /step 4\/4/ })).toBeDefined()
    expect(await pane.find({ text: /\.gitignore/ })).toBeUndefined()
    await pane.press({ key: 'handoff-dir-project' })
    expect(await pane.find({ text: /Add \.claude\/handoffs\/ to \.gitignore/ })).toBeDefined()
    await pane.unmount()
  })

  test('/pulse-reset restores defaults and stays set up', async ($, on) => {
    const c = defaults()
    const f = engine(on, { config: { ...c, setupDone: true, features: { ...c.features, bar: false } } })
    await $.session.start(START)
    expect((await runCommand($, 'pulse-reset')).text).toBe('Pulse settings were reset to defaults.')

    const band = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect(await band.find({ text: /ctx/ })).toBeDefined()
    expect(await band.find({ text: /not set up/ })).toBeUndefined()
    await band.unmount()
    expect(f.opened).toEqual([])
  })

  test('"Use defaults" also closes the waiting wizard pane', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    const band = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    await band.press({ key: 'setup-defaults' })
    expect(f.closed).toContain('pulse-setup')
    await band.unmount()
  })

  test('Esc closes the wizard, and it opens with the keyboard', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    expect(f.openArgs).toEqual([{ id: 'pulse-setup', closeOnEscape: true, focus: true }])
  })

  test('Next, Back and Finish have letter keys, toggles none; the focus starts at the top', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    const button = (key: string) => pane.find({ type: 'Button', key })
    const hotkey = async (key: string) => (await button(key))?.props?.hotkey
    expect((await button('f-bar'))?.props?.autoFocus).toBe(true)
    expect((await button('next-features'))?.props?.autoFocus).toBeUndefined()
    // Digits are the engine's (band surveys) and leave the pane: no digit keys.
    expect([await hotkey('f-bar'), await hotkey('f-handoff')]).toEqual([undefined, undefined])
    expect(await hotkey('next-features')).toBe('n')
    expect(await pane.find({ text: /^↑↓ move · Enter picks · n next · Esc closes$/ })).toBeDefined()

    await next(pane)
    expect(await hotkey('back')).toBe('b')
    expect(await hotkey('b-tokens')).toBeUndefined()
    expect(await pane.find({ text: /^\d: / })).toBeUndefined()
    await next(pane)
    await next(pane)
    expect(await hotkey('finish')).toBe('f')
    await pane.unmount()
  })

  test('/pulse-setup asks for the keyboard again once the command is done', async ($, on) => {
    const f = engine(on, { config: { ...defaults(), setupDone: true } })
    await $.session.start(START)
    await runCommand($, 'pulse-setup')
    expect(f.openArgs).toHaveLength(1)
    f.panes = [{ id: 'pulse-setup', title: 'Pulse setup', isShown: true, isFocused: true, isPlaced: true }]
    await f.clock.settle()
    expect(f.openArgs).toHaveLength(2)
    expect(f.openArgs[1]?.focus).toBe(true)
    expect(f.toasts).toEqual([])
  })

  test('when the keyboard is refused, a toast says how to reach the wizard', async ($, on) => {
    const f = engine(on, { config: { ...defaults(), setupDone: true } })
    await $.session.start(START)
    await runCommand($, 'pulse-setup')
    f.panes = [{ id: 'pulse-setup', title: 'Pulse setup', isShown: true, isFocused: false, isPlaced: true }]
    await f.clock.settle()
    expect(f.toasts).toEqual(['Press ctrl+x then Tab to use the Pulse setup with the keyboard.'])
  })

  test('no dropdowns: every choice is a column of options Up and Down reach', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    await next(pane)
    expect(await pane.find({ type: 'Select' })).toBeUndefined()
    // One option per line: Up and Down reach each, no Left or Right needed.
    expect((await pane.find({ key: 'meter' }))?.props?.flexDirection).toBe('column')
    expect((await pane.find({ type: 'Button', key: 'meter-bar' }))?.props?.label).toMatch(/^\(•\) Bar/)
    expect((await pane.find({ type: 'Button', key: 'meter-number' }))?.props?.label).toMatch(/^\( \) Number only/)
    await next(pane)
    expect(await pane.find({ type: 'Select' })).toBeUndefined()
    // Back then Next, in that order: Down reaches both without Left or Right.
    expect((await pane.find({ key: 'nav' }))?.text).toMatch(/Back.*Next/)
    await pane.press({ key: 'alarm-90' })
    expect((await pane.find({ type: 'Button', key: 'alarm-90' }))?.props?.label).toMatch(/^\(•\) 90%/)
    expect(await pane.find({ text: /Yellow from 90%, red from 95%\./ })).toBeDefined()
    await pane.unmount()
  })

  test('arrows cannot walk out of the wizard; they still move inside it', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    const person = { kind: 'person' } as const
    await $.ui.focus({ component: 'Pane', requestId: 'pulse-setup', origin: person } as never)
    expect(f.focusMoves).toEqual([])
    await $.ui.focus({ component: 'Pane', requestId: 'pulse-setup', plugin: 'pulse', element: 'next', origin: person } as never)
    expect(f.focusMoves).toEqual(['next'])
  })

  test('the arrows walk the controls in the order they are drawn, on every step', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    const drawn = async () => (await pane.findAll({ type: 'Button' })).map(b => b.key)
    for (let step = 0; step < 4; step += 1) {
      expect(await drawn()).toEqual(focusOrder({ config: defaults(), step }))
      if (step < 3) await next(pane)
    }
    await pane.press({ key: 'finish' })
    expect(await drawn()).toEqual(focusOrder({ config: defaults(), step: 3, result: { ok: true } }))
    await pane.unmount()
  })

  test('in a short pane the title, Back, Next and hints stay; the middle scrolls under the focus', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    const props = { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 8 } }
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE, props } as never)) as Wizard
    await next(pane)
    const person = { kind: 'person' } as const
    const at = (element: string) =>
      $.ui.focus({ component: 'Pane', requestId: 'pulse-setup', plugin: 'pulse', element, origin: person } as never)
    const shift = async () => (await pane.find({ key: 'window-rows' }))?.props?.marginTop
    // 8 rows: title, a blank, a 4-row window, Back and Next, hints.
    expect((await pane.find({ key: 'window' }))?.props?.height).toBe(4)
    expect((await pane.find({ key: 'window' }))?.props?.marginTop).toBe(1)
    expect((await pane.find({ key: 'nav' }))?.text).toMatch(/Back.*Next/)
    expect(await pane.find({ text: /step 2\/4/ })).toBeDefined()
    expect(await shift()).toBe(-0)

    // The step's middle is 5 rows: the meter's label, then the items.
    // The window follows the focus down by as little as shows it...
    await at('b-handoff')
    expect(await shift()).toBe(-1)
    // ...stays while the focused item shows...
    await at('meter-number')
    expect(await shift()).toBe(-1)
    // ...and the top item brings the meter's label back too.
    await at('meter-bar')
    expect(await shift()).toBe(-0)
    // Back and Next take it to the end.
    await at('next-bar')
    expect(await shift()).toBe(-1)

    // The wheel moves the window, within its ends; the frame never moves.
    const wheel = (by: number) =>
      $.ui.scroll({
        component: 'Pane',
        requestId: 'pulse-setup',
        offset: 0,
        by,
        bodyRows: 8,
        contentRows: 8,
        origin: person,
        pointer: { column: 3, row: 2 },
      } as never)
    await wheel(5)
    expect(await shift()).toBe(-1)
    await wheel(-1)
    expect(await shift()).toBe(-0)
    expect(f.scrolls).toEqual([])
    await pane.unmount()
  })

  // The arrow's focus move is $.ui.focus, which the test kit cannot resolve:
  // checked by hand. Here: which arrows still scroll the window.
  test('in a pane too short for the wizard, arrows skip the scroll until past the ends', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    await next(pane)
    const person = { kind: 'person' } as const
    const at = (element: string) =>
      $.ui.focus({ component: 'Pane', requestId: 'pulse-setup', plugin: 'pulse', element, origin: person } as never)
    const scroll = (by: number, pointer?: { column: number; row: number }) =>
      $.ui.scroll({
        component: 'Pane',
        requestId: 'pulse-setup',
        offset: 5 + by,
        by,
        bodyRows: 10,
        contentRows: 20,
        origin: person,
        pointer,
      } as never)

    // A new step starts on its top control: Up from there scrolls.
    await scroll(-1)
    expect(f.scrolls).toEqual([-1])
    f.scrolls.length = 0

    await at('b-cache')
    await scroll(1)
    await scroll(-1)
    expect(f.scrolls).toEqual([])
    // Above the first control and below the last, the arrow scrolls: the
    // title and the key hints stay reachable.
    await at('meter-bar')
    await scroll(-1)
    await at('next-bar')
    await scroll(1)
    expect(f.scrolls).toEqual([-1, 1])
    // The wheel and the page keys always scroll.
    await at('b-cache')
    await scroll(1, { column: 3, row: 2 })
    await scroll(10)
    expect(f.scrolls).toEqual([-1, 1, 1, 10])
    await pane.unmount()
  })

  test('when saving fails, Finish says so and offers to try again', async ($, on) => {
    const f = engine(on)
    f.storeError = 'disk full'
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    for (let n = 0; n < 3; n += 1) await next(pane)
    await pane.press({ key: 'finish' })
    expect(await pane.find({ text: /✗ Pulse could not save your settings: disk full/ })).toBeDefined()
    expect(f.closed).toEqual([])

    f.storeError = null
    await pane.press({ key: 'done-retry' })
    expect(await pane.find({ text: /✓ Pulse is set up/ })).toBeDefined()
    await pane.unmount()
  })

  // Moving the ring to Next on each step is $.ui.focus, which the test kit
  // cannot resolve ("no implementation for ui.focus"): checked by hand.
  test('each step starts the focus on its top control, so its number shows', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    const focused = async () =>
      (await pane.findAll({ type: 'Button' })).filter(b => b.props?.autoFocus).map(b => b.key)
    const starts: (string | undefined)[][] = []
    for (let n = 0; n < 4; n += 1) {
      starts.push(await focused())
      if (n < 3) await next(pane)
    }
    expect(starts).toEqual([['f-bar'], ['meter-bar'], ['alarm-50'], ['handoff-dir-home']])
    await pane.unmount()
  })

  test('the bar step uses two columns where they fit, one where not', async ($, on) => {
    engine(on)
    await $.session.start(START)
    for (const [bodyColumns, two] of [[80, true], [50, false]] as const) {
      const props = { ...PANE_PROPS, bodyColumns }
      const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE, props } as never)) as Wizard
      await next(pane)
      expect((await pane.find({ key: 'bar-columns' })) !== undefined).toBe(two)
      if (two) {
        expect((await pane.find({ key: 'bar-left' }))?.text).toMatch(/Context meter.*Token count.*Prompt cache/s)
        expect((await pane.find({ key: 'bar-right' }))?.text).toMatch(/Rate limits.*Handoff button/s)
      }
      await pane.press({ key: 'back' })
      await pane.unmount()
    }
  })

  test('hints, the step counter and the preview label use the bar\'s grey', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    expect((await pane.find({ type: 'Text', text: /step 1\/4/ }))?.props?.color).toBe('inactive')
    expect((await pane.find({ type: 'Text', text: /↑↓ move/ }))?.props?.color).toBe('inactive')
    expect((await pane.find({ type: 'Text', text: /↑↓ move/ }))?.props?.dimColor).toBe(true)
    await next(pane)
    await next(pane)
    expect((await pane.find({ type: 'Text', text: /Yellow from/ }))?.props?.color).toBe('inactive')
    await pane.unmount()

    f.panes = [{ id: 'pulse-setup', title: 'Pulse setup', isShown: true, isFocused: true, isPlaced: true }]
    const band = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    const label = await band.find({ type: 'Text', text: /^Preview: $/ })
    expect([label?.props?.color, label?.props?.dimColor]).toEqual(['inactive', true])
    await band.unmount()
  })

  // A key only the new step draws: $.ui.focus waits for that drawing
  // instead of landing on the old step's button.
  test('Next has its own key on each step', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const pane = (await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...PANE } as never)) as Wizard
    const keys: string[] = []
    for (let n = 0; n < 3; n += 1) {
      keys.push(await nextKey(pane))
      await next(pane)
    }
    expect(keys).toEqual(['next-features', 'next-bar', 'next-alarm'])
    expect(await pane.find({ type: 'Button', key: 'finish' })).toBeDefined()
    await pane.unmount()
  })

  test('a fresh session previews every ticked item with sample numbers, under the wizard', async ($, on) => {
    const f = engine(on)
    f.ctx = { percent: undefined, tokens: undefined }
    f.limits = []
    await $.session.start(START)
    f.panes = [{ id: 'pulse-setup', title: 'Pulse setup', isShown: true, isFocused: true, isPlaced: true }]
    const band = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    const preview = (await band.find({ key: 'setup-preview' }))?.text ?? ''
    expect(preview).toMatch(/ctx █+░+ 21% 42k\/200k/)
    expect(preview).toMatch(/cache 98%/)
    expect(preview).toMatch(/5h \d+% resets \d/)
    expect(preview).toMatch(/7d \d+% resets \d/)
    expect(preview).toMatch(/\$/)
    // The buttons as text: a preview presses nothing.
    expect(await band.find({ type: 'Button', key: 'summarize' })).toBeUndefined()
    await band.unmount()
  })

  test('given one row under the wizard, the preview is one row: no rule, no buttons', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    f.panes = [{ id: 'pulse-setup', title: 'Pulse setup', isShown: true, isFocused: true, isPlaced: true }]
    const tight = { ...BAND, props: { ...BAND.props, maxRows: 2, scroll: { offset: 0, bodyRows: 1 } } }
    const band = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...tight } as never)
    expect((await band.find({ key: 'setup-preview' }))?.props?.height).toBe(1)
    expect(await band.find({ text: /─{10}/ })).toBeUndefined()
    expect(await band.find({ text: /\[ Summarize \]/ })).toBeUndefined()
    expect((await band.find({ key: 'setup-preview' }))?.text).toMatch(/^Preview: ctx/)
    await band.unmount()
  })

  test('the preview takes the bar\'s place only while the wizard is on screen', async ($, on) => {
    const f = engine(on, { config: { ...defaults(), setupDone: true } })
    await $.session.start(START)
    await runCommand($, 'pulse-setup')
    f.panes = [{ id: 'pulse-setup', title: 'Pulse setup', isShown: true, isFocused: true, isPlaced: true }]
    const band = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'setup-preview' })).toBeDefined()
    await band.unmount()

    // Placed nowhere (a narrow terminal): the real bar, with its buttons.
    f.panes = []
    const narrow = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect(await narrow.find({ key: 'setup-preview' })).toBeUndefined()
    expect(await narrow.find({ type: 'Button', key: 'summarize' })).toBeDefined()
    await narrow.unmount()
  })
})
