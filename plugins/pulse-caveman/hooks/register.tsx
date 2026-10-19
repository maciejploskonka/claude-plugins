import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AddonButton, AddonPart, Caveman, Mode, PulseAddon, Remembered, Skill } from '../types'
import { WORDY_IN_A_ROW, isChecked, isWordy } from './drift'
import {
  GREY,
  MODES,
  OFF,
  README_LINK,
  addonOf,
  defaultModeOf,
  isOutdated,
  isStop,
  modeOfCavemanArgs,
  modeOfCommand,
  duration,
} from './format'

// Every function that takes `$` lives in this file: the engine follows `$`
// only within one file. Pure helpers live beside it.

type RenderIn = Parameters<EngineInterface['ui']['resolve']>[0]

const caveman = atom({ plugin: 'pulse-caveman', key: 'caveman' } as const, OFF)
const skill = atom({ plugin: 'pulse-caveman', key: 'skill' } as const, null)
const isSkipped = atom({ plugin: 'pulse-caveman', key: 'isSkipped' } as const, false)
const addon = atom({ plugin: 'pulse-caveman', key: 'addon' } as const, null)
const startMode = atom({ plugin: 'pulse-caveman', key: 'startMode' } as const, null)

// `(2d03h02m)` counts in minutes.
const MINUTE_MS = 60_000

// What Skip was pressed on, kept across sessions: the outdated skill's
// description, or `missing`. Another skill state shows the row again.
const SKIPPED_KEY = 'skipped'

// Each conversation's caveman, by its session id, so a resume picks it up
// again: the skill's instructions are still in a resumed conversation.
// The newest are kept.
const CONVERSATIONS_KEY = 'conversations'
const CONVERSATIONS_KEPT = 50
// The mode Pulse's Clear & continue carries into the next conversation.
const CARRY_KEY = 'carry'
const CARRY_MS = 30_000

// ── State ───────────────────────────────────────────────────────────────

// Recomputes what is shown. Pulse and this plugin's own rows both draw
// this one value.
const publish = async ($: EngineInterface) => {
  const c = await read($, caveman)
  const now = await $.clock.now()
  const shown = addonOf(c, await read($, skill), await read($, isSkipped), now)
  // Unchanged: no write, so Pulse does not redraw for nothing.
  if (JSON.stringify(shown) !== JSON.stringify(await read($, addon))) await update($, addon, () => shown)
  nextMinute($, c, now)
}

// One timer, only while caveman is on: it fires when the shown minute turns
// over, counted from when caveman turned on, so the time is never late.
let tick: { cancel: () => void } | null = null
const nextMinute = ($: EngineInterface, c: Caveman, now: number) => {
  tick?.cancel()
  tick = null
  if (c.mode === null || c.since === null) return
  tick = $.clock.after(MINUTE_MS - ((now - c.since) % MINUTE_MS), () => void publish($))
}

const remembered = async ($: EngineInterface): Promise<Record<string, Remembered>> => {
  const raw = await $.store.get(CONVERSATIONS_KEY).catch(() => undefined)
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, Remembered>) : {}
}

const remember = async ($: EngineInterface, c: Caveman) => {
  const id = await $.session.id()
  const { [id]: _old, ...rest } = await remembered($)
  const kept = Object.entries(rest).slice(-(CONVERSATIONS_KEPT - 1))
  const mine: Remembered = { mode: c.mode, since: c.since, isFading: c.isFading, isHidden: c.isHidden }
  await $.store.set(CONVERSATIONS_KEY, Object.fromEntries([...kept, [id, mine]]))
}

const change = async ($: EngineInterface, fn: (c: Caveman) => Caveman) => {
  await update($, caveman, fn)
  await publish($)
  // A failed note leaves only a resume without it.
  await remember($, await read($, caveman)).catch(() => {})
}

const turnedOn = async ($: EngineInterface, mode: Mode): Promise<Caveman> => ({
  mode,
  since: await $.clock.now(),
  isFading: false,
  wordy: 0,
  isAsked: true,
  isHidden: false,
  isOpen: false,
})

