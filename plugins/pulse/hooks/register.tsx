import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AddonButton, AddonPart, Alarm, CacheTotals, Config, Draft, PulseAddon, SetupResult, UsageSnapshot } from '../types'
import { ADDON_CONTRACT, readAddon, splitCommand } from './addons'
import { GREY, TRACK, cacheColor, ctxColor, limitColor, redLevel } from './colors'
import {
  ALARMS,
  HINT,
  STORE_KEY,
  defaults,
  focusOrder,
  fromRaw,
  isObj,
  needsHandoffCommand,
  nextKeyOf,
  startKey,
  steps,
} from './config'
import {
  LIMIT_NAMES,
  RESUME_PROMPT,
  SAMPLE_CACHE,
  WRITE_PROMPT,
  cells,
  hitRate,
  notePathFor,
  pct,
  resetsIn,
  size,
  withSamples,
} from './format'

// Every function that takes `$` lives in this file: the engine follows `$`
// only within one file. Pure helpers live beside it.

type RenderIn = Parameters<EngineInterface['ui']['resolve']>[0]

// ── Config ──────────────────────────────────────────────────────────────

const config = atom({ plugin: 'pulse', key: 'config' } as const, defaults())

// Reads the stored config into $.state, where every feature reads it.
const loadConfig = async ($: EngineInterface): Promise<Config> => {
  const raw = await $.store.get(STORE_KEY)
  let cfg: Config
  if (raw === undefined) {
    cfg = defaults()
  } else if (isObj(raw)) {
    cfg = fromRaw(raw)
  } else {
    cfg = defaults()
    await $.store.set(STORE_KEY, cfg)
    $.ui.toast('Pulse settings were unreadable and were reset to defaults.')
  }
  await update($, config, () => cfg)
  return cfg
}

// What a conversation's Pulse needs before it draws: the saved settings, the
// handoff command where it is wanted, the add-on contract, the numbers.
const isLoaded = atom({ plugin: 'pulse', key: 'isLoaded' } as const, false)

const loadSession = async ($: EngineInterface) => {
  const cfg = await loadConfig($)
  await offerHandoffCommand($, cfg)
  await publishAddons($, cfg)
  await refreshUsage($)
  await update($, isLoaded, () => true)
  return cfg
}

// Drawn with nothing loaded: a conversation that started without telling
// Pulse (a /clear another plugin ran, or one Claude Code started itself).
// A draw cannot write, so the load runs on a timer, once per conversation.
let loadingFor: string | null = null
const loadIfEmpty = async ($: EngineInterface) => {
  if (await read($, isLoaded)) return
  const id = await $.session.id().catch(() => '')
  if (id === loadingFor) return
  loadingFor = id
  $.clock.after(0, () => void loadSession($).catch(() => (loadingFor = null)))
}

// Stores `cfg` and applies it at once: the state write redraws every reader.
const saveConfig = async ($: EngineInterface, cfg: Config) => {
  await $.store.set(STORE_KEY, cfg)
  await update($, config, () => cfg)
  await offerHandoffCommand($, cfg)
  await publishAddons($, cfg)
}

// ── Add-ons ─────────────────────────────────────────────────────────────
// Pulse-family plugins hand Pulse what to draw (PulseAddon, under their key
// `addon`); Pulse draws it in its bar and says so in `pulse.addons`. With
// the bar off it says nothing, and each add-on draws its own rows.

const addons = atom({ plugin: 'pulse', key: 'addons' } as const, null)

const publishAddons = async ($: EngineInterface, cfg: Config) => {
  await update($, addons, () => (cfg.features.bar ? { contract: ADDON_CONTRACT } : null))
}

// The add-ons Pulse knows, each read by its literal name, as $.state.get
// requires; one not installed has never written and reads as nothing.
type Addon = { name: string; addon: PulseAddon }
const readAddons = async ($: EngineInterface): Promise<Addon[]> => {
  const found: Addon[] = []
  const take = (name: string, raw: unknown) => {
    const addon = readAddon(raw)
    if (addon) found.push({ name, addon })
  }
  try {
    take('pulse-caveman', (await $.state.get({ plugin: 'pulse-caveman', key: 'addon' })).value)
  } catch {
    // An unreadable add-on draws nothing; the bar stands.
  }
  return found
}

// A press on an add-on's button runs its command; Pulse never changes the
// add-on's state itself.
const runAddon = async ($: EngineInterface, command: string) => {
  try {
    await $.command.run(splitCommand(command))
  } catch {
    $.ui.toast(`Could not run /${splitCommand(command).command}.`)
  }
}

// An add-on's buttons, as Pulse's own are drawn.
const addonButtons = (
  $: EngineInterface,
  { Box, Button, Text }: ReturnType<EngineInterface['ui']['resolve']>,
  name: string,
  buttons: AddonButton[],
) =>
  buttons.map((b, n) => (
    <Box key={`addon-${name}-${b.key}-slot`}>
      {n > 0 && <Text> </Text>}
      <Button
        key={`addon-${name}-${b.key}`}
        label={b.label}
        variant={b.primary ? 'primary' : 'secondary'}
        onPress={() => runAddon($, b.command)}
      />
    </Box>
  ))

// An add-on's own row above the bar (a question it asks), as Pulse's setup
// row stands there; null when no add-on has one.
const addonPromptRows = async ($: EngineInterface, e: RenderIn, cfg: Config) => {
  if (!cfg.features.bar) return null
  const asking = (await readAddons($)).filter(a => a.addon.prompt !== null)
  if (asking.length === 0) return null
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  return (
    <Box key="addon-prompts" flexDirection="column">
      {asking.map(({ name, addon }) => (
        <Box key={`addon-${name}-prompt`}>
          {addon.prompt!.parts.map((p, n) => (
            <Text key={String(n)} color={p.dim ? GREY : p.color} dimColor={p.dim ? true : undefined}>
              {p.text}
            </Text>
          ))}
          <Text> </Text>
          {addonButtons($, ui, name, addon.prompt!.buttons)}
        </Box>
      ))}
    </Box>
  )
}

