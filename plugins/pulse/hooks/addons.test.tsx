import { describe, expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

import { readAddon, splitCommand } from './addons'
import { defaults } from './config'
import { BAND, START, engine } from './test-engine'

const ready = (over: object = {}) => ({ config: { ...defaults(), setupDone: true, ...over } })

// A stand-in for pulse-caveman: publishes its add-on value at session start.
// Inline plugins close over nothing of the test file, so each is written out.
const cavemanOn: Plugin = {
  name: 'pulse-caveman',
  register: on => {
    on('session.start', async ($, e, next) => {
      const done = await next(e)
      await $.state.set({ plugin: 'pulse-caveman', key: 'addon' }, {
        contract: 1,
        stat: [
          { color: 'inactive', text: 'caveman ', dim: true },
          { color: 'text', text: 'full' },
          { color: 'inactive', text: ' · on 12m', dim: true },
        ],
        short: [
          { color: 'inactive', text: 'cave ', dim: true },
          { color: 'text', text: 'full' },
        ],
        label: 'caveman',
        buttons: [{ key: 'off', label: 'Off', command: '/pulse-caveman off' }],
        buttonsAt: 2,
        prompt: null,
      })
      return done
    })
  },
}

// The same, asking for its buttons in Pulse's button row.
const cavemanOnInRow: Plugin = {
  name: 'pulse-caveman',
  register: on => {
    on('session.start', async ($, e, next) => {
      const done = await next(e)
      await $.state.set({ plugin: 'pulse-caveman', key: 'addon' }, {
        contract: 1,
        stat: [
          { color: 'inactive', text: 'caveman ', dim: true },
          { color: 'text', text: 'full' },
          { color: 'inactive', text: ' · on 12m', dim: true },
        ],
        label: 'caveman',
        buttons: [{ key: 'off', label: 'Off', command: '/pulse-caveman off' }],
        short: null,
        buttonsAt: null,
        prompt: null,
      })
      return done
    })
  },
}

const cavemanAsks: Plugin = {
  name: 'pulse-caveman',
  register: on => {
    on('session.start', async ($, e, next) => {
      const done = await next(e)
      await $.state.set({ plugin: 'pulse-caveman', key: 'addon' }, {
        contract: 1,
        stat: null,
        short: null,
        label: 'caveman',
        buttons: [],
        buttonsAt: null,
        prompt: {
          parts: [{ color: 'claude', text: 'Start this session in caveman?' }],
          buttons: [
            { key: 'full', label: 'full', command: 'pulse-caveman full' },
            { key: 'not-now', label: 'Not now', command: 'pulse-caveman not-now' },
          ],
        },
      })
      return done
    })
  },
}

const cavemanFromTheFuture: Plugin = {
  name: 'pulse-caveman',
  register: on => {
    on('session.start', async ($, e, next) => {
      const done = await next(e)
      await $.state.set({ plugin: 'pulse-caveman', key: 'addon' }, {
        contract: 2,
        stat: [{ color: 'text', text: 'caveman v2' }],
        label: 'caveman',
        buttons: [],
        buttonsAt: null,
        prompt: null,
      } as never)
      return done
    })
  },
}

// A stand-in add-on that only draws what Pulse says about add-ons, as the
// real one reads it.
const cavemanReadsPulse: Plugin = {
  name: 'pulse-caveman',
  register: on => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const { value } = await $.state.get({ plugin: 'pulse', key: 'addons' })
      return <Text>{`pulse.addons=${JSON.stringify(value ?? null)}`}</Text>
    })
  },
}

const seenByAddon = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'pulse-caveman', surface: 'terminal', ...BAND })
  const text = (await ui.find({ text: /^pulse\.addons=/ }))?.text
  await ui.unmount()
  return text
}