// Which caveman skills are installed, and are they caveman 4? The commands
// the person can run list them (a plugin's as `<plugin>:ultracave`), with
// each skill's description; a caveman before 4 describes its levels.
const findSkill = async ($: EngineInterface): Promise<Skill> => {
  const commands: Partial<Record<Mode, string>> = {}
  let old = ''
  for (const c of await $.command.list()) {
    const mode = modeOfCommand(c.name)
    if (!mode) continue
    if (mode === 'caveman' && isOutdated(c.description)) old = c.description
    // A skill of the person's own wins over a plugin's of the same mode.
    if (commands[mode] === undefined || c.name === mode) commands[mode] = c.name
  }
  // ultracave and megacave exist only since caveman 4: either one settles it.
  const hasSibling = commands.ultracave !== undefined || commands.megacave !== undefined
  if (old !== '' && !hasSibling) return { status: 'outdated', fingerprint: old }
  return Object.keys(commands).length > 0 ? { status: 'ready', commands } : { status: 'missing' }
}

// The mode caveman's plugin starts a session in, resolved as caveman itself
// does: CAVEMAN_DEFAULT_MODE, then `.caveman/config.json` or `.caveman.json`
// from the project folder up, then the user's caveman config, then
// `caveman`. Only caveman's plugin acts on it (its session-start hooks): for
// skills copied into a skills folder, nothing starts by itself, so null.
const resolveStartMode = async ($: EngineInterface, s: Skill): Promise<Mode | null> => {
  if (s.status !== 'ready' || !Object.values(s.commands).some(c => c?.includes(':'))) return null
  const settle = (found: ReturnType<typeof defaultModeOf>) => (found === 'manual' || found === 'off' ? null : found)
  const fromEnv = defaultModeOf((await $.env.get('CAVEMAN_DEFAULT_MODE')) ?? '')
  if (fromEnv !== null) return settle(fromEnv)
  const readMode = async (path: string) => {
    try {
      return (await $.fs.exists(path)) ? defaultModeOf(await $.fs.read(path)) : null
    } catch {
      return null
    }
  }
  let dir = (await $.session.root()).replace(/\/+$/, '')
  for (let n = 0; n < 64 && dir !== ''; n += 1) {
    for (const file of ['.caveman/config.json', '.caveman.json']) {
      const found = await readMode(`${dir}/${file}`)
      if (found !== null) return settle(found)
    }
    dir = dir.slice(0, dir.lastIndexOf('/'))
  }
  const xdg = await $.env.get('XDG_CONFIG_HOME')
  const home = await $.env.get('HOME')
  const user = xdg ? `${xdg}/caveman/config.json` : home ? `${home}/.config/caveman/config.json` : null
  const found = user === null ? null : await readMode(user)
  return found === null ? 'caveman' : settle(found)
}

// A new conversation: active in the start mode, or off with the question.
const freshConversation = async ($: EngineInterface): Promise<Caveman> => {
  const mode = await read($, startMode)
  return mode === null ? OFF : turnedOn($, mode)
}

const fingerprintOf = (s: Skill) => (s.status === 'outdated' ? s.fingerprint : s.status === 'missing' ? 'missing' : '')

// ── Actions ─────────────────────────────────────────────────────────────

// Starts a command or a prompt on a timer, outside the calling hook. While a
// typed command's own hook still runs (`/pulse-caveman ultracave`), the host
// refuses both, so a refused start is tried again a moment later, for about
// two seconds, before the toast.
const RETRY_MS = 100
const RETRIES = 20
const soon = ($: EngineInterface, start: () => Promise<unknown>, failed: string, left = RETRIES, wait = 0) => {
  $.clock.after(wait, () => {
    void start().catch(() => (left > 0 ? soon($, start, failed, left - 1, RETRY_MS) : $.ui.toast(failed)))
  })
}

// Loads `mode`'s own skill, as `/ultracave` typed by the person.
const loadSkill = async ($: EngineInterface, mode: Mode) => {
  const s = await read($, skill)
  const command = s?.status === 'ready' ? s.commands[mode] : undefined
  if (!command) return
  soon($, () => $.command.run({ command, args: '' }), `Could not run /${command}.`)
}

const statusText = (c: Caveman, now: number) =>
  c.mode === null
    ? 'caveman off'
    : `${c.mode} ${c.since === null ? 'active' : `(${duration(now - c.since)})`}${c.isFading ? ' · fading' : ''}`

