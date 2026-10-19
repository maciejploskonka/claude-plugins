import { OFF } from './format'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine, Mounted, Plugin } from 'claude-code/testing'

import {
  BAND,
  START,
  SURFACES,
  answer,
  compact,
  engine,
  typeCommand,
  typeCommandLine,
  typeMessage,
} from './test-engine'

type Band = Mounted<'terminal' | 'desktop', 'AbovePrompt'>

const band = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'pulse-caveman', surface, ...BAND }) as Promise<Band>
const shows = async (ui: Band) => (await ui.find({ key: 'caveman' }))?.text ?? ''

// A wordy answer: 40+ words, with fillers and ceremony every caveman mode bans.
const WORDY =
  'Sure! The fix is really just a small change to the way the cache is built, and it basically means that the ' +
  'whole page is simply rendered again when the user opens the menu, so the result is actually the same as before.'
// A terse one: articles allowed, no fillers, no ceremony.
const TERSE =
  'The cache key was wrong. Fix: hash the route and the locale. The page no longer renders again on menu open. ' +
  'Tests pass. Next: drop the old helper, move the key function to utils, add a case for an empty locale, open the PR.'

describe('a new session', () => {
  for (const surface of SURFACES) {
    test(`asks, offering the installed modes; a press turns that mode on (${surface})`, async ($, on) => {
      const f = engine(on)
      await $.session.start(START)
      const ui = await band($, surface)
      expect(await shows(ui)).toMatch(/^Start this session in caveman\? caveman ultracave Not now$/)

      await ui.press({ key: 'caveman-ultracave' })
      await f.clock.settle()
      expect(f.ran).toEqual(['ultracave'])
      expect(await shows(ui)).toBe('ultracave (0m) Off')
      await ui.unmount()
    })
  }

  test('offers megacave too when it is installed', async ($, on) => {
    engine(on, { skills: ['caveman', 'ultracave', 'megacave'] })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/caveman ultracave megacave Not now$/)
    await ui.unmount()
  })

  test('Not now, or the first message, shrinks it to the off row', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const ui = await band($)
    await ui.press({ key: 'caveman-not-now' })
    expect(await shows(ui)).toBe('caveman off modes')
    await ui.unmount()
  })

  test('modes opens the off row: a button per mode, then hide', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const ui = await band($)
    await ui.press({ key: 'caveman-not-now' })
    await ui.press({ key: 'caveman-modes' })
    expect(await shows(ui)).toBe('caveman off caveman ultracave off hide')
    // off folds it back, without hiding it.
    await ui.press({ key: 'caveman-off' })
    expect(await shows(ui)).toBe('caveman off modes')
    await ui.press({ key: 'caveman-modes' })
    // Turned on and off again: short once more.
    await ui.press({ key: 'caveman-ultracave' })
    await ui.press({ key: 'caveman-off' })
    expect(await shows(ui)).toBe('caveman off modes')
    await ui.unmount()
  })

  test('the first message shrinks it too', async ($, on) => {
    engine(on)
    await $.session.start(START)
    await typeMessage($, 'hello')
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^caveman off/)
    await ui.unmount()
  })

  test('/clear: off, and the question shows again', async ($, on) => {
    engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'caveman')
    await typeCommand($, 'clear')
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })
})