describe('add-ons in the bar', () => {
  test('an add-on\'s stat ends the stats row, its button inside it', { plugins: [cavemanOn] }, async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    const stats = (await ui.find({ key: 'bar-stats' }))?.text ?? ''
    expect(stats).toMatch(/\$1\.23 · caveman full ?Off · on 12m$/)
    // Nothing of the add-on's in the button row.
    expect((await ui.find({ key: 'bar-actions' }))?.text).not.toMatch(/caveman|Off/)

    await ui.press({ key: 'addon-pulse-caveman-off' })
    expect(f.commandLines).toEqual(['pulse-caveman off'])
    await ui.unmount()
  })

  test('when the stat does not fit the rest of its row, its short form is drawn there', { plugins: [cavemanOn] }, async ($, on) => {
    engine(on, ready())
    await $.session.start(START)
    const at = async (bodyColumns: number) => {
      const props = { ...BAND.props, bodyColumns }
      const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND, props } as never)
      const firstRow = (await ui.find({ key: 'bar-row-0' }))?.text ?? ''
      await ui.unmount()
      return firstRow
    }
    // Where the stats end without the add-on: the stat measures with its button drawn as `[ Off ]`.
    const wide = await at(300)
    const base = wide.indexOf(' · caveman')
    const fullWidth = base + ' · caveman full [ Off ] · on 12m'.length
    expect(await at(fullWidth)).toMatch(/ · caveman full ?Off · on 12m$/)
    expect(await at(fullWidth - 1)).toMatch(/ · cave full ?Off$/)
    // Too narrow even for the short form: the full stat moves to the next row.
    expect(await at(base + 2)).not.toMatch(/cave/)
  })

  test('the inline button hides while Claude works', { plugins: [cavemanOn] }, async ($, on) => {
    engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND, props: { ...BAND.props, isWorking: true } } as never)
    expect((await ui.find({ key: 'bar-stats' }))?.text).toMatch(/caveman full · on 12m$/)
    expect(await ui.find({ type: 'Button', key: 'addon-pulse-caveman-off' })).toBeUndefined()
    await ui.unmount()
  })

  test('an add-on that asks for the button row gets it, after Pulse\'s own', { plugins: [cavemanOnInRow] }, async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'bar-stats' }))?.text).toMatch(/\$1\.23 · caveman full · on 12m$/)
    expect((await ui.find({ key: 'bar-actions' }))?.text).toMatch(/Summarize.*Handoff {3}caveman: .*Off/)
    await ui.press({ key: 'addon-pulse-caveman-off' })
    expect(f.commandLines).toEqual(['pulse-caveman off'])
    await ui.unmount()
  })

  test('an add-on\'s question gets a row of its own above the bar', { plugins: [cavemanAsks] }, async ($, on) => {
    const f = engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    const row = (await ui.find({ key: 'addon-pulse-caveman-prompt' }))?.text ?? ''
    expect(row).toMatch(/^Start this session in caveman\? .*full.*Not now/)
    // The bar stays as it was: no stat, no buttons from this add-on.
    expect((await ui.find({ key: 'bar-stats' }))?.text).not.toMatch(/caveman/)
    await ui.press({ key: 'addon-pulse-caveman-not-now' })
    expect(f.commandLines).toEqual(['pulse-caveman not-now'])
    await ui.unmount()
  })

  test('with no add-on installed the bar is as before', async ($, on) => {
    engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'bar-stats' }))?.text).toMatch(/\$1\.23$/)
    expect((await ui.find({ key: 'bar-actions' }))?.text).not.toMatch(/:/)
    expect(await ui.find({ key: 'addon-prompts' })).toBeUndefined()
    await ui.unmount()
  })

  test('an add-on on a newer contract is left out', { plugins: [cavemanFromTheFuture] }, async ($, on) => {
    engine(on, ready())
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'bar-stats' }))?.text).not.toMatch(/caveman/)
    await ui.unmount()
  })

  test('with the bar off, Pulse draws no add-on', { plugins: [cavemanOn] }, async ($, on) => {
    engine(on, ready({ features: { bar: false, handoff: true } }))
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect(await ui.find({ text: /caveman/ })).toBeUndefined()
    await ui.unmount()
  })

  test('an add-on reads whether Pulse draws it: yes with the bar on', { plugins: [cavemanReadsPulse] }, async ($, on) => {
    engine(on, ready())
    await $.session.start(START)
    expect(await seenByAddon($)).toBe('pulse.addons={"contract":1}')
  })

  test('an add-on reads whether Pulse draws it: no with the bar off', { plugins: [cavemanReadsPulse] }, async ($, on) => {
    engine(on, ready({ features: { bar: false, handoff: true } }))
    await $.session.start(START)
    expect(await seenByAddon($)).toBe('pulse.addons=null')
  })
})

describe('reading an add-on\'s value', () => {
  test('anything but a contract-1 object is nothing', () => {
    expect([readAddon(null), readAddon('x'), readAddon({ contract: 2 }), readAddon([])]).toEqual([null, null, null, null])
  })

  test('a malformed button is dropped, the rest kept', () => {
    const addon = readAddon({
      contract: 1,
      stat: [{ color: 'text', text: 'ok' }],
      label: 'x',
      buttons: [{ key: 'a', label: 'A', command: 'x a' }, { key: 'b', label: 'B' }, 'junk'],
      buttonsAt: 9,
      prompt: null,
    })
    expect(addon?.buttons).toEqual([{ key: 'a', label: 'A', command: 'x a' }])
    expect(addon?.stat).toEqual([{ color: 'text', text: 'ok' }])
    // A place past the stat's end falls back to the button row.
    expect(addon?.buttonsAt).toBeNull()
  })

  test('a stat with a malformed part is left out whole', () => {
    expect(readAddon({ contract: 1, stat: [{ color: 'text', text: 'ok' }, { text: 'no colour' }], label: '', buttons: [], prompt: null })?.stat).toBeNull()
  })

  test('a command splits into the name and its arguments', () => {
    expect([splitCommand('/pulse-caveman off'), splitCommand('pulse-caveman'), splitCommand('caveman  wenyan-full ')]).toEqual([
      { command: 'pulse-caveman', args: 'off' },
      { command: 'pulse-caveman', args: '' },
      { command: 'caveman', args: 'wenyan-full' },
    ])
  })
})