// What `/pulse-caveman <arg>` and every button do; the text it answers.
const act = async ($: EngineInterface, arg: string): Promise<string> => {
  const s = await read($, skill)
  const word = arg.trim().toLowerCase()
  if (s === null) return 'Pulse-caveman is still starting.'
  if (s.status !== 'ready') {
    if (word === 'skip') {
      await $.store.set(SKIPPED_KEY, fingerprintOf(s))
      await update($, isSkipped, () => true)
      await publish($)
      return 'Pulse-caveman stays quiet until the caveman skills change. /pulse-caveman shows how to get them.'
    }
    return s.status === 'outdated'
      ? `Your caveman skill is older than caveman 4. Update it: ${README_LINK}`
      : `The caveman skills are not installed. Get them: ${README_LINK}`
  }
  const c = await read($, caveman)
  if (word === '') return statusText(c, await $.clock.now())
  if (word === 'off') {
    if (c.mode === null) {
      // The opened off row's [ off ]: fold it back to [ modes ].
      if (c.isOpen) await change($, old => ({ ...old, isOpen: false }))
      return 'Caveman is already off.'
    }
    soon($, () => $.prompt.submit({ text: 'stop caveman', asUser: true }), 'Could not turn caveman off. Type "stop caveman".')
    await change($, () => ({ ...OFF, isAsked: true }))
    return 'Turning caveman off.'
  }
  if (word === 'reload') {
    if (c.mode === null) return 'Caveman is off: nothing to reload.'
    await loadSkill($, c.mode)
    // The same mode again; it stays active from when it was turned on.
    await change($, old => ({ ...old, isFading: false, wordy: 0 }))
    return `Reloading ${c.mode}.`
  }
  if (word === 'modes') {
    if (c.mode !== null) return statusText(c, await $.clock.now())
    await change($, old => ({ ...old, isAsked: true, isOpen: true }))
    return `Turn caveman on: ${MODES.filter(m => s.commands[m] !== undefined).map(m => `/pulse-caveman ${m}`).join(', ')}.`
  }
  if (word === 'hide') {
    await change($, old => ({ ...old, isHidden: true }))
    return 'Hidden for this conversation. /pulse-caveman <mode> turns caveman on.'
  }
  if (word === 'not-now') {
    await change($, old => ({ ...old, isAsked: true }))
    return 'Caveman stays off. Turn it on any time from the bar or with /pulse-caveman <mode>.'
  }
  const installed = MODES.filter(m => s.commands[m] !== undefined)
  const mode = MODES.find(m => m === word)
  if (!mode) return `Unknown mode "${word}". Use ${[...installed, 'off'].join(', ')}.`
  if (s.commands[mode] === undefined) return `${mode} is not installed. Get it: ${README_LINK}`
  await loadSkill($, mode)
  const active = await turnedOn($, mode)
  await change($, () => active)
  return `Turning ${mode} on.`
}

// ── Drawing on its own ──────────────────────────────────────────────────
// Only while Pulse does not draw pulse-caveman in its bar: no Pulse, Pulse
// with its bar off, or a Pulse older than 0.3.0 (which gets a hint).

const pulseDraws = async ($: EngineInterface) => {
  try {
    const addons = await $.state.get({ plugin: 'pulse', key: 'addons' })
    if ((addons.value?.contract ?? 0) >= 1) return { isDrawn: true, isOld: false }
    // Pulse 0.3.0 and later write `addons`, every Pulse writes `config`.
    const pulseConfig = await $.state.get({ plugin: 'pulse', key: 'config' })
    return { isDrawn: false, isOld: addons.version === 0 && pulseConfig.version > 0 }
  } catch {
    return { isDrawn: false, isOld: false }
  }
}

// The stat, or its short form when the row would not fit the terminal.
const fitting = (shown: PulseAddon, columns: number) => {
  // Each button as drawn: ` [ Off ]`.
  const buttons = shown.buttons.reduce((sum, b) => sum + b.label.length + 5, 0)
  const width = (list: AddonPart[]) => list.map(p => p.text).join('').length + buttons
  const stat = shown.stat ?? []
  return shown.short && width(stat) > columns ? shown.short : stat
}