describe('active', () => {
  test('shows the mode and how long it runs, with Off last', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'caveman')
    const ui = await band($)
    expect(await shows(ui)).toBe('caveman (0m) Off')
    await f.clock.advance(35 * 60_000)
    expect(await shows(ui)).toBe('caveman (35m) Off')
    await ui.unmount()
  })

  test('in a narrow terminal, just the time: caveman (35m)', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'caveman')
    await f.clock.advance(35 * 60_000)
    const narrow = { ...BAND, props: { ...BAND.props, bodyColumns: 22 } }
    const ui = (await $.ui.mount({ plugin: 'pulse-caveman', surface: 'terminal', ...narrow } as never)) as Band
    expect(await shows(ui)).toBe('caveman (35m) Off')
    await ui.unmount()
  })

  test('hide takes the off row away; turning caveman on brings it back', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const ui = await band($)
    await ui.press({ key: 'caveman-not-now' })
    await ui.press({ key: 'caveman-modes' })
    await ui.press({ key: 'caveman-hide' })
    expect(await ui.find({ key: 'caveman' })).toBeUndefined()
    await typeCommand($, 'ultracave')
    expect(await shows(ui)).toBe('ultracave (0m) Off')
    await ui.press({ key: 'caveman-off' })
    expect(await shows(ui)).toBe('caveman off modes')
    await ui.unmount()
  })

  test('typed commands are followed: /caveman, its aliases, /ultracave; /caveman status changes nothing', async ($, on) => {
    engine(on, { skills: ['caveman', 'ultracave', 'megacave'] })
    await $.session.start(START)
    const ui = await band($)
    await typeCommand($, 'caveman')
    expect(await shows(ui)).toMatch(/^caveman \(/)
    await typeCommand($, 'caveman', 'ultra')
    expect(await shows(ui)).toMatch(/^ultracave \(/)
    await typeCommand($, 'caveman', 'wenyan')
    expect(await shows(ui)).toMatch(/^megacave \(/)
    await typeCommand($, 'ultracave')
    expect(await shows(ui)).toMatch(/^ultracave \(/)
    await typeCommand($, 'caveman', 'status')
    expect(await shows(ui)).toMatch(/^ultracave \(/)
    await ui.unmount()
  })

  test('/caveman status reaches the model with the mode, as the skill relays it', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommandLine($, 'caveman', 'status')
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await typeCommandLine($, 'caveman', 'status')
    expect(f.contexts).toEqual([['Caveman mode: off'], ['Caveman mode: ultracave']])
  })

  test('skills from a plugin (caveman:ultracave) are found and run by that name', async ($, on) => {
    const f = engine(on, { skills: ['caveman:caveman', 'caveman:ultracave'] })
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await f.clock.settle()
    expect(f.ran).toEqual(['caveman:ultracave'])
  })

  test('Off sends "stop caveman"; "normal mode" typed turns it off too', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'caveman')
    const ui = await band($)
    await ui.press({ key: 'caveman-off' })
    await f.clock.settle()
    expect(f.submitted).toEqual(['stop caveman'])
    expect(await shows(ui)).toMatch(/^caveman off/)

    await typeCommand($, 'pulse-caveman', 'caveman')
    await typeMessage($, 'ok, back to normal mode please')
    expect(await shows(ui)).toMatch(/^caveman off/)
    await ui.unmount()
  })

  test('a compaction leaves it as it is: Claude Code restores the skills it used', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await f.clock.advance(34 * 60_000)
    await compact($)
    const ui = await band($)
    expect(await shows(ui)).toBe('ultracave (34m) Off')
    await ui.unmount()
  })

  test('fading after wordy answers; Reload runs the mode again and keeps its start', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await f.clock.advance(34 * 60_000)
    for (let n = 0; n < 3; n += 1) await answer($, WORDY)
    const ui = await band($)
    expect(await shows(ui)).toBe('ultracave (34m) · fading Reload Off')
    await ui.press({ key: 'caveman-reload' })
    await f.clock.settle()
    expect(f.ran).toEqual(['ultracave', 'ultracave'])
    expect(await shows(ui)).toBe('ultracave (34m) Off')
    await ui.unmount()
  })

  test('three wordy answers in a row mean fading; a terse one, articles and all, resets the count', async ($, on) => {
    engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'caveman')
    const ui = await band($)
    await answer($, WORDY)
    await answer($, WORDY)
    await answer($, TERSE)
    await answer($, WORDY)
    await answer($, WORDY)
    expect(await shows(ui)).not.toMatch(/fading/)
    await answer($, WORDY)
    expect(await shows(ui)).toMatch(/fading/)
    await ui.unmount()
  })

  test('megacave is not checked for drift', async ($, on) => {
    engine(on, { skills: ['caveman', 'megacave'] })
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'megacave')
    for (let n = 0; n < 4; n += 1) await answer($, WORDY)
    const ui = await band($)
    expect(await shows(ui)).not.toMatch(/fading/)
    await ui.unmount()
  })

  test('buttons hide while Claude is working', async ($, on) => {
    engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'caveman')
    const working = { ...BAND, props: { ...BAND.props, isWorking: true } }
    const ui = (await $.ui.mount({ plugin: 'pulse-caveman', surface: 'terminal', ...working } as never)) as Band
    expect(await shows(ui)).toBe('caveman (0m)')
    await ui.unmount()
  })
})

