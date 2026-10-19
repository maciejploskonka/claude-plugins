import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

export const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

export const START = { cwd: '/repo/acme', surface: 'terminal', isInteractive: true } as const
export const SURFACES = ['terminal', 'desktop'] as const

// The engine beneath the plugin: answers what pulse-caveman calls and records it.
export const engine = (
  on: On,
  opts: {
    skills?: string[]
    isOutdated?: boolean
    store?: Record<string, unknown>
    /** Environment variables beside HOME. */
    env?: Record<string, string>
    /** Files on disk, by absolute path. */
    files?: Record<string, string>
  } = {},
) => {
  const f = {
    /** The caveman skills' commands as listed; none when not installed. */
    skills: opts.skills ?? ['caveman', 'ultracave'],
    /** What reached the model beside each message, by message. */
    contexts: [] as (readonly string[])[],
    /** The conversation's id, as a resume names it. */
    sessionId: 's1',
    /** Commands run by a plugin, with arguments: `ultracave`. */
    ran: [] as string[],
    submitted: [] as string[],
    toasts: [] as string[],
    /** How many of a plugin's next commands or prompts the host refuses, as
     * it does while a typed command's own hook still holds the turn. */
    refusals: 0,
    clock: mock.clock(on),
  }
  mock.store(on, opts.store ?? {})
  mock.env(on, { HOME: '/home/me', ...opts.env })
  on('ui.render', (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
  on('ui.toast', (_$, e) => {
    f.toasts.push(e.text)
    return { value: undefined }
  })
  const files = opts.files ?? {}
  on('fs.exists', (_$, e) => ({ value: e.path in files }))
  on('fs.read', (_$, e) => {
    if (!(e.path in files)) throw new Error(`no such file: ${e.path}`)
    return { value: files[e.path] } as never
  })
  on('session.root', () => ({ value: '/repo/acme' }))
  on('session.id', () => ({ value: f.sessionId }))
  on('command.list', () => ({
    value: [
      { name: 'compact', description: 'Compact', source: 'builtin' as const },
      ...f.skills.map(name => ({
        name,
        // A caveman before 4 lists its levels.
        description: opts.isOutdated ? 'Ultra-compressed. Supports intensity levels: lite, full (default), ultra.' : 'Terse caveman voice.',
        source: 'user' as const,
      })),
    ],
  }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  const refused = (e: { origin?: { kind: string } }) => {
    if (e.origin?.kind !== 'plugin' || f.refusals === 0) return false
    f.refusals -= 1
    return true
  }
  on('command.run', (_$, e) => {
    if (e.command !== 'clear' && refused(e)) throw new Error('command.run: called from a command.run hook (host check)')
    // /clear starts a new conversation, with an id of its own.
    if (e.command === 'clear') f.sessionId = `${f.sessionId}+clear`
    f.ran.push(`${e.command} ${e.args}`.trim())
    return { text: '' }
  })
  on('prompt.submit', (_$, e) => {
    if (refused(e)) throw new Error('prompt.submit: called from a command.run hook (host check)')
    f.submitted.push(e.text)
    f.contexts.push(e.context ?? [])
    return { text: e.text }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.compact', () => ({ messages: [{ role: 'user', text: 'summary', toolUses: [] }] }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('classic.SessionStart', () => ({}))
  return f
}

// The person typing a slash command, or a message.
export const typeCommand = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' } } as never)
export const typeMessage = ($: Engine, text: string) =>
  $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
// A slash command's line as it is submitted: `/caveman status`.
export const typeCommandLine = ($: Engine, name: string, args: string) =>
  $.prompt.submit({ text: `/${name} ${args}`.trim(), command: { name, args }, wait: false, origin: { kind: 'composer' } } as never)
export const answer = ($: Engine, text: string) =>
  $.turn.complete({ turnId: 't', answer: text, reason: 'answer' } as never)
export const compact = ($: Engine, trigger = 'auto') =>
  $.session.compact({ trigger, messages: [{ role: 'user', text: 'hello', toolUses: [] }] } as never)