// /pulse-handoff only where no Handoff button is there to press. The engine
// cannot take a command back, so one turned unneeded stays till the next
// session, where it is not registered; it still works meanwhile.
const offerHandoffCommand = async ($: EngineInterface, cfg: Config) => {
  if (!needsHandoffCommand(cfg)) return
  await $.command.register({
    name: 'pulse-handoff',
    description: 'Write a handoff note, then clear and continue from it',
    argumentHint: '[focus]',
  })
}

// ── Usage bar ───────────────────────────────────────────────────────────

// Usage is re-read on every turn end; this keeps limits fresh while idle.
const REFRESH_MS = 60_000

const last = atom({ plugin: 'pulse', key: 'last' } as const, null)
const usage = atom({ plugin: 'pulse', key: 'usage' } as const, null)
const isCompacting = atom({ plugin: 'pulse', key: 'isCompacting' } as const, false)

const refreshUsage = async ($: EngineInterface) => {
  try {
    const u = await $.session.usage()
    const snapshot: UsageSnapshot = {
      contextPercent: u.context.percent ?? null,
      contextTokens: u.context.tokens ?? null,
      contextWindow: u.context.window,
      limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
      usd: u.cost?.usd ?? null,
    }
    await update($, usage, () => snapshot)
  } catch {
    // No session bound yet (a reload mid-start): the next refresh fills it.
  }
}

// ── Focus from the prompt box ───────────────────────────────────────────
// Text typed in the prompt box and not sent steers the Summarize or Handoff
// press that comes next; once used, the box is emptied, so it is not sent
// as a message of its own too. Nothing typed: the buttons work as before.

const FOCUS_TOAST = 'Used your typed text as the focus.'

const typedFocus = async ($: EngineInterface) => (await $.prompt.read()).text.trim()

const focusUsed = async ($: EngineInterface) => {
  await $.prompt.fill({ text: '' }).catch(() => {})
  $.ui.toast(FOCUS_TOAST)
}

const summarize = async ($: EngineInterface) => {
  if (await read($, isCompacting)) return
  await update($, isCompacting, () => true)
  try {
    const focus = await typedFocus($)
    const { skip } = await $.session.compact(focus === '' ? {} : { instructions: focus })
    if (skip) $.ui.toast('Summarize was skipped by another plugin.')
    else if (focus !== '') await focusUsed($)
  } catch {
    $.ui.toast('Cannot summarize while Claude is working.')
  } finally {
    await update($, isCompacting, () => false)
    await refreshUsage($)
  }
}

// A compaction can take longer than a press may run (10 s): the press only
// starts it, on a timer, and returns.
const summarizeSoon = ($: EngineInterface) => {
  $.clock.after(0, () => void summarize($))
}