describe('caveman\'s own start mode (its plugin starts sessions by itself)', () => {
  const PLUGIN = ['caveman:caveman', 'caveman:ultracave']

  test('no config: caveman\'s plugin starts in caveman, so no question, just active', async ($, on) => {
    engine(on, { skills: PLUGIN })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toBe('caveman (0m) Off')
    await ui.unmount()
  })

  test('CAVEMAN_DEFAULT_MODE wins: ultracave', async ($, on) => {
    engine(on, { skills: PLUGIN, env: { CAVEMAN_DEFAULT_MODE: 'ultracave' } })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^ultracave \(/)
    await ui.unmount()
  })

  test('a project\'s .caveman.json with manual: the question, as caveman starts inactive', async ($, on) => {
    engine(on, { skills: PLUGIN, files: { '/repo/.caveman.json': '{ "defaultMode": "manual" }' } })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })

  test('the user\'s ~/.config/caveman/config.json: ultracave', async ($, on) => {
    engine(on, { skills: PLUGIN, files: { '/home/me/.config/caveman/config.json': '{"defaultMode":"ultracave"}' } })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^ultracave \(/)
    await ui.unmount()
  })

  test('skills copied into a skills folder start nothing: the question, whatever the config', async ($, on) => {
    engine(on, { env: { CAVEMAN_DEFAULT_MODE: 'ultracave' } })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })

  test('/clear starts it again, active in the start mode', async ($, on) => {
    engine(on, { skills: PLUGIN, env: { CAVEMAN_DEFAULT_MODE: 'ultracave' } })
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'off')
    await typeCommand($, 'clear')
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^ultracave \(/)
    await ui.unmount()
  })
})

describe('Pulse’s Clear & continue', () => {
  // Pulse runs /clear itself, then hands the new conversation the note.
  const pulseClears = ($: Parameters<typeof typeCommand>[0]) =>
    $.command.run({ command: 'clear', args: '', origin: { kind: 'plugin', name: 'pulse' } } as never)

  test('the mode carries on: loaded again, its time kept', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await f.clock.advance(20 * 60_000)
    f.ran.length = 0
    await pulseClears($)
    await f.clock.settle()
    expect(f.ran).toContain('ultracave')
    const ui = await band($)
    expect(await shows(ui)).toBe('ultracave (20m) Off')
    await ui.unmount()
  })

  // Claude Code 2.1.301+ empties a plugin's memory a moment after /clear:
  // from then on its values read as never written, until it writes again.
  // (Another plugin may not write pulse-caveman's values, so the engine's
  // reads are rewritten instead.)
  const emptying = (on: Parameters<typeof engine>[0]) => {
    const emptied = new Set<string>()
    on('state.get', { plugin: 'pulse-caveman' }, async (_$, e, next) => {
      const r = await next(e)
      return emptied.has(e.key) && r.value ? { value: { ...r.value, value: undefined } } : r
    })
    on('state.set', { plugin: 'pulse-caveman' }, async (_$, e, next) => {
      const r = await next(e)
      emptied.delete(e.key)
      return r
    })
    return () => ['isLoaded', 'caveman', 'addon', 'skill', 'isSkipped', 'startMode'].forEach(k => emptied.add(k))
  }

  test('the clear empties this plugin’s memory after its hook: the draw’s load still carries', async ($, on) => {
    const f = engine(on)
    const empty = emptying(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await pulseClears($)
    empty()
    const ui = await band($)
    await f.clock.settle()
    expect(await shows(ui)).toBe('ultracave (0m) Off')
    await ui.unmount()
  })

  test('a new session soon after is not carried into', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await pulseClears($)
    f.sessionId = 'another-window'
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })

  test('a new window drawn before its start (Claude Code 2.1.303) is not carried into', async ($, on) => {
    const f = engine(on)
    const empty = emptying(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await pulseClears($)
    // Another window: its first draw loads before any session.start.
    f.sessionId = 'another-window'
    empty()
    const ui = await band($)
    await f.clock.settle()
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })

  test('off before it: a fresh start, as after a typed /clear', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'not-now')
    f.ran.length = 0
    await pulseClears($)
    await f.clock.settle()
    expect(f.ran).toEqual(['clear'])
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })
})

