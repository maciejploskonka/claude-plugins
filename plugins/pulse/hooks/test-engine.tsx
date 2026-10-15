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

export const PANE_PROPS = {
  title: 'Pulse',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

export const START = { cwd: '/repo/acme', surface: 'terminal', isInteractive: true } as const
export const SURFACES = ['terminal', 'desktop'] as const

export type Fake = ReturnType<typeof engine>

// The engine beneath the plugin: answers what Pulse calls and records it.
export const engine = (on: On, store: Record<string, unknown> = {}) => {
  const f = {
    ctx: { percent: 42 as number | undefined, tokens: 84_000 as number | undefined },
    step: { read: 900, written: 0, uncached: 100 },
    limits: [
      { kind: 'five_hour', percentUsed: 23 },
      { kind: 'seven_day', percentUsed: 10 },
    ] as { kind: string; percentUsed: number; resetsAt?: string }[],
    files: new Set<string>(),
    submitted: [] as string[],
    commands: [] as string[],
    /** Slash commands Pulse registered, in order. */
    registered: [] as string[],
    toasts: [] as string[],
    opened: [] as string[],
    openArgs: [] as { id: string; closeOnEscape?: true; focus?: true }[],
    closed: [] as string[],
    compacts: 0,
    /** Set, saving the config fails with this message. */
    storeError: null as string | null,
    focusMoves: [] as (string | null)[],
    /** Rows each scroll that reached the engine moved by. */
    scrolls: [] as number[],
    panes: [] as { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }[],
    clock: mock.clock(on),
  }
  on('store.set', { key: 'config' }, (_$, e, next) => {
    if (f.storeError) return { deny: f.storeError } as never
    return next(e)
  })
  mock.store(on, store)
  mock.env(on, { HOME: '/home/me' })
  // What the engine draws when Pulse has nothing to show.
  on('ui.render', (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
  on('ui.toast', (_$, e) => {
    f.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    f.opened.push(e.id)
    f.openArgs.push({ id: e.id, closeOnEscape: e.closeOnEscape, focus: e.focus })
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    f.closed.push(e.id)
    return { value: undefined }
  })
  on('ui.focus', (_$, e) => {
    f.focusMoves.push(e.element ?? null)
    return {}
  })
  on('ui.scroll', (_$, e) => {
    f.scrolls.push(e.by)
    return {}
  })
  on('ui.panes', () => ({ value: f.panes }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/repo/acme' }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000, tokens: f.ctx.tokens, percent: f.ctx.percent },
      rateLimits: f.limits,
      cost: { usd: 1.234 },
    },
  }))
  on('session.compact', () => {
    f.compacts += 1
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never
  })
  on('fs.exists', (_$, e) => ({ value: f.files.has(e.path) }))
  on('command.register', (_$, e) => {
    f.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('command.run', (_$, e) => {
    f.commands.push(e.command)
    return { text: '' }
  })
  on('prompt.submit', (_$, e) => {
    f.submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', () => ({ text: '' }))
  on('classic.SessionStart', () => ({}))
  on('turn.step', async function* () {
    return {
      turnId: 't',
      index: 0,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: 'claude-opus-5-5',
        input_tokens: f.step.uncached,
        output_tokens: 50,
        cache_read_input_tokens: f.step.read,
        cache_creation_input_tokens: f.step.written,
      },
    } as never
  })
  return f
}

export const turnEnds = ($: Engine) =>
  $.turn.complete({ turnId: 't', answer: 'ok', reason: 'answer' } as never)

export const runCommand = ($: Engine, command: string) =>
  $.command.run({ command, args: '', origin: { kind: 'composer' } } as never)

// One main-loop model request, drained.
export const mainStep = async ($: Engine) => {
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })) {
    // drain
  }
}