// One row of the bar, from `cfg` and the numbers in state. `isPreview` draws
// the buttons as plain text, so the wizard's preview presses nothing.
const barRow = async (
  $: EngineInterface,
  e: RenderIn,
  cfg: Config,
  opts: { isWorking: boolean; isPreview: boolean; columns: number },
) => {
  const { Box, Button, Text } = $.ui.resolve(e)
  const now = await $.clock.now()
  const real = await read($, usage)
  const u = opts.isPreview ? withSamples(real, now) : real
  const busy = await read($, isCompacting)
  const cache = hitRate(await read($, last)) ?? (opts.isPreview ? SAMPLE_CACHE : null)

  const ctx = u?.contextPercent ?? null
  const ctxC = ctxColor(ctx, cfg.alarm)
  const isAlarm = ctx !== null && ctx >= cfg.alarm
  const m = cells(ctx)
  const showSummarize = cfg.bar.buttons.summarize
  const showHandoff = cfg.bar.buttons.handoff && cfg.features.handoff

  // The bar is pieces, each kept whole. Pulse packs them into rows itself
  // (the engine's flex wrap left a spare empty row): a piece that does not
  // fit starts the next row and drops its leading separator there.
  // `alt`: a shorter form, drawn when the piece does not fit the rest of its row.
  type Piece = { key: string; text: string; sep: string; draw: (sep: string) => RenderChildren; alt?: Piece }
  const textPiece = (key: string, parts: [string, string][]): Piece => ({
    key,
    text: parts.map(([, t]) => t).join(''),
    sep: ' · ',
    draw: sep => (
      <Box key={`bar-${key}`} flexShrink={0}>
        <Text wrap="truncate-end">
          {sep !== '' && <Text color={GREY} dimColor>{sep}</Text>}
          {parts.map(([color, t], n) => (
            <Text key={String(n)} color={color} dimColor={color === GREY ? true : undefined}>
              {t}
            </Text>
          ))}
        </Text>
      </Box>
    ),
  })

  const ctxParts: [string, string][] = [[GREY, 'ctx ']]
  if (cfg.bar.meter === 'bar') ctxParts.push([ctxC, m.full], [TRACK, `${m.empty} `])
  ctxParts.push([ctxC, pct(ctx)])
  if (cfg.bar.tokens && u && u.contextTokens !== null) {
    ctxParts.push([ctxC, ` ${size(u.contextTokens)}/${size(u.contextWindow)}`])
  }
  const pieces: Piece[] = [textPiece('ctx', ctxParts)]
  if (cfg.bar.cache) pieces.push(textPiece('cache', [[GREY, 'cache '], [cacheColor(cache), pct(cache)]]))
  if (cfg.bar.limits) {
    const known = u?.limits ?? []
    // Limits arrive with the first request; until then, placeholders.
    if (known.length === 0) {
      for (const kind of ['five_hour', 'seven_day']) {
        pieces.push(textPiece(kind, [[GREY, `${LIMIT_NAMES[kind]} `], [GREY, '–']]))
      }
    }
    for (const l of known) {
      const reset = cfg.bar.resets ? resetsIn(l.resetsAt, now) : ''
      const parts: [string, string][] = [
        [GREY, `${LIMIT_NAMES[l.kind] ?? l.kind} `],
        [limitColor(l.percentUsed), `${l.percentUsed}%`],
      ]
      if (reset !== '') parts.push([GREY, ` ${reset}`])
      pieces.push(textPiece(l.kind, parts))
    }
  }
  if (cfg.bar.cost && u && u.usd !== null) pieces.push(textPiece('cost', [[GREY, `$${u.usd.toFixed(2)}`]]))

  // Add-ons: each one's stat last on the stats row; its buttons inside that
  // stat where it asks (`caveman ultra [ Off ] · on 3m`), else after Pulse's
  // own. Not in the setup preview, which shows Pulse's own parts.
  const plugged = opts.isPreview ? [] : await readAddons($)
  const isInlineShown = !busy && !opts.isWorking
  for (const { name, addon } of plugged) {
    if (!addon.stat) continue
    if (addon.buttonsAt === null || addon.buttons.length === 0) {
      pieces.push(textPiece(`addon-${name}`, addon.stat.map(p => [p.dim ? GREY : p.color, p.text])))
      continue
    }
    const at = addon.buttonsAt
    const drawPart = (p: AddonPart, n: number) => (
      <Text key={String(n)} color={p.dim ? GREY : p.color} dimColor={p.dim ? true : undefined}>
        {p.text}
      </Text>
    )
    // Hidden while Claude works, as the button row is.
    const shown = isInlineShown ? addon.buttons : []
    const piece = (parts: AddonPart[], key: string): Piece => {
      const before = parts.slice(0, at)
      const after = parts.slice(at)
      return {
        key,
        text: [...before, ...after].map(p => p.text).join('') + shown.map(b => ` [ ${b.label} ]`).join(''),
        sep: ' · ',
        draw: sep => (
          <Box key={`bar-${key}`} flexShrink={0}>
            {sep !== '' && <Text color={GREY} dimColor>{sep}</Text>}
            {before.map(drawPart)}
            {shown.map(b => (
              <Box key={`addon-${name}-${b.key}-slot`}>
                <Text> </Text>
                <Button
                  key={`addon-${name}-${b.key}`}
                  label={b.label}
                  variant={b.primary ? 'primary' : 'secondary'}
                  onPress={() => runAddon($, b.command)}
                />
              </Box>
            ))}
            {after.map((p, n) => drawPart(p, before.length + n))}
          </Box>
        ),
      }
    }
    const full = piece(addon.stat, `addon-${name}`)
    pieces.push(addon.short ? { ...full, alt: piece(addon.short, `addon-${name}-short`) } : full)
  }
  const addonGroups = plugged.filter(a => a.addon.buttons.length > 0 && (a.addon.buttonsAt === null || !a.addon.stat))

  // Actions: the buttons, side by side on a row of their own under the
  // stats. A button added later goes in this list and lands there too.
  const actions: { key: string; label: string; isPrimary: boolean; onPress: () => unknown }[] = []
  if (showSummarize) actions.push({ key: 'summarize', label: 'Summarize', isPrimary: false, onPress: () => summarizeSoon($) })
  if (showHandoff) actions.push({ key: 'handoff', label: 'Handoff', isPrimary: isAlarm, onPress: () => handoffPressed($, cfg) })
  const isActing = actions.length + addonGroups.length > 0 && (opts.isPreview || busy || !opts.isWorking)

  const statColumns = Math.max(10, opts.columns)
  const rows: { piece: Piece; sep: string }[][] = [[]]
  let used = 0
  for (const piece of pieces) {
    const row = rows[rows.length - 1]!
    const wide = piece.sep.length + piece.text.length
    const alt = piece.alt
    if (row.length > 0 && used + wide > statColumns && alt && used + alt.sep.length + alt.text.length <= statColumns) {
      // Too long for the rest of the row, but its short form fits there.
      row.push({ piece: alt, sep: alt.sep })
      used += alt.sep.length + alt.text.length
    } else if (row.length > 0 && used + wide > statColumns) {
      rows.push([{ piece, sep: '' }])
      used = piece.text.length
    } else {
      row.push({ piece, sep: row.length > 0 ? piece.sep : '' })
      used += row.length > 1 ? wide : piece.text.length
    }
  }

  // With the rows it takes, which the setup window counts.
  const el = (
    <Box key="bar" flexDirection="column">
      <Box key="bar-stats" flexDirection="column">
        {rows.map((row, n) => (
          <Box key={`bar-row-${n}`}>{row.map(({ piece, sep }) => piece.draw(sep))}</Box>
        ))}
      </Box>
      {isActing && (
        <Box key="bar-actions">
          {busy ? (
            <Text color={GREY} dimColor>summarizing…</Text>
          ) : opts.isPreview ? (
            <Text color={GREY} dimColor>{actions.map(a => `[ ${a.label} ]`).join(' ')}</Text>
          ) : (
            // One flat list: a fragment here would stack its children.
            [
              ...actions.map((a, n) => (
                <Box key={`${a.key}-slot`}>
                  {n > 0 && <Text> </Text>}
                  <Button key={a.key} label={a.label} variant={a.isPrimary ? 'primary' : 'secondary'} onPress={a.onPress} />
                </Box>
              )),
              // Each add-on after a 3-space gap, behind its grey `label:`.
              ...addonGroups.map(({ name, addon }, n) => (
                <Box key={`addon-${name}-buttons`}>
                  {(n > 0 || actions.length > 0) && <Text>{'   '}</Text>}
                  {addon.label !== '' && <Text color={GREY} dimColor>{`${addon.label}: `}</Text>}
                  {addonButtons($, $.ui.resolve(e), name, addon.buttons)}
                </Box>
              )),
            ]
          )}
        </Box>
      )}
    </Box>
  )
  return { el, rows: rows.length + (isActing ? 1 : 0) }
}