describe('typed /pulse-caveman', () => {
  // The host refuses a command or prompt while the typed command's own hook
  // still runs (Claude Code 2.1.301), so the first tries can fail.
  test('<mode> loads the skill, though the first tries are refused', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    f.refusals = 3
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await f.clock.advance(2_000)
    expect(f.ran).toContain('ultracave')
    expect(f.toasts).toEqual([])
  })

  test('off sends stop caveman, though the first tries are refused', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await f.clock.settle()
    f.refusals = 3
    await typeCommand($, 'pulse-caveman', 'off')
    await f.clock.advance(2_000)
    expect(f.submitted).toContain('stop caveman')
  })

  test('refused for good: a toast says what to do', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    f.refusals = 1000
    await typeCommand($, 'pulse-caveman', 'ultracave')
    await f.clock.advance(10_000)
    expect(f.toasts.at(-1)).toMatch(/Could not run \/ultracave/)
  })
})

describe('the timer', () => {
  test('the minute turns over on time, counted from when caveman turned on', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    // Turned on 40 s into the session: a session-start clock would be 40 s late.
    await f.clock.advance(40_000)
    await typeCommand($, 'pulse-caveman', 'caveman')
    const ui = await band($)
    await f.clock.advance(59_000)
    expect(await shows(ui)).toBe('caveman (0m) Off')
    await f.clock.advance(1_000)
    expect(await shows(ui)).toBe('caveman (1m) Off')
    await ui.unmount()
  })
})

describe('a long run', () => {
  test('past midnight it says how long: (1d02h05m)', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'caveman')
    const ui = await band($)
    await f.clock.advance((1440 + 125) * 60_000)
    expect(await shows(ui)).toBe('caveman (1d02h05m) Off')
    await ui.unmount()
  })
})

describe('a resumed conversation', () => {
  test('comes back as it was left: the mode, and how long it has run', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    // Claude Code closed; later the same conversation (same id) is resumed.
    await f.clock.advance(26 * 60 * 60_000)
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toBe('ultracave (1d02h00m) Off')
    await ui.unmount()
  })

  test('another conversation starts fresh, with the question', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'ultracave')
    f.sessionId = 's2'
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })

  test('drawn with nothing loaded (a new conversation after /clear), it loads and asks', async ($, on) => {
    const f = engine(on)
    // No session.start: Claude Code 2.1.301 sends none after /clear.
    const ui = await band($)
    await f.clock.settle()
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })
})

describe('/pulse-caveman', () => {
  test('answers the status; takes only mode names', async ($, on) => {
    const f = engine(on)
    await $.session.start(START)
    expect((await typeCommand($, 'pulse-caveman')).text).toBe('caveman off')
    expect((await typeCommand($, 'pulse-caveman', 'full')).text).toBe('Unknown mode "full". Use caveman, ultracave, off.')
    expect((await typeCommand($, 'pulse-caveman', 'megacave')).text).toMatch(/^megacave is not installed\. Get it: https:/)
    expect(f.ran).toEqual([])
    await typeCommand($, 'pulse-caveman', 'ultracave')
    expect((await typeCommand($, 'pulse-caveman')).text).toBe('ultracave (0m)')
  })
})

