import { describe, expect, test } from 'claude-code/testing'

import { isChecked, isWordy } from './drift'
import {
  OFF,
  addonOf,
  clockTime,
  defaultModeOf,
  duration,
  isOutdated,
  isStop,
  modeOfCavemanArgs,
  modeOfCommand,
} from './format'

const READY = { status: 'ready' as const, commands: { caveman: 'caveman', ultracave: 'ultracave' } }

describe('format', () => {
  test('the start time reads as a clock: two digits each', () => {
    const at = new Date(2026, 9, 16, 9, 4).getTime()
    expect(clockTime(at)).toBe('09:04')
  })

  test('how long: 35m, 3h02m, 2d03h02m', () => {
    const m = 60_000
    expect([duration(35 * m), duration(182 * m), duration((2 * 1440 + 182) * m)]).toEqual(['35m', '3h02m', '2d03h02m'])
  })

  test('caveman\'s defaultMode: from a config file or a bare variable', () => {
    expect([
      defaultModeOf('{ "defaultMode": "ultracave" }'),
      defaultModeOf('{\n  // team default\n  "defaultMode": "manual",\n}'),
      defaultModeOf('{ "cli": {} }'),
      defaultModeOf('megacave'),
      defaultModeOf('off'),
      defaultModeOf('full'),
    ]).toEqual(['ultracave', 'manual', null, 'megacave', 'off', null])
  })

  test('a command names its mode, with or without a plugin prefix', () => {
    expect(['caveman', 'ultracave', 'caveman:megacave', 'cavemanx', 'compact'].map(modeOfCommand)).toEqual([
      'caveman',
      'ultracave',
      'megacave',
      null,
      null,
    ])
  })

  test('/caveman arguments: the aliases name the siblings, status is nothing', () => {
    expect(['', 'ultra', 'wenyan', 'status'].map(modeOfCavemanArgs)).toEqual(['caveman', 'ultracave', 'megacave', null])
  })

  test('a caveman that describes levels is from before 4', () => {
    expect([
      isOutdated('Ultra-compressed. Supports intensity levels: lite, full (default), ultra.'),
      isOutdated('Terse caveman voice: answer first, fluff gone.'),
    ]).toEqual([true, false])
  })

  test('"stop caveman" and "normal mode" are stops, anywhere in a message', () => {
    expect([isStop('Stop caveman now'), isStop('back to normal mode'), isStop('caveman stop')]).toEqual([true, true, false])
  })

  test('nothing is shown before the skill check, or once skipped', () => {
    expect([addonOf(OFF, null, false, 0), addonOf(OFF, { status: "missing" }, true, 0)]).toEqual([null, null])
  })

  test('off: one button, modes', () => {
    const a = addonOf({ ...OFF, isAsked: true }, READY, false, 0)
    expect([a?.stat?.map(p => p.text).join(''), a?.buttons.map(b => b.label)]).toEqual(['caveman off', ['modes']])
  })

  test('off, opened: a button per installed mode, then hide, last', () => {
    const a = addonOf({ ...OFF, isAsked: true, isOpen: true }, READY, false, 0)
    expect([a?.stat?.map(p => p.text).join(''), a?.buttons.map(b => b.label), a?.buttonsAt]).toEqual([
      'caveman off',
      ['caveman', 'ultracave', 'off', 'hide'],
      1,
    ])
  })

  test('off and hidden: nothing at all', () => {
    expect(addonOf({ ...OFF, isAsked: true, isHidden: true }, READY, false, 0)).toBeNull()
  })

  test('active: the mode in white, how long in grey, Off last; already short', () => {
    const a = addonOf({ ...OFF, mode: 'ultracave', since: 0, isAsked: true }, READY, false, 35 * 60_000)
    expect(a?.stat).toEqual([
      { color: 'text', text: 'ultracave' },
      { color: 'inactive', text: ' (35m)', dim: true },
    ])
    expect(a?.short).toBeNull()
    expect([a?.buttons.map(b => b.label), a?.buttonsAt]).toEqual([['Off'], 2])
  })

  test('fading: "fading" in yellow, then Reload (primary) and Off, last', () => {
    const a = addonOf({ ...OFF, mode: 'caveman', since: 0, isFading: true, isAsked: true }, READY, false, 0)
    expect(a?.stat?.at(-1)).toEqual({ color: 'warning', text: 'fading' })
    expect(a?.stat?.map(p => p.text).join('')).toBe('caveman (0m) · fading')
    expect(a?.buttonsAt).toBe(a?.stat?.length)
    expect(a?.buttons.map(b => [b.label, b.primary === true])).toEqual([['Reload', true], ['Off', false]])
  })
})

describe('drift', () => {
  test('megacave is not checked', () => {
    expect((['caveman', 'ultracave', 'megacave'] as const).map(isChecked)).toEqual([true, true, false])
  })

  test('short answers are never wordy', () => {
    expect(isWordy('Sure! The fix is just a small change to the cache.')).toBe(false)
  })

  test('articles alone do not make an answer wordy', () => {
    const plain = 'The fix is in the cache. The key uses the route and the locale. '.repeat(4)
    expect(isWordy(plain)).toBe(false)
  })

  test('ceremony makes a long answer wordy, fillers too', () => {
    const body = 'Cache key fixed. Route and locale hashed. Menu no longer rerenders the page. Tests pass. '.repeat(3)
    expect([isWordy(`Sure! ${body}`), isWordy(`${body} Hope this helps.`), isWordy(`${body} It is really just fine.`)]).toEqual([
      true,
      true,
      true,
    ])
  })

  test('code blocks do not count as prose', () => {
    const code = '```\n' + 'const x = just(really) // sure, let me\n'.repeat(20) + '```'
    expect(isWordy(`Done. ${code}`)).toBe(false)
  })
})