// ── Handoff ─────────────────────────────────────────────────────────────

const handoffPhase = atom({ plugin: 'pulse', key: 'handoffPhase' } as const, 'idle')
const handoffPath = atom({ plugin: 'pulse', key: 'handoffPath' } as const, null)
const handoffReminded = atom({ plugin: 'pulse', key: 'handoffReminded' } as const, false)

// `focus`: what the note is to be about, '' for the whole session.
const startHandoff = async ($: EngineInterface, cfg: Config, focus = '') => {
  const root = (await $.session.root()).replace(/\/+$/, '')
  const base = cfg.handoffDir === 'project' ? root : ((await $.env.get('HOME')) ?? '/tmp')
  const file = notePathFor(base, root, await $.clock.now())
  await update($, handoffPath, () => file)
  await update($, handoffPhase, () => 'writing' as const)
  // On a timer, outside the calling hook: a slash command's own hook
  // cannot start a turn.
  $.clock.after(0, () => void $.prompt.submit({ text: WRITE_PROMPT(file, focus) }))
}

// The bar's button: its focus is what is typed in the prompt box.
const handoffPressed = async ($: EngineInterface, cfg: Config) => {
  const focus = await typedFocus($)
  await startHandoff($, cfg, focus)
  if (focus !== '') await focusUsed($)
}

// /clear starts a new conversation with Pulse's memory of the old one gone,
// and no event says so to a plugin (Claude Code 2.1.301). So the note's path
// is read first, and the new conversation is set up and handed the note
// right after the clear returns.
const clearAndContinue = async ($: EngineInterface) => {
  const file = await read($, handoffPath)
  await update($, handoffPhase, () => 'resuming' as const)
  try {
    await $.command.run({ command: 'clear' })
  } catch {
    await update($, handoffPhase, () => 'saved' as const)
    $.ui.toast(`Could not clear. Type /clear, then ask Claude to read ${file ?? 'the handoff note'}.`)
    return
  }
  await newConversation($)
  // On a timer, outside the press, as every turn Pulse starts.
  if (file) $.clock.after(0, () => void $.prompt.submit({ text: RESUME_PROMPT(file), asUser: true }))
}

const handoffRow = async ($: EngineInterface, e: RenderIn, cfg: Config) => {
  const phase = await read($, handoffPhase)
  if (!cfg.features.handoff || phase === 'idle') return null

  const file = await read($, handoffPath)
  const { Box, Button, Link, Text } = $.ui.resolve(e)
  const dismiss = () => update($, handoffPhase, () => 'idle' as const)

  if (phase === 'writing') {
    return (
      <Box key="handoff">
        <Text color="suggestion">⚑ Writing handoff note… </Text>
        <Button key="handoff-cancel" label="Cancel" variant="secondary" onPress={dismiss} />
      </Box>
    )
  }
  if (phase === 'saved') {
    return (
      <Box key="handoff">
        <Box flexShrink={0}>
          <Text color="success">⚑ Handoff saved: </Text>
        </Box>
        {/* A terminal without links draws the name, then the whole URL: it is
            cut in the middle there, so the label and buttons keep their row. */}
        <Box flexShrink={1}>
          <Text color={GREY} wrap="truncate-middle">
            {file ? <Link key="handoff-file" href={encodeURI(`file://${file}`)} label={file.split('/').pop()} /> : ''}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text> </Text>
          <Button key="handoff-clear" label="Clear & continue" variant="primary" onPress={() => clearAndContinue($)} />
          <Text> </Text>
          <Button key="handoff-keep" label="Keep going" variant="secondary" onPress={dismiss} />
        </Box>
      </Box>
    )
  }
  return (
    <Box key="handoff">
      <Text color={GREY} dimColor>⚑ Clearing… the note is read in the new conversation.</Text>
    </Box>
  )
}

// After a main-loop turn: has the note appeared, or is it time to remind?
const handoffOnTurnEnd = async ($: EngineInterface, cfg: Config) => {
  const phase = await read($, handoffPhase)
  if (phase === 'writing') {
    const file = await read($, handoffPath)
    if (file && (await $.fs.exists(file))) {
      await update($, handoffPhase, () => 'saved' as const)
      $.ui.toast('Handoff note saved.')
    }
    return
  }

  let percent: number | null = null
  try {
    percent = (await $.session.usage()).context.percent ?? null
  } catch {
    percent = null
  }
  if (phase === 'idle' && percent !== null && percent >= cfg.alarm && !(await read($, handoffReminded))) {
    // Once per conversation; the lit Handoff button carries it from here.
    await update($, handoffReminded, () => true)
    const how = needsHandoffCommand(cfg) ? '/pulse-handoff' : 'press Handoff below'
    $.ui.toast(`Context ${percent}% full — time for a handoff (${how}).`)
  }
}

// A new conversation (after /clear): nothing carried over from the old one.
// On Claude Code 2.1.301 Pulse's memory is gone already; on older versions it
// is reset here. Then the saved settings are loaded again.
const newConversation = async ($: EngineInterface) => {
  await update($, last, () => null)
  await update($, handoffPhase, () => 'idle' as const)
  await update($, handoffPath, () => null)
  await update($, handoffReminded, () => false)
  await loadSession($)
}