describe('an outdated or missing caveman', () => {
  test('a caveman before 4: one row to update it, with Skip; nothing is followed', async ($, on) => {
    const f = engine(on, { skills: ['caveman'], isOutdated: true })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^caveman skill is outdated · update it: https:\/\/github\.com\/.*#getting-the-caveman-skills ?Skip$/)
    await typeCommand($, 'caveman', 'ultra')
    expect(await shows(ui)).toMatch(/^caveman skill is outdated/)
    expect((await typeCommand($, 'pulse-caveman', 'caveman')).text).toMatch(/^Your caveman skill is older than caveman 4\./)
    // Only what the person typed ran; pulse-caveman ran nothing itself.
    expect(f.ran).toEqual(['caveman ultra'])
    await ui.unmount()
  })

  test('an old-looking description beside ultracave is still caveman 4: ultracave only exists since 4', async ($, on) => {
    engine(on, { skills: ['caveman', 'ultracave'], isOutdated: true })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^Start this session in caveman\?/)
    await ui.unmount()
  })

  test('none installed: one row to get them, with Skip', async ($, on) => {
    engine(on, { skills: [] })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^caveman skill not installed · get it: https:.* ?Skip$/)
    await ui.unmount()
  })

  test('Skip hides it, and it stays hidden next session', async ($, on) => {
    engine(on, { skills: ['caveman'], isOutdated: true })
    await $.session.start(START)
    const ui = await band($)
    await ui.press({ key: 'caveman-skip' })
    expect(await ui.find({ key: 'caveman' })).toBeUndefined()
    await ui.unmount()

    await $.session.start(START)
    const next = await band($)
    expect(await next.find({ key: 'caveman' })).toBeUndefined()
    await next.unmount()
  })

  test('a Skip on another skill state does not hide this one', async ($, on) => {
    engine(on, { skills: [], store: { skipped: 'Ultra-compressed. Supports intensity levels: lite, full (default), ultra.' } })
    await $.session.start(START)
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^caveman skill not installed/)
    await ui.unmount()
  })
})

// Stand-ins for Pulse, by what it publishes.
const pulseDrawsAddons: Plugin = {
  name: 'pulse',
  register: on => {
    on('session.start', async ($, e, next) => {
      const done = await next(e)
      await $.state.set({ plugin: 'pulse', key: 'config' }, {})
      await $.state.set({ plugin: 'pulse', key: 'addons' }, { contract: 1 })
      return done
    })
  },
}
const pulseBarOff: Plugin = {
  name: 'pulse',
  register: on => {
    on('session.start', async ($, e, next) => {
      const done = await next(e)
      await $.state.set({ plugin: 'pulse', key: 'config' }, {})
      await $.state.set({ plugin: 'pulse', key: 'addons' }, null)
      return done
    })
  },
}
const pulseOld: Plugin = {
  name: 'pulse',
  register: on => {
    on('session.start', async ($, e, next) => {
      const done = await next(e)
      await $.state.set({ plugin: 'pulse', key: 'config' }, {})
      return done
    })
  },
}

describe('with Pulse', () => {
  test('Pulse 0.3.0+ with its bar on draws caveman: no rows of its own', { plugins: [pulseDrawsAddons] }, async ($, on) => {
    engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'not-now')
    const ui = await band($)
    expect(await ui.find({ key: 'caveman' })).toBeUndefined()
    await ui.unmount()
  })

  test('Pulse 0.3.0+ with its bar off: caveman draws its own rows, no hint', { plugins: [pulseBarOff] }, async ($, on) => {
    engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'not-now')
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^caveman off/)
    expect(await shows(ui)).not.toMatch(/update Pulse/)
    await ui.unmount()
  })

  test('no Pulse: Pulse’s line above its rows', async ($, on) => {
    engine(on)
    await $.session.start(START)
    const ui = await band($)
    expect(await ui.find({ text: /^─{10,}$/ })).toBeDefined()
    await ui.unmount()
  })

  test('an older Pulse draws the line itself: none from caveman', { plugins: [pulseOld] }, async ($, on) => {
    engine(on)
    await $.session.start(START)
    const ui = await band($)
    expect(await ui.find({ text: /^─{10,}$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('an older Pulse: its own rows, with a hint to update Pulse', { plugins: [pulseOld] }, async ($, on) => {
    engine(on)
    await $.session.start(START)
    await typeCommand($, 'pulse-caveman', 'not-now')
    const ui = await band($)
    expect(await shows(ui)).toMatch(/^caveman off.* · update Pulse to show this in its bar$/)
    await ui.unmount()
  })
})
