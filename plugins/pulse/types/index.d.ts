export type Alarm = 50 | 60 | 75 | 90

export type Config = {
  version: 1
  setupDone: boolean
  features: { bar: boolean; handoff: boolean }
  bar: {
    meter: 'bar' | 'number'
    tokens: boolean
    cache: boolean
    limits: boolean
    resets: boolean
    cost: boolean
    buttons: { summarize: boolean; handoff: boolean }
  }
  alarm: Alarm
  handoffDir: 'home' | 'project'
}

/** Prompt cache tokens of one main-loop request. */
export type CacheTotals = { read: number; written: number; uncached: number }

/** What $.session.usage() said last, trimmed to what the bar draws. */
export type UsageSnapshot = {
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  usd: number | null
}

export type HandoffPhase = 'idle' | 'writing' | 'saved' | 'resuming'

/** How Finish went: saved, or why not. */
export type SetupResult = { ok: true } | { ok: false; error: string }

/** The wizard's unsaved answers, the step on screen, and Finish's result once pressed. */
export type Draft = { config: Config; step: number; result?: SetupResult }

declare module 'claude-code' {
  interface PluginState {
    pulse: {
      /** The saved config, mirrored from $.store at session start and on save. */
      config: Config
      /** The newest main-loop request's cache tokens, null before the first. */
      last: CacheTotals | null
      usage: UsageSnapshot | null
      /** True while a Summarize press is compacting. */
      isCompacting: boolean
      handoffPhase: HandoffPhase
      /** The note's absolute path, set once one is asked for. */
      handoffPath: string | null
      /** The alarm toast was shown in this conversation. */
      handoffReminded: boolean
      /** Null when the wizard is not being edited. */
      draft: Draft | null
    }
  }
}