// ── Setup wizard ────────────────────────────────────────────────────────

const SETUP_PANE = 'pulse-setup'
// The bar step's two columns: the left one's width, and the body width they need.
const BAR_LEFT_WIDTH = 32
const BAR_COLUMNS_MIN = 60
// The fewest rows the scrolled window between title and footer is worth.
const WINDOW_MIN = 3

// A piece of a step's middle: what it draws, the rows it takes, and the row
// each of its controls sits on, by key, counted from its top.
type Part = { el: RenderChildren; rows: number; at: Record<string, number> }

// The window over the step's middle as last drawn; null while it all fits
// (or the pane is too short for one, and scrolls whole instead).
let setupWindow: { at: Record<string, number>; rows: number; window: number; first: string } | null = null
const setupOffset = atom({ plugin: 'pulse', key: 'setupOffset' } as const, 0)

// Moves the window just enough to show the control `key` holds the focus
// on; for the first control, to the top, with any label above it; for Back,
// Next or Finish below it, to its end.
const followFocus = async ($: EngineInterface, key: string) => {
  const w = setupWindow
  if (!w) return
  const last = w.rows - w.window
  const row = w.at[key]
  await update($, setupOffset, off =>
    row === undefined
      ? last
      : key === w.first
        ? 0
        : Math.max(0, Math.min(last, row, Math.max(off, row - w.window + 1))),
  )
}

const draft = atom({ plugin: 'pulse', key: 'draft' } as const, null)
const setupFocus = atom({ plugin: 'pulse', key: 'setupFocus' } as const, null)

// Starts a draft from the saved config and opens the pane.
const openSetup = async ($: EngineInterface) => {
  const saved = await read($, config)
  await update($, draft, () => ({ config: saved, step: 0 }))
  return $.ui.open({ id: SETUP_PANE, title: 'Pulse setup', closeOnEscape: true, focus: true })
}

// The engine gives a pane the keyboard only over an empty prompt, and a
// command's text is still in it while its hook runs. So ask again once it
// is done, and say how to get there if the engine still refuses.
const focusSetupSoon = ($: EngineInterface) =>
  $.clock.after(0, async () => {
    await $.ui.open({ id: SETUP_PANE, title: 'Pulse setup', closeOnEscape: true, focus: true })
    const pane = (await $.ui.panes()).find(p => p.id === SETUP_PANE)
    if (pane?.isPlaced && !pane.isFocused) $.ui.toast('Press ctrl+x then Tab to use the Pulse setup with the keyboard.')
  })

// Saves the defaults and closes a wizard still open (or waiting for room),
// so it never appears after the person already chose.
const useDefaults = async ($: EngineInterface) => {
  await saveConfig($, { ...defaults(), setupDone: true })
  await update($, draft, () => null)
  await $.ui.close({ id: SETUP_PANE })
}

const isSetupUp = async ($: EngineInterface) => {
  try {
    return (await $.ui.panes()).some(p => p.id === SETUP_PANE && p.isPlaced)
  } catch {
    return false
  }
}

// Above the prompt until the person picks, unless the wizard is on screen.
const setupRow = async ($: EngineInterface, e: RenderIn, cfg: Config) => {
  if (cfg.setupDone) return null
  if (await isSetupUp($)) return null

  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box key="setup">
      <Text color="claude">Pulse is not set up yet. </Text>
      <Button
        key="setup-open"
        label="Set up"
        variant="primary"
        onPress={async () => {
          await openSetup($)
          focusSetupSoon($)
        }}
      />
      <Text> </Text>
      <Button key="setup-defaults" label="Use defaults" variant="secondary" onPress={() => useDefaults($)} />
    </Box>
  )
}