const ownRows = (
  $: EngineInterface,
  e: RenderIn,
  shown: PulseAddon,
  opts: { isOld: boolean; isWorking: boolean; columns: number },
) => {
  const { Box, Button, Text } = $.ui.resolve(e)
  const parts = (list: AddonPart[]) =>
    list.map((p, n) => (
      <Text key={String(n)} color={p.dim ? GREY : p.color} dimColor={p.dim ? true : undefined}>
        {p.text}
      </Text>
    ))
  // Hidden while Claude is working, as Pulse's are.
  const buttons = (list: AddonButton[]) =>
    opts.isWorking
      ? []
      : list.map(b => (
          <Box key={`${b.key}-slot`}>
            <Text> </Text>
            <Button
              key={`caveman-${b.key}`}
              label={b.label}
              variant={b.primary ? 'primary' : 'secondary'}
              onPress={() => act($, b.command.split(/\s+/)[1] ?? '')}
            />
          </Box>
        ))
  return (
    <Box key="caveman" flexDirection="column">
      {shown.prompt && (
        <Box key="caveman-prompt">
          {parts(shown.prompt.parts)}
          {buttons(shown.prompt.buttons)}
        </Box>
      )}
      {shown.stat && (
        <Box key="caveman-status">
          {parts(fitting(shown, opts.columns))}
          {buttons(shown.buttons)}
          {opts.isOld && (
            <Text color={GREY} dimColor>
              {'  · update Pulse to show this in its bar'}
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}

// ── Hooks ───────────────────────────────────────────────────────────────
// Each hook passes the event on first, then notes what it means. A note
// that fails is dropped: pulse-caveman's bookkeeping never stops the
// person's own command, message, compaction or /clear.

const noting = async (note: () => Promise<unknown>) => {
  try {
    await note()
  } catch {
    // The state stays as it was; the next event corrects it.
  }
}

// What a conversation's pulse-caveman needs: the skills found, Skip, the
// start mode, and caveman in this conversation. A resumed one (its id is
// remembered) comes back as it was left: the skill's instructions are still
// in it. Any other starts fresh: the question, or caveman's start mode.
// A carry is for the conversation the clear started (`to`), and only for a
// moment: a later /clear, or a new window opened meanwhile, starts afresh.
type Carry = { mode: Mode; since: number | null; from: string; at: number; to?: string }
const carryFor = async ($: EngineInterface, id: string): Promise<Carry | null> => {
  const raw = (await $.store.get(CARRY_KEY).catch(() => undefined)) as Carry | null | undefined
  if (!raw || raw.to !== id || (await $.clock.now()) - raw.at > CARRY_MS) return null
  return raw
}

const isLoaded = atom({ plugin: 'pulse-caveman', key: 'isLoaded' } as const, false)

// A session start (a new `claude`, not a /clear) never takes a carry.
const loadConversation = async ($: EngineInterface, opts: { isStart?: boolean } = {}) => {
  let found: Skill = { status: 'missing' }
  try {
    found = await findSkill($)
  } catch {
    // The command list could not be read: as if none were installed.
  }
  const skipped = await $.store.get(SKIPPED_KEY).catch(() => undefined)
  await update($, skill, () => found)
  await update($, isSkipped, () => found.status !== 'ready' && skipped === fingerprintOf(found))
  const start = await resolveStartMode($, found).catch(() => null)
  await update($, startMode, () => start)
  const id = await $.session.id()
  const was = (await remembered($))[id]
  const carried = was || opts.isStart ? null : await carryFor($, id)
  const now: Caveman = was
    ? { ...OFF, ...was, wordy: 0, isAsked: true }
    : carried && found.status === 'ready'
      ? { ...OFF, mode: carried.mode, since: carried.since, isAsked: true }
      : await freshConversation($)
  await update($, caveman, () => now)
  await publish($)
  await update($, isLoaded, () => true)
  if (carried) await remember($, now).catch(() => {})
}

// Drawn with nothing loaded: a conversation that began without a start event
// (Claude Code 2.1.301 sends none after /clear, and empties every plugin's
// memory). A draw cannot write, so the load runs on a timer, once per
// conversation.
let loadingFor: string | null = null
const loadIfEmpty = async ($: EngineInterface) => {
  if (await read($, isLoaded)) return
  const id = await $.session.id().catch(() => '')
  if (id === loadingFor) return
  loadingFor = id
  $.clock.after(0, () => void loadConversation($).catch(() => (loadingFor = null)))
}

// Only a caveman 4 is followed; an outdated or missing one shows its row.
const isReady = async ($: EngineInterface) => (await read($, skill))?.status === 'ready'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const done = await next(e)
    await $.command.register({
      name: 'pulse-caveman',
      description: 'Turn caveman on or off, or see whether it is on',
      argumentHint: 'caveman|ultracave|megacave|off|reload',
    })
    await loadConversation($, { isStart: true })
    return done
  })

  // /clear typed by the person: a new conversation, the question again (or
  // caveman's start mode). Pulse's Clear & continue carries the work on, so
  // the mode carries on too: read before the clear empties this plugin's
  // memory, then loaded again in the new conversation, its time kept.
  on('command.run', { command: 'clear' }, async ($, e, next) => {
    const isHandoff = e.origin.kind === 'plugin' && e.origin.name === 'pulse'
    const was = isHandoff ? await read($, caveman).catch(() => null) : null
    // Written before the clear, which empties this plugin's memory a moment
    // after it returns and so starts a second load from the first draw:
    // whichever load comes last, it finds the carry. A typed /clear writes
    // none, so it starts afresh.
    await noting(async () => {
      const carry: Carry | null = was?.mode
        ? { mode: was.mode, since: was.since, from: await $.session.id(), at: await $.clock.now() }
        : null
      await $.store.set(CARRY_KEY, carry)
    })
    const done = await next(e)
    // Claimed for the new conversation at once, before its first draw loads
    // it (Claude Code 2.1.303 draws a new window before its session.start):
    // a carry goes only to the conversation it names.
    if (was?.mode) {
      await noting(async () => {
        const raw = (await $.store.get(CARRY_KEY)) as Carry | null
        if (raw) await $.store.set(CARRY_KEY, { ...raw, to: await $.session.id() })
      })
    }
    await noting(async () => {
      await loadConversation($)
      if (was?.mode && (await isReady($))) await loadSkill($, was.mode)
    })
    return done
  })

  on('command.run', { command: 'pulse-caveman' }, async ($, e) => ({ text: await act($, e.args) }))

  // `/caveman`, `/ultracave` or `/megacave` typed by the person: that mode
  // is on (`/caveman ultra` and `/caveman wenyan` name the siblings).
  // `/caveman status` changes nothing.
  on('command.run', async ($, e, next) => {
    const done = await next(e)
    const loaded = modeOfCommand(e.command)
    const mode = loaded === 'caveman' ? modeOfCavemanArgs(e.args) : loaded
    if (mode !== null && e.origin.kind !== 'plugin') {
      await noting(async () => {
        if (!(await isReady($))) return
        const active = await turnedOn($, mode)
        await change($, () => active)
      })
    }
    return done
  })

  // Claude loading a caveman skill by itself: that mode is on, unless one is.
  on('skill.prompt', async ($, e, next) => {
    const done = await next(e)
    const mode = modeOfCommand(e.skill)
    if (mode === null) return done
    await noting(async () => {
      if (!(await isReady($)) || (await read($, caveman)).mode !== null) return
      const active = await turnedOn($, mode)
      await change($, () => active)
    })
    return done
  })

  // The person's own message: the start question has had its chance, and
  // "stop caveman" or "normal mode" turns it off. `/caveman status` gets the
  // mode as the line the skill relays (`Caveman mode: ultracave`), so it
  // reports what is on rather than guessing.
  on('prompt.submit', async ($, e, next) => {
    const c = (await isReady($).catch(() => false)) ? await read($, caveman).catch(() => null) : null
    const isStatus =
      e.command !== undefined && modeOfCommand(e.command.name) === 'caveman' && modeOfCavemanArgs(e.command.args) === null
    const done = await next(
      isStatus && c !== null ? { ...e, context: [...(e.context ?? []), `Caveman mode: ${c.mode ?? 'off'}`] } : e,
    )
    if (c === null || e.origin.kind === 'plugin' || e.command) return done
    await noting(async () => {
      if (c.mode !== null && isStop(e.text)) await change($, () => ({ ...OFF, isAsked: true }))
      else if (!c.isAsked) await change($, old => ({ ...old, isAsked: true }))
    })
    return done
  })

  // Three wordy answers in a row: fading.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    await noting(async () => {
      const c = await read($, caveman)
      if (c.mode === null || c.isFading || !isChecked(c.mode)) return
      const wordy = isWordy(e.answer) ? c.wordy + 1 : 0
      await change($, old => ({ ...old, wordy, isFading: wordy >= WORDY_IN_A_ROW }))
    })
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    await loadIfEmpty($)
    const shown = await read($, addon)
    if (!shown) return below
    const pulse = await pulseDraws($)
    if (pulse.isDrawn) return below
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {/* Pulse's line above the rows. A Pulse before 0.3.0 draws its own
            above these rows already: one line, not two. */}
        {!pulse.isOld && <Text color="promptBorder">{'─'.repeat(Math.max(10, e.props.bodyColumns))}</Text>}
        {below}
        {ownRows($, e, shown, { isOld: pulse.isOld, isWorking: e.props.isWorking, columns: e.props.bodyColumns })}
      </Box>
    )
  })
}
