import type { Alarm, Config, Draft } from '../types'

export const STORE_KEY = 'config'
export const ALARMS: readonly Alarm[] = [50, 60, 75, 90]

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

// Builds a full config from whatever was stored: each missing or mistyped
// field takes its default, so an older or hand-edited config still loads.
export const fromRaw = (raw: Record<string, unknown>): Config => {
  const f = isObj(raw.features) ? raw.features : {}
  const b = isObj(raw.bar) ? raw.bar : {}
  const btn = isObj(b.buttons) ? b.buttons : {}
  const alarm = ALARMS.find(a => a === raw.alarm) ?? 75
  return {
    version: 1,
    setupDone: bool(raw.setupDone, false),
    features: { bar: bool(f.bar, true), handoff: bool(f.handoff, true) },
    bar: {
      meter: b.meter === 'number' ? 'number' : 'bar',
      tokens: bool(b.tokens, true),
      cache: bool(b.cache, true),
      limits: bool(b.limits, true),
      resets: bool(b.resets, true),
      cost: bool(b.cost, true),
      buttons: { summarize: bool(btn.summarize, true), handoff: bool(btn.handoff, true) },
    },
    alarm,
    handoffDir: raw.handoffDir === 'project' ? 'project' : 'home',
  }
}

export const defaults = (): Config => fromRaw({})

// What a command answers when its feature is turned off.
export const HINT = (feature: string) => `${feature} is turned off. Turn it on in /pulse-setup.`

export type Step = 'features' | 'bar' | 'alarm' | 'details'

// The wizard's screens. Steps for features turned off in step 1 drop out.
export const steps = (c: Config): Step[] => {
  const list: Step[] = ['features']
  if (c.features.bar) list.push('bar')
  if (c.features.bar || c.features.handoff) list.push('alarm')
  if (c.features.handoff) list.push('details')
  return list
}

// Whether a handoff needs its slash command: handoff is on, but the bar
// shows no Handoff button to press (the bar is off, or the button is).
export const needsHandoffCommand = (c: Config) => c.features.handoff && !(c.features.bar && c.bar.buttons.handoff)

// Next's key names its step (Finish on the last), so a focus move waits for
// the new step's button rather than landing on the old one before the redraw.
export const nextKeyOf = (list: Step[], n: number) => (n >= list.length - 1 ? 'finish' : `next-${list[n]}`)

// The wizard's controls by key, top to bottom: the order Up and Down walk.
export const focusOrder = (d: Draft): string[] => {
  if (d.result) return d.result.ok ? ['done-close'] : ['done-close', 'done-retry']
  const c = d.config
  const list = steps(c)
  const i = Math.min(d.step, list.length - 1)
  const step = list[i] ?? 'features'
  const body =
    step === 'features'
      ? ['f-bar', 'f-handoff']
      : step === 'bar'
        ? [
            'meter-bar',
            'meter-number',
            ...['tokens', 'cache', 'limits', 'resets', 'cost', 'summarize'].map(k => `b-${k}`),
            ...(c.features.handoff ? ['b-handoff'] : []),
          ]
        : step === 'alarm'
          ? ALARMS.map(a => `alarm-${a}`)
          : c.features.handoff
            ? ['handoff-dir-home', 'handoff-dir-project']
            : []
  return [...body, ...(i > 0 ? ['back'] : []), nextKeyOf(list, i)]
}

// Where a screen starts the focus: its top control, so the step number above
// it shows. Never Back (Enter would undo the step), so Next on a bare step.
export const startKey = (d: Draft) => focusOrder(d).find(k => k !== 'back') ?? 'finish'
