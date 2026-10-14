import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { defaults } from './config'
import { BAND, START, SURFACES, engine, mainStep } from './test-engine'

const READY = { config: { ...defaults(), setupDone: true } }

describe('usage bar', () => {
  for (const surface of SURFACES) {
    test(`shows context, cache, limits, cost and buttons (${surface})`, async ($, on) => {
      const f = engine(on, READY)
      await $.session.start(START)
      await mainStep($)
      await f.clock.settle()

      const ui = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })
      expect(await ui.find({ text: /ctx ████░░░░░░ 42% 84k\/200k · cache 90% · 5h 23% · 7d 10% · \$1\.23/ })).toBeDefined()
      expect(await ui.find({ text: /^─+$/ })).toBeDefined()
      expect(await ui.find({ text: /^engine$/ })).toBeDefined()
      expect((await ui.find({ text: /^90%$/ }))?.props?.color).toBe('success')
      expect((await ui.find({ text: /^42%$/ }))?.props?.color).toBe('success')

      // Labels, separators and cost in the brighter grey; the meter's track dimmer.
      for (const text of [/^ctx $/, /^ · $/, /^cache $/, /^\$1\.23$/]) {
        expect((await ui.find({ text }))?.props?.color).toBe('inactive')
        expect((await ui.find({ text }))?.props?.dimColor).toBe(true)
      }
      expect((await ui.find({ text: /^░+ $/ }))?.props?.color).toBe('subtle')

      await ui.press({ key: 'summarize' })
      await f.clock.settle()
      expect(f.compacts).toBe(1)
      // What Handoff does is tested in handoff.test.tsx (Task 3).
      expect(await ui.find({ key: 'handoff' })).toBeDefined()
      await ui.unmount()
    })

    test(`turns yellow at the alarm and lights Handoff (${surface})`, async ($, on) => {
      const f = engine(on, READY)
      f.ctx.percent = 80
      await $.session.start(START)

      const ui = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })
      expect((await ui.find({ text: /^80%$/ }))?.props?.color).toBe('warning')
      expect((await ui.find({ key: 'handoff' }))?.props?.variant).toBe('primary')
      await ui.unmount()
    })

    test(`fresh session: no numbers yet, no crash (${surface})`, async ($, on) => {
      const f = engine(on, READY)
      f.ctx.percent = undefined
      f.ctx.tokens = undefined
      f.limits = []
      await $.session.start(START)

      const ui = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })
      // Limits arrive with the first request; until then, placeholders.
      expect(await ui.find({ text: /ctx ░░░░░░░░░░ – · cache – · 5h – · 7d – · \$1\.23/ })).toBeDefined()
      expect((await ui.find({ text: /^–$/ }))?.props?.color).toBe('inactive')
      await ui.unmount()
    })

    test(`number-only meter, no cost, no buttons (${surface})`, async ($, on) => {
      const c = defaults()
      const f = engine(on, {
        config: { ...c, setupDone: true, bar: { ...c.bar, meter: 'number', cost: false, buttons: { summarize: false, handoff: false } } },
      })
      await $.session.start(START)

      const ui = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })
      expect(await ui.find({ text: /ctx 42% 84k\/200k · cache/ })).toBeDefined()
      expect(await ui.find({ text: /█/ })).toBeUndefined()
      expect(await ui.find({ text: /\$1\.23/ })).toBeUndefined()
      expect(await ui.find({ key: 'summarize' })).toBeUndefined()
      expect(f.compacts).toBe(0)
      await ui.unmount()
    })

    test(`narrow terminal still draws (${surface})`, async ($, on) => {
      engine(on, READY)
      await $.session.start(START)
      const ui = await $.ui.mount({ plugin: 'pulse', surface, ...BAND, props: { ...BAND.props, bodyColumns: 4 } })
      expect(await ui.find({ text: /^─{10}$/ })).toBeDefined()
      await ui.unmount()
    })

    test(`bar turned off: nothing of Pulse in the band (${surface})`, async ($, on) => {
      const c = defaults()
      engine(on, { config: { ...c, setupDone: true, features: { ...c.features, bar: false } } })
      await $.session.start(START)
      const ui = await $.ui.mount({ plugin: 'pulse', surface, ...BAND })
      expect(await ui.find({ text: /ctx/ })).toBeUndefined()
      expect(await ui.find({ text: /^engine$/ })).toBeDefined()
      await ui.unmount()
    })
  }

  // Pulse lays out the rows itself: the engine's flex wrap left a spare row.
  const rowsAt = async ($: Engine, columns: number) => {
    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: columns } })
    const rows: string[] = []
    for (let n = 0; n < 5; n += 1) {
      const row = await ui.find({ key: `bar-row-${n}` })
      if (row) rows.push(row.text)
    }
    await ui.unmount()
    return rows
  }

  test('pieces never split inside; whole pieces move to the next row', async ($, on) => {
    const f = engine(on, READY)
    await $.session.start(START)
    await mainStep($)
    await f.clock.settle()

    const ui = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'bar' }))?.props?.flexWrap).toBeUndefined()
    // One line of text per piece, colours nested in it, so it cannot break.
    for (const key of ['bar-ctx', 'bar-cache', 'bar-five_hour', 'bar-seven_day', 'bar-cost']) {
      expect((await ui.find({ key }))?.props?.flexShrink).toBe(0)
      expect((await ui.find({ key }))?.children).toHaveLength(1)
    }
    await ui.unmount()

    // Two rows: stats, then the actions side by side in a row of their own.
    const wide = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', ...BAND })
    expect((await wide.find({ key: 'bar' }))?.props?.flexDirection).toBe('column')
    const actions = await wide.find({ key: 'bar-actions' })
    expect(actions?.props?.flexDirection).toBeUndefined()
    expect(actions?.text).toMatch(/Summarize.*Handoff/)
    await wide.unmount()

    // Wide: stats in one row, no button among them.
    const one = await rowsAt($, 120)
    expect(one).toHaveLength(1)
    expect(one[0]).not.toMatch(/Summarize|Handoff/)
    // Narrow: stats wrap over the full width; the actions stay on their own row.
    // A row that starts with a moved piece drops its leading " · ".
    const narrow = await rowsAt($, 40)
    expect(narrow.length).toBeGreaterThan(1)
    expect(narrow.join('\n')).not.toMatch(/Summarize|Handoff/)
    expect(narrow[0]).toMatch(/· cache 90%$/)
    expect(narrow[1]).toMatch(/^5h 23% · 7d 10%/)
  })
})
