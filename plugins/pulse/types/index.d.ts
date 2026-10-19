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

// ── Add-ons ──────────────────────────────────────────────────────────────
// A Pulse-family plugin publishes one `PulseAddon` under its own key `addon`;
// Pulse draws it in the bar. Pulse publishes `pulse.addons` while it does.

/** A run of text an add-on draws: a theme colour key, or Pulse's grey when `dim`. */
export type AddonPart = { color: string; text: string; dim?: true }

/** A button an add-on wants; a press runs `command` (`/name args` or `name args`). */
export type AddonButton = { key: string; label: string; command: string; primary?: true }

export type PulseAddon = {
  contract: 1
  /** The last piece of the stats row; null for none. */
  stat: AddonPart[] | null
  /**
   * A shorter `stat` (`ultracave (35m)`) Pulse draws when the stat does not
   * fit the rest of its row; `buttonsAt` counts in it the same way. Null:
   * the stat moves to the next row whole.
   */
  short: AddonPart[] | null
  /** Shown as `<label>:` before `buttons`, in Pulse's button row. */
  label: string
  buttons: AddonButton[]
  /**
   * Where `buttons` go: inside the stat, after this many of its parts
   * (`caveman ultra [ Off ] · on 3m`), or null for Pulse's button row.
   */
  buttonsAt: number | null
  /** A row of its own above the bar; null for none. */
  prompt: { parts: AddonPart[]; buttons: AddonButton[] } | null
}

/** What Pulse publishes for add-ons: the contract it draws, while it draws them. */
export type PulseAddons = { contract: number }

declare module 'claude-code' {
  interface PluginState {
    // The add-ons Pulse knows. $.state.get takes a plugin name only as a
    // literal, so a new add-on needs a Pulse release that names it.
    'pulse-caveman': { addon: PulseAddon | null }
    pulse: {
      /** Set while Pulse draws add-ons in its bar; null while the bar is off. */
      addons: PulseAddons | null
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
      /** The key of the wizard control holding the focus ring, as last moved. */
      setupFocus: string | null
      /** The first row of the step's middle the setup window shows. */
      setupOffset: number
      /** This conversation's settings are loaded; false in a new one until they are. */
      isLoaded: boolean
    }
  }
}