// ── Hooks ───────────────────────────────────────────────────────────────
// One hook per event (the engine allows no second unmatched one); each
// calls the features' own steps in a fixed order.

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const cfg = await loadSession($)
    await $.command.register({ name: 'pulse-setup', description: 'Choose what Pulse shows and how' })
    await $.command.register({ name: 'pulse-reset', description: 'Restore Pulse’s default settings' })
    // Stops on reload, and session.start fires again then.
    $.clock.every(REFRESH_MS, () => void refreshUsage($))
    if (!cfg.setupDone && e.isInteractive) void openSetup($)
    return next(e)
  })

  // /clear typed by the person: a new conversation. (Clear & continue runs
  // its own, which no hook of Pulse's sees, and sets up after it itself.)
  on('command.run', { command: 'clear' }, async ($, e, next) => {
    const done = await next(e)
    await newConversation($).catch(() => {})
    return done
  })

  // Every main-loop model request: what the cache served. It streams:
  // forward the chunks untouched, then read the result.
  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    if (e.agentId === undefined && res.usage && (await read($, config)).features.bar) {
      const step: CacheTotals = {
        read: res.usage.cache_read_input_tokens,
        written: res.usage.cache_creation_input_tokens,
        uncached: res.usage.input_tokens,
      }
      await update($, last, () => step)
    }
    return res
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    const cfg = await read($, config)
    if (cfg.features.bar) await refreshUsage($)
    if (cfg.features.handoff) await handoffOnTurnEnd($, cfg)
    return done
  })

  // Its focus is the text after the command: the prompt box still holds the
  // command line itself while this runs.
  on('command.run', { command: 'pulse-handoff' }, async ($, e) => {
    const cfg = await read($, config)
    if (!cfg.features.handoff) return { text: HINT('Handoff') }
    await startHandoff($, cfg, e.args.trim())
    return { text: 'Asking Claude to write the handoff note.' }
  })

  on('command.run', { command: 'pulse-setup' }, async $ => {
    const { isPlaced } = await openSetup($)
    if (isPlaced) focusSetupSoon($)
    return { text: isPlaced ? 'Pulse setup opened.' : 'Pulse setup opens once the terminal is wider.' }
  })

  // An arrow past the wizard's edge would carry the focus out of it (to the
  // pane's close mark, another tab or the session list). Keep it on the
  // wizard's own controls; Esc still hands the keyboard back.
  // It also remembers where the ring lands, for the arrows below.
  on('ui.focus', { requestId: SETUP_PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person' && e.element === undefined) return {}
    const done = await next(e)
    if (!done.deny && e.element !== undefined) {
      await update($, setupFocus, () => e.element ?? null)
      await followFocus($, e.element)
    }
    return done
  })

  // While the wizard is taller than its pane, the engine spends an arrow on
  // scrolling a row. Spend it on the next control instead: the engine keeps
  // the focused one in view. Past the first or last control the arrow
  // scrolls, so the title and the key hints can still be reached.
  on('ui.scroll', { requestId: SETUP_PANE }, async ($, e, next) => {
    // The wheel and page keys move Pulse's own window, when there is one.
    const w = setupWindow
    if (w && e.origin.kind === 'person' && (e.pointer !== undefined || Math.abs(e.by) !== 1)) {
      const last = w.rows - w.window
      await update($, setupOffset, off => Math.max(0, Math.min(last, off + e.by)))
      return {}
    }
    const d = await read($, draft)
    if (e.origin.kind !== 'person' || e.pointer !== undefined || Math.abs(e.by) !== 1 || !d) return next(e)
    const order = focusOrder(d)
    const at = order.indexOf((await read($, setupFocus)) ?? '')
    // Not known yet: the ring is where every screen starts it.
    const key = order[(at === -1 ? order.indexOf(startKey(d)) : at) + e.by]
    if (key === undefined) return next(e)
    await $.ui.focus({ requestId: SETUP_PANE, key }).catch(() => {})
    return {}
  })

  on('command.run', { command: 'pulse-reset' }, async $ => {
    await useDefaults($)
    return { text: 'Pulse settings were reset to defaults.' }
  })

  // Closed any way but Finish: the draft is dropped, nothing saved.
  on('ui.close', async ($, e, next) => {
    const done = await next(e)
    if (e.id === SETUP_PANE) {
      await update($, draft, () => null)
      await update($, setupFocus, () => null)
      await update($, setupOffset, () => 0)
    }
    return done
  })

  on('ui.render', { component: 'Pane', requestId: SETUP_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const saved = await read($, config)
    const d: Draft = (await read($, draft)) ?? { config: saved, step: 0 }
    const c = d.config
    const list = steps(c)
    const i = Math.min(d.step, list.length - 1)
    const step = list[i] ?? 'features'

    const edit = (fn: (old: Config) => Config) =>
      update($, draft, old => {
        const base = old ?? d
        return { ...base, config: fn(base.config) }
      })
    // Noted here too: the ring's own `ui.focus` can come before the redraw it waits for.
    const focusOn = async (key: string) => {
      await update($, setupFocus, () => key)
      void $.ui.focus({ requestId: SETUP_PANE, key }).catch(() => {})
    }
    // Every step starts at its top: the step number shows, the focus on the
    // first control. n moves on from anywhere.
    const go = async (to: number) => {
      const moved = { ...((await read($, draft)) ?? d), step: to }
      await update($, draft, () => moved)
      await update($, setupOffset, () => 0)
      await focusOn(startKey(moved))
      void $.ui.scroll({ in: SETUP_PANE, to: 'start' }).catch(() => {})
    }
    const first = startKey(d)
    // Saves, then shows how it went in place of the steps; Close ends it.
    const finish = async () => {
      const latest = (await read($, draft))?.config ?? c
      let result: SetupResult
      try {
        await saveConfig($, { ...latest, setupDone: true })
        result = { ok: true }
      } catch (err) {
        // The engine prefixes the reason with where it came from; keep the reason.
        const why = err instanceof Error ? err.message : String(err)
        result = { ok: false, error: why.replace(/^.*\$\.store\.set: /, '') }
      }
      await update($, draft, old => ({ ...(old ?? d), result }))
      await focusOn(result.ok ? 'done-close' : 'done-retry')
    }
    const closeWizard = async () => {
      await update($, draft, () => null)
      await $.ui.close({ id: SETUP_PANE })
    }

    if (d.result) {
      const r = d.result
      return (
        <Box flexDirection="column" width={Math.max(20, e.props.bodyColumns)}>
          <Text color="claude">Pulse setup</Text>
          <Box flexDirection="column" marginTop={1}>
            {r.ok ? (
              <>
                <Text color="success">✓ Pulse is set up. You're ready to roll.</Text>
                <Text color={GREY} dimColor>Change it any time with /pulse-setup.</Text>
              </>
            ) : (
              <>
                <Text color="error">{`✗ Pulse could not save your settings: ${r.error}`}</Text>
                <Text color={GREY} dimColor>Nothing was changed. Try again, or close and run /pulse-setup later.</Text>
              </>
            )}
          </Box>
          <Box key="nav" flexDirection="column" alignItems="flex-start" marginTop={1}>
            {r.ok ? (
              <Button key="done-close" label="Close" hotkey="c" variant="primary" onPress={() => closeWizard()} />
            ) : (
              <>
                <Button key="done-close" label="Close" hotkey="c" variant="secondary" onPress={() => closeWizard()} />
                <Button key="done-retry" label="Try again" hotkey="r" variant="primary" onPress={() => finish()} />
              </>
            )}
          </Box>
          <Text color={GREY} dimColor>{r.ok ? 'Enter or c closes' : '↑↓ move · Enter picks · r try again · c close'}</Text>
        </Box>
      )
    }

    const width = Math.max(20, e.props.bodyColumns)
    // The rows a string takes at `cols` wide, as the terminal wraps it.
    const tall = (s: string, cols = width) => Math.max(1, Math.ceil(s.length / Math.max(1, cols)))

    // No digit keys: a digit is the engine's (band surveys) and leaves the pane.
    const toggle = (key: string, label: string, isOn: boolean, flip: (old: Config) => Config, cols = width): Part => {
      const text = `${isOn ? '[x]' : '[ ]'} ${label}`
      return {
        el: (
          <Box key={key}>
            <Button
              key={key}
              plain
              dimColor={!isOn}
              autoFocus={key === first ? true : undefined}
              label={text}
              onPress={() => edit(flip)}
            />
          </Box>
        ),
        rows: tall(text, cols),
        at: { [key]: 0 },
      }
    }

    // A one-of-several pick: one option per line rather than a dropdown, so
    // Up and Down reach each and Enter picks. Left and Right are the engine's
    // (Left leaves the pane), so nothing here needs them.
    const choose = (
      key: string,
      label: string,
      value: string,
      options: { value: string; label: string }[],
      pick: (v: string) => void,
      cols = width,
    ): Part => {
      const text = (o: { value: string; label: string }) => `${o.value === value ? '(•)' : '( )'} ${o.label}`
      const at: Record<string, number> = {}
      let rows = 1
      for (const o of options) {
        at[`${key}-${o.value}`] = rows
        rows += tall(text(o), cols - 2)
      }
      return {
        el: (
          <Box key={key} flexDirection="column">
            <Text>{label}</Text>
            {options.map(o => (
              <Box key={`${key}-${o.value}-row`} marginLeft={2}>
                <Button
                  key={`${key}-${o.value}`}
                  plain
                  dimColor={o.value !== value}
                  autoFocus={`${key}-${o.value}` === first ? true : undefined}
                  label={text(o)}
                  onPress={() => pick(o.value)}
                />
              </Box>
            ))}
          </Box>
        ),
        rows,
        at,
      }
    }

    const line = (key: string, s: string, color?: string): Part => ({
      el: (
        <Text key={key} color={color} dimColor={color === GREY ? true : undefined}>
          {s}
        </Text>
      ),
      rows: tall(s),
      at: {},
    })
    // Parts one under another, their controls' rows counted from the top.
    const stack = (key: string, list: (Part | null | false)[], marginTop = 0): Part => {
      const shown = list.filter((p): p is Part => !!p)
      const at: Record<string, number> = {}
      let rows = marginTop
      for (const p of shown) {
        for (const [k, r] of Object.entries(p.at)) at[k] = rows + r
        rows += p.rows
      }
      return {
        el: (
          <Box key={key} flexDirection="column" marginTop={marginTop}>
            {shown.map(p => p.el)}
          </Box>
        ),
        rows,
        at,
      }
    }

    // The step's question, on the title row.
    const ask = {
      features: 'Which parts of Pulse do you want?',
      bar: 'What should the bar show?',
      alarm: 'When should the context warning start?',
      details: c.features.handoff ? 'Where should handoff notes go?' : '',
    }[step]

    // The bar as these answers draw it, under the choices: only in the tall
    // pane docked beside the transcript. Above the prompt the pane is short,
    // and the room goes to the choices.
    const bar =
      c.features.bar && e.props.placement === 'dock'
        ? await barRow($, e, c, { isWorking: false, isPreview: true, columns: width })
        : null
    const preview =
      bar && stack('preview', [line('preview-label', 'Preview:', GREY), { el: bar.el, rows: bar.rows, at: {} }], 1)

    let middle: Part
    if (step === 'features') {
      middle = stack('body', [
        toggle('f-bar', 'Usage bar — context, cache, limits and cost above the prompt', c.features.bar, o => ({
          ...o,
          features: { ...o.features, bar: !o.features.bar },
        })),
        toggle('f-handoff', 'Handoff — write a note and start fresh when the context fills up', c.features.handoff, o => ({
          ...o,
          features: { ...o.features, handoff: !o.features.handoff },
        })),
      ])
    } else if (step === 'bar') {
      const flipBar = (k: 'tokens' | 'cache' | 'limits' | 'resets' | 'cost') => (o: Config) => ({
        ...o,
        bar: { ...o.bar, [k]: !o.bar[k] },
      })
      const flipButton = (k: 'summarize' | 'handoff') => (o: Config) => ({
        ...o,
        bar: { ...o.bar, buttons: { ...o.bar.buttons, [k]: !o.bar.buttons[k] } },
      })
      // Two columns where they fit, so the step needs fewer rows. Up and Down
      // still walk every item: the left column, then the right (focusOrder).
      const isTwo = width >= BAR_COLUMNS_MIN
      const leftCols = isTwo ? BAR_LEFT_WIDTH : width
      const rightCols = isTwo ? width - BAR_LEFT_WIDTH : width
      const left = [
        choose(
          'meter',
          'Context meter: ',
          c.bar.meter,
          [
            { value: 'bar', label: 'Bar ██░░' },
            { value: 'number', label: 'Number only' },
          ],
          v => edit(o => ({ ...o, bar: { ...o.bar, meter: v === 'number' ? 'number' : 'bar' } })),
          leftCols,
        ),
        toggle('b-tokens', 'Token count', c.bar.tokens, flipBar('tokens'), leftCols),
        toggle('b-cache', 'Prompt cache hit rate', c.bar.cache, flipBar('cache'), leftCols),
      ]
      const right = [
        toggle('b-limits', 'Rate limits (5h / 7d)', c.bar.limits, flipBar('limits'), rightCols),
        toggle('b-resets', 'Time until limits reset', c.bar.resets, flipBar('resets'), rightCols),
        toggle('b-cost', 'Session cost', c.bar.cost, flipBar('cost'), rightCols),
        toggle('b-summarize', 'Summarize button', c.bar.buttons.summarize, flipButton('summarize'), rightCols),
        c.features.handoff &&
          toggle('b-handoff', 'Handoff button', c.bar.buttons.handoff, flipButton('handoff'), rightCols),
      ]
      let items: Part
      if (isTwo) {
        const l = stack('bar-left', left)
        const r = stack('bar-right', right)
        items = {
          el: (
            <Box key="bar-columns">
              <Box key="bar-left-slot" width={BAR_LEFT_WIDTH}>
                {l.el}
              </Box>
              {r.el}
            </Box>
          ),
          rows: Math.max(l.rows, r.rows),
          at: { ...l.at, ...r.at },
        }
      } else {
        items = stack('bar-column', [...left, ...right])
      }
      middle = stack('body', [items, preview])
    } else if (step === 'alarm') {
      middle = stack('body', [
        choose(
          'alarm',
          'Warn from: ',
          String(c.alarm),
          ALARMS.map(a => ({ value: String(a), label: `${a}%` })),
          v => edit(o => ({ ...o, alarm: (ALARMS.find(a => String(a) === v) ?? 75) as Alarm })),
        ),
        line('levels', `Yellow from ${c.alarm}%, red from ${redLevel(c.alarm)}%.`, GREY),
        preview,
      ])
    } else {
      middle = stack('body', [
        c.features.handoff &&
          choose(
            'handoff-dir',
            'Folder: ',
            c.handoffDir,
            [
              { value: 'home', label: '~/.claude/handoffs (outside your projects)' },
              { value: 'project', label: '.claude/handoffs in the project' },
            ],
            v => edit(o => ({ ...o, handoffDir: v === 'project' ? 'project' : 'home' })),
          ),
        c.features.handoff &&
          c.handoffDir === 'project' &&
          line('gitignore', 'Add .claude/handoffs/ to .gitignore so notes are not committed.', 'warning'),
      ])
    }

    // The title stays on the top row, a blank under it, and Back, Next and
    // the hints on the bottom two. Between them, when the step is taller than
    // the pane gives, a window Pulse scrolls itself: it follows the focus,
    // and the wheel and page keys move it. A pane too short even for that
    // scrolls whole. Drawn whole, the step also has a blank above Back.
    const room = e.props.scroll.bodyRows - 4
    const isClipped = middle.rows + 1 > room && room >= WINDOW_MIN
    setupWindow = isClipped ? { at: middle.at, rows: middle.rows, window: room, first } : null
    const offset = isClipped ? Math.min(Math.max(0, await read($, setupOffset)), middle.rows - room) : 0

    const isLast = i === list.length - 1
    const keys = [
      '↑↓ move',
      'Enter picks',
      i > 0 ? 'b back' : null,
      isLast ? 'f finish' : 'n next',
      'Esc closes',
    ]
    return (
      <Box flexDirection="column" width={width}>
        {/* The question on the left, where the eye starts; the wizard's name on the right. */}
        <Box key="title" justifyContent="space-between">
          <Box key="ask" flexShrink={1}>
            <Text wrap="truncate-end">{ask}</Text>
          </Box>
          <Box key="step" flexShrink={0} marginLeft={2}>
            <Text color="claude">Pulse setup</Text>
            <Text color={GREY} dimColor>{` · step ${i + 1}/${list.length}`}</Text>
          </Box>
        </Box>
        {isClipped ? (
          <Box key="window" flexDirection="column" height={room} overflow="hidden" flexShrink={0} marginTop={1}>
            <Box key="window-rows" flexDirection="column" flexShrink={0} marginTop={-offset}>
              {middle.el}
            </Box>
          </Box>
        ) : (
          <Box key="window" marginY={1}>
            {middle.el}
          </Box>
        )}
        {/* One row, Back then Next/Finish: Down reaches both in that order. */}
        <Box key="nav">
          {i > 0 && <Button key="back" label="Back" hotkey="b" variant="secondary" onPress={() => go(i - 1)} />}
          {i > 0 && <Text> </Text>}
          {isLast ? (
            <Button
              key="finish"
              label="Finish"
              hotkey="f"
              variant="primary"
              autoFocus={first === 'finish' ? true : undefined}
              onPress={() => finish()}
            />
          ) : (
            <Button
              key={nextKeyOf(list, i)}
              label="Next"
              hotkey="n"
              variant="primary"
              autoFocus={first === nextKeyOf(list, i) ? true : undefined}
              onPress={() => go(i + 1)}
            />
          )}
        </Box>
        <Text color={GREY} dimColor wrap="truncate-end">
          {keys.filter(Boolean).join(' · ')}
        </Text>
      </Box>
    )
  })

  // The band above the prompt: a rule, other plugins' rows, then Pulse's
  // rows in a fixed order, so the order never depends on hook order.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    await loadIfEmpty($)

    const cfg = await read($, config)
    const rows = [
      await setupRow($, e, cfg),
      await addonPromptRows($, e, cfg),
      await handoffRow($, e, cfg),
      cfg.features.bar
        ? (await barRow($, e, cfg, { isWorking: e.props.isWorking, isPreview: false, columns: e.props.bodyColumns })).el
        : null,
    ].filter(row => row !== null)
    if (rows.length === 0) return below

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text color="promptBorder">{'─'.repeat(Math.max(10, e.props.bodyColumns))}</Text>
        {below}
        {rows}
      </Box>
    )
  })
}
