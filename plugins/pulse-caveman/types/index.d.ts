// ── The Pulse add-on contract (contract 1) ──────────────────────────────
// The same shapes Pulse reads; see plugins/pulse/types/index.d.ts.

export type AddonPart = { color: string; text: string; dim?: true }
export type AddonButton = { key: string; label: string; command: string; primary?: true }
export type PulseAddon = {
  contract: 1
  stat: AddonPart[] | null
  /** A shorter `stat`, drawn where the stat does not fit; null for none. */
  short: AddonPart[] | null
  label: string
  buttons: AddonButton[]
  /** Where `buttons` go: inside the stat after this many parts, or null for the button row. */
  buttonsAt: number | null
  prompt: { parts: AddonPart[]; buttons: AddonButton[] } | null
}

// ── pulse-caveman's own state ────────────────────────────────────────────

/** The caveman family's modes (caveman 4): each a skill of its own. */
export type Mode = 'caveman' | 'ultracave' | 'megacave'

/** Caveman in this conversation, as pulse-caveman last saw it. */
export type Caveman = {
  /** The mode on, null when off. */
  mode: Mode | null
  /** When it was turned on, ms since the epoch; null when off. */
  since: number | null
  /** On, but possibly faded: after a compaction, or answers drifting wordy. */
  isFading: boolean
  /** Wordy answers in a row since the last mode change or Reload. */
  wordy: number
  /** The start question was answered, or shrank at the first message. */
  isAsked: boolean
  /** The off row was hidden with [ hide ]; turning caveman on shows it again. */
  isHidden: boolean
  /** The off row was opened with [ modes ]: a button per mode, then hide. */
  isOpen: boolean
}

/** What is remembered of a conversation, for a resume. */
export type Remembered = Pick<Caveman, 'mode' | 'since' | 'isFading' | 'isHidden'>

/**
 * The caveman skills found at session start. `ready`: caveman 4, each
 * installed mode with the command that loads it (`ultracave`, or
 * `caveman:ultracave` when a plugin brings it). `outdated`: a caveman
 * from before 4 (with levels). `missing`: none.
 */
export type Skill =
  | { status: 'ready'; commands: Partial<Record<Mode, string>> }
  | { status: 'outdated'; fingerprint: string }
  | { status: 'missing' }

declare module 'claude-code' {
  interface PluginState {
    'pulse-caveman': {
      caveman: Caveman
      /** Null until session start has looked. */
      skill: Skill | null
      /** The person pressed Skip on the update or install row (kept in $.store). */
      isSkipped: boolean
      /** This conversation is loaded; false in a new one until it is. */
      isLoaded: boolean
      /** The mode caveman's plugin starts each conversation in; null when it starts none. */
      startMode: Mode | null
      /** What Pulse 0.3.0+ draws for pulse-caveman, recomputed on every change and each minute. */
      addon: PulseAddon | null
    }
    // Read only, to know whether Pulse draws pulse-caveman: `addons` is
    // written by Pulse 0.3.0 and later, `config` by every Pulse.
    pulse: {
      addons: { contract: number } | null
      config: unknown
    }
  }
}
