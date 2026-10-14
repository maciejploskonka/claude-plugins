import type { CacheTotals, UsageSnapshot } from '../types'

// Pure text helpers for what Pulse draws.

const METER_CELLS = 10

export const LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

// Share of one request's input tokens the prompt cache served.
export const hitRate = (t: CacheTotals | null) => {
  if (!t) return null
  const all = t.read + t.written + t.uncached
  return all === 0 ? null : Math.round((t.read / all) * 100)
}

export const pct = (n: number | null) => (n === null ? '–' : `${n}%`)

// 143000 → "143k", 1000000 → "1M".
export const size = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const cells = (p: number | null) => {
  const full = Math.max(0, Math.min(METER_CELLS, Math.round(((p ?? 0) / 100) * METER_CELLS)))
  return { full: '█'.repeat(full), empty: '░'.repeat(METER_CELLS - full) }
}

export const two = (n: number) => String(n).padStart(2, '0')

// "resets 2h05m" until the window resets, '' when unknown or past.
// Drawn before a limit's reset time: a word reads clearer than a glyph.
export const RESET_ICON = 'resets '

// `7m`, `2h05m`, `4d03h12m`: always down to the minute.
export const resetsIn = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const minutes = Math.round((Date.parse(iso) - now) / 60_000)
  if (!(minutes > 0)) return ''
  if (minutes < 60) return `${RESET_ICON}${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${RESET_ICON}${hours}h${two(minutes % 60)}m`
  return `${RESET_ICON}${Math.floor(hours / 24)}d${two(hours % 24)}h${two(minutes % 60)}m`
}

// The wizard's preview shows every ticked item, also in a fresh session with
// no numbers yet: real values win, missing ones take a sample.
const SAMPLE_LIMITS = [
  { kind: 'five_hour', percentUsed: 12, inMinutes: 125 },
  { kind: 'seven_day', percentUsed: 16, inMinutes: 4 * 1440 + 3 * 60 + 12 },
]
export const SAMPLE_CACHE = 98

export const withSamples = (u: UsageSnapshot | null, now: number): UsageSnapshot => {
  const window = u?.contextWindow ?? 1_000_000
  const percent = u?.contextPercent ?? 21
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString()
  return {
    contextPercent: percent,
    contextTokens: u?.contextTokens ?? Math.round((window * percent) / 100),
    contextWindow: window,
    limits: [
      ...SAMPLE_LIMITS.map(sample => {
        const real = u?.limits.find(l => l.kind === sample.kind)
        return {
          kind: sample.kind,
          percentUsed: real?.percentUsed ?? sample.percentUsed,
          resetsAt: real?.resetsAt ?? at(sample.inMinutes),
        }
      }),
      // Other real limits (a spend limit) as they are.
      ...(u?.limits ?? []).filter(l => !SAMPLE_LIMITS.some(sample => sample.kind === l.kind)),
    ],
    usd: u?.usd ?? 1.23,
  }
}

// ── Handoff ─────────────────────────────────────────────────────────────

export const WRITE_PROMPT = (file: string) =>
  [
    `Write a handoff note to \`${file}\` so a fresh session can pick up this work without this conversation.`,
    'Include: the goal, what is done, the current state (files touched, branches, commands that matter),',
    'open problems, the exact next steps, and anything learned the hard way.',
    'Short and concrete. Only write the file; do not continue the work.',
  ].join(' ')

export const RESUME_PROMPT = (file: string) =>
  `Read \`${file}\`, the handoff note from my previous session, and continue from it. Start by saying in two lines where we are.`

// <base>/.claude/handoffs/<project>-<yyyy-mm-dd-hhmm>.md, the project being
// the last part of `root`.
export const notePathFor = (base: string, root: string, nowMs: number) => {
  const project = root.split('/').filter(Boolean).at(-1) ?? 'session'
  const d = new Date(nowMs)
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`
  return `${base.replace(/\/+$/, '')}/.claude/handoffs/${project}-${stamp}.md`
}
