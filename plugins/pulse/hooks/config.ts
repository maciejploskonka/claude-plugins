import type { Alarm, Config } from '../types'

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
