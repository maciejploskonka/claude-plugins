import type { AddonButton, AddonPart, Caveman, Mode, PulseAddon, Skill } from '../types'

// The Pulse family's grey, as Pulse draws its labels.
export const GREY = 'inactive'

// The caveman family (caveman 4), each mode a skill of its own: the voice,
// grammar stripped, classical Chinese.
export const MODES: readonly Mode[] = ['caveman', 'ultracave', 'megacave']

export const README_LINK = 'https://github.com/maciejploskonka/claude-plugins/tree/main/plugins/pulse-caveman#getting-the-caveman-skills'

export const OFF: Caveman = { mode: null, since: null, isFading: false, wordy: 0, isAsked: false, isHidden: false, isOpen: false }

const two = (n: number) => String(n).padStart(2, '0')

// The time of day caveman was turned on, as the clock on the wall reads it.
export const clockTime = (ms: number) => {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

// How long it has run: 35m, 3h02m, 2d03h02m.
export const duration = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d${two(hours)}h${two(mins)}m`
  if (hours > 0) return `${hours}h${two(mins)}m`
  return `${mins}m`
}

// caveman's `defaultMode`, as its config file or variable names it: a mode
// (starts active), or `manual` / `off` (starts inactive); null when unset.
export const defaultModeOf = (text: string): Mode | 'manual' | 'off' | null => {
  const raw = (/"defaultMode"\s*:\s*"([^"]*)"/.exec(text)?.[1] ?? text).trim().toLowerCase()
  if (raw === 'manual' || raw === 'off') return raw
  return MODES.find(m => m === raw) ?? null
}

// The mode a command loads: `/caveman` (or a plugin's `caveman:caveman`),
// `/ultracave`, `/megacave`; null for any other command.
export const modeOfCommand = (name: string): Mode | null => {
  const bare = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name
  return MODES.find(m => m === bare) ?? null
}

// What `/caveman <args>` turns on: the voice, or the sibling its alias names
// (`ultra`, `wenyan`, as caveman 4 spells them); null for `status`, which
// changes nothing.
export const modeOfCavemanArgs = (args: string): Mode | null => {
  const word = args.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (word === 'status') return null
  if (word === 'ultra') return 'ultracave'
  if (word === 'wenyan') return 'megacave'
  return 'caveman'
}

// A caveman from before 4 says it has levels; caveman 4 has modes instead.
export const isOutdated = (description: string) => /intensity levels|\blite\b/i.test(description)

// "stop caveman" or "normal mode" in the person's own message turns it off,
// as the skills themselves read them.
export const isStop = (text: string) => /\b(stop caveman|normal mode)\b/i.test(text)

const dim = (text: string): AddonPart => ({ color: GREY, text, dim: true })
const cmd = (args: string) => `/pulse-caveman ${args}`
const skip: AddonButton = { key: 'skip', label: 'Skip', command: cmd('skip') }
const hide: AddonButton = { key: 'hide', label: 'hide', command: cmd('hide') }
const modes: AddonButton = { key: 'modes', label: 'modes', command: cmd('modes') }
const off: AddonButton = { key: 'off', label: 'Off', command: cmd('off') }
// In the opened off row: folds it back to [ modes ], without hiding it.
const fold: AddonButton = { key: 'off', label: 'off', command: cmd('off') }

// What pulse-caveman shows, as the Pulse add-on contract spells it: the same
// value Pulse draws inside its bar and pulse-caveman draws on its own. Its
// buttons come last, so an `[ Off ]` ends the bar's first row.
export const addonOf = (c: Caveman, skill: Skill | null, isSkipped: boolean, now: number): PulseAddon | null => {
  if (skill === null || (skill.status !== 'ready' && isSkipped)) return null
  const base = { contract: 1 as const, label: 'caveman' }
  if (skill.status !== 'ready') {
    const what = skill.status === 'outdated' ? 'caveman skill is outdated · update it: ' : 'caveman skill not installed · get it: '
    return { ...base, stat: null, short: null, buttons: [], buttonsAt: null, prompt: { parts: [dim(what), dim(README_LINK)], buttons: [skip] } }
  }
  const installed = MODES.filter(m => skill.commands[m] !== undefined)
  const modeButtons = installed.map((m): AddonButton => ({ key: m, label: m, command: cmd(m) }))
  if (c.mode === null && !c.isAsked) {
    return {
      ...base,
      stat: null,
      short: null,
      buttons: [],
      buttonsAt: null,
      prompt: {
        parts: [{ color: 'claude', text: 'Start this session in caveman?' }],
        buttons: [...modeButtons, { key: 'not-now', label: 'Not now', command: cmd('not-now') }],
      },
    }
  }
  if (c.mode === null) {
    // Off: one quiet [ modes ]; opened, the modes, [ off ] to fold it back,
    // and [ hide ], which takes the whole piece away.
    if (c.isHidden) return null
    const stat = [dim('caveman off')]
    const buttons = c.isOpen ? [...modeButtons, fold, hide] : [modes]
    return { ...base, stat, short: null, buttons, buttonsAt: stat.length, prompt: null }
  }
  // Active: the mode and how long it runs, `ultracave (35m)`; already short,
  // so no short form. Off comes last.
  const ran = c.since === null ? '' : duration(now - c.since)
  const stat: AddonPart[] = [{ color: 'text', text: c.mode }, dim(ran === '' ? ' active' : ` (${ran})`)]
  if (!c.isFading) return { ...base, stat, short: null, buttons: [off], buttonsAt: stat.length, prompt: null }
  const fading: AddonPart[] = [dim(' · '), { color: 'warning', text: 'fading' }]
  return {
    ...base,
    stat: [...stat, ...fading],
    short: null,
    buttons: [{ key: 'reload', label: 'Reload', command: cmd('reload'), primary: true }, off],
    buttonsAt: stat.length + fading.length,
    prompt: null,
  }
}
