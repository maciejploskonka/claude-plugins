# Pulse — design

Date: 2026-10-12, updated 2026-10-14
Author: Maciej Ploskonka
Status: matches release 0.1.0

## Goal

Pulse is a Claude Code plugin that shows how the session is doing and gives
one-click actions for it. Colleagues install it with two lines, answer a short
setup wizard once on first launch, and can change their answers later with a
command.

It is ported from two local mods kept in `~/.claude/mods/` as source only
(`usage-bar`, `handoff`; neither is loaded any more) and packs them into one
plugin.

Success means:

- A colleague runs the install lines, starts Claude, finishes the wizard, and
  sees the bar, with no file editing.
- `/pulse-setup` changes what is shown, and the change applies at once.
- Every feature can be turned off.
- All user-facing text is in English.

## Distribution

- Repository: `maciejploskonka/claude-plugins`, public, on GitHub.
- Marketplace name: `maciejploskonka` (so the plugin is `pulse@maciejploskonka`).
- Install (in the Claude Code prompt):

  ```
  /plugin marketplace add maciejploskonka/claude-plugins
  /plugin install pulse@maciejploskonka
  ```

- Updates: bump `version` in `plugin.json`, push; colleagues run
  `/plugin marketplace update maciejploskonka`.
- Optional, later: a repository that wants Pulse for every contributor adds
  `extraKnownMarketplaces` and `enabledPlugins` to its `.claude/settings.json`.

Repository layout:

```
.claude-plugin/marketplace.json        { name: "maciejploskonka", plugins: [{ name: "pulse", source: "./plugins/pulse" }] }
README.md                              plugin list + install lines
docs/specs/                            this file
plugins/pulse/.claude-plugin/plugin.json
plugins/pulse/hooks/hooks.json         { "modules": ["./register.tsx"] }
plugins/pulse/hooks/register.tsx       every function that takes `$`: config, bar, handoff, wizard, hooks
plugins/pulse/hooks/config.ts          config defaults, parsing, wizard steps (pure)
plugins/pulse/hooks/colors.ts          colour rules (pure)
plugins/pulse/hooks/format.ts          text helpers, prompts, note paths (pure)
plugins/pulse/hooks/*.test.ts(x)       tests, with test-engine.tsx as the fake engine
plugins/pulse/types/index.d.ts         $.state contract
plugins/pulse/README.md                install, commands, FAQ, changelog
```

The engine follows `$` only within one file and allows one hooks module, so
all `$` code sits in `register.tsx`, with one hook per event calling each
feature in a fixed order.

## Features

### Usage bar

Above the prompt, under a rule that sets it apart from the transcript. Stats
first, buttons on a row of their own:

```
ctx ██░░░░░░░░ 21% 207k/1M · cache 98% · 5h 1% resets 4h45m · 7d 16% resets 4d03h12m · $28.42
[ Summarize ] [ Handoff ]
```

- Stats, each optional: context meter, token count, cache hit rate of the
  last request, rate limits, reset times, session cost.
- Meter style: bar (`██░░`) or number only.
- Reset times run down to the minute: `7m`, `2h05m`, `4d03h12m`.
- Pulse lays out the rows itself. A stat never splits; when the stats do not
  fit, whole stats move to the next row, without a leading ` · `.
- Buttons, each optional: `Summarize` (runs compaction), `Handoff`. Always on
  their own row under the stats; a button added later joins that row. Hidden
  while Claude is working.
- Other plugins' rows sit under the rule, above the bar.

### Handoff

- `/pulse-handoff` or the `Handoff` button asks Claude to write a handoff note.
- Notes go to `~/.claude/handoffs/<project>-<yyyy-mm-dd-hhmm>.md` or
  `<project>/.claude/handoffs/...`, as configured.
- When the note exists, a row offers `[ Clear & continue ]`, which runs
  `/clear` and then asks the fresh conversation to read the note.
- One toast per conversation when the context reaches the alarm threshold.

## Colours

Colours are theme keys, not fixed values, so Pulse follows the person's
Claude Code theme (light, dark, colour-blind ones) instead of fighting it.

Usage bar:

| Part | Colour |
| --- | --- |
| The rule above the bar | `promptBorder` (same line colour as the prompt box) |
| Labels (`ctx`, `cache`, `5h`, `7d`), separators `·`, reset times, cost, unknown values `–` | `inactive` (the theme's brighter grey) |
| Meter, filled cells | `success` below the alarm, `warning` from it, `error` from the red level |
| Meter, empty cells | `subtle` (dimmer than the labels) |
| Context % and tokens | as the filled cells |
| Cache hit rate | `success` from 80%, `warning` 50–79%, `error` below 50% (a cold cache costs money) |
| Rate limit % | `text` below 70%, `warning` 70–89%, `error` from 90% |
| `Summarize` | secondary button |
| `Handoff` | secondary below the alarm, primary from it |

The red level is the alarm + 15, at most 95.

Handoff rows: `Writing handoff note…` in `suggestion`, `Handoff saved: <path>`
in `success`, the path itself `subtle`.

Wizard: title `claude`, `step 2/4` `subtle`, `[x]` items full strength, `[ ]`
items dim, the live preview drawn with the bar's own colours.

When colour is not available (a `NO_COLOR` terminal), every part still reads
by its text alone: no information is carried by colour only.

## Configuration

One object in `$.store` under the key `config`, per user, kept across sessions:

```ts
type Config = {
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
  alarm: 50 | 60 | 75 | 90
  handoffDir: 'home' | 'project'
}
```

Defaults: everything on, `meter: 'bar'`, `alarm: 75`, `handoffDir: 'home'`,
`setupDone: false`.

- A stored config missing fields (an older version) is filled from defaults;
  fields Pulse no longer knows are ignored.
- A stored config that does not parse is replaced by defaults, with one toast.
- Features read the config from `$.state` (a copy loaded at `session.start`), so
  a save redraws the bar at once without a restart.

## Setup wizard

- First launch (`setupDone: false`): at `session.start` Pulse opens the pane
  `Pulse setup` with the keyboard in it. If the terminal is too narrow for the
  pane, a row above the prompt says
  `Pulse is not set up yet.  [ Set up ]  [ Use defaults ]`.
- `Use defaults` saves the defaults with `setupDone: true`; no more asking.
- Four steps, one per screen:
  1. Features: `[x] Usage bar`, `[x] Handoff`.
  2. Bar items: the stats and buttons as `[x]` / `[ ]`; meter style as
     options; a live preview of the bar built from the session's real numbers.
  3. Alarm threshold: options 50 / 60 / 75 / 90, with the preview in colour.
  4. Handoff: note folder. When the project folder is picked, the step says to
     add `.claude/handoffs/` to `.gitignore`.
  Steps for features turned off in step 1 are skipped.
- Keyboard: Up, Down and Enter are enough. Every choice is one option per
  line (no dropdowns); `Back` sits above `Next`, and `Finish` replaces `Next`
  on the last step. Each step starts with the focus on `Next` / `Finish`, so
  Enter moves on and Up reaches the answers. Toggles also answer `1`–`9`;
  `n`, `b`, `f` press Next, Back, Finish. A hint line lists the keys.
  Left at the pane's edge is Claude Code's own and leaves the pane, so
  nothing in the wizard needs Left or Right.
- `/pulse-setup` from the prompt asks for the keyboard again once the command
  has cleared the prompt; if Claude Code still refuses, a toast says to press
  ctrl+x then Tab.
- The wizard edits a draft. `Finish` saves it with `setupDone: true` and shows
  a result screen: `✓ Pulse is set up. You're ready to roll.`, what is on, and
  `[ Close ]`. If saving fails it says why, keeps the old settings, and offers
  `[ Try again ]`. Closing the pane any other way (Esc, close mark) saves
  nothing; on first launch the "not set up" row then stays until the person
  picks.

Commands:

| Command | Does |
| --- | --- |
| `/pulse-setup` | Opens the wizard, starting from the current config |
| `/pulse-handoff` | Starts a handoff |
| `/pulse-reset` | Restores defaults, keeps `setupDone: true` |

A command whose feature is off answers with a one-line hint to turn it on in
`/pulse-setup`.

## Known constraints

- The `[-]` mark at the right of the bar is drawn by Claude Code, not Pulse.
  Pulse cannot change it or see that the bar was collapsed.
- Claude Code keeps a row under the band for its own short notices (the
  effort level, for one); it shows empty between them.
- A slash command's own hook cannot start a turn, so commands that ask Claude
  something submit the prompt from `$.clock.after(0, ...)`.
- If running `/clear` from the plugin fails, a toast tells the person to type
  `/clear`, and the resume still fires.
- A pane opened unasked is drawn only from 144 columns (110 once opened by
  the person); below that it waits.

## Testing

`claude plugin test plugins/pulse`, UI tests on `terminal` and `desktop`:

- bar: stats, colours, row layout at several widths, buttons, a feature off;
- handoff: note, clear and resume, alarm toast, note folder;
- wizard: first launch opens it with the keyboard; `Use defaults` saves and
  stops asking; Next / Back / Finish; the result screen and a failed save;
  closing without Finish saves nothing; `/pulse-setup` starts from the stored
  config; skipped steps for disabled features; hotkeys and focus;
- config: missing fields filled, broken config replaced;
- reset times.

The test kit cannot move the focus ring, so the focus landing on `Next` after
each step is checked by hand.

Before every commit: `tsc -p plugins/pulse` and `claude plugin validate
plugins/pulse`.

## Out of scope

- A status line from Pulse; the status line is not touched.
- Settings in `/config` (`userConfig`).
- Organisation-wide rollout through managed settings.
- The Teams post: written after the first release, with real screenshots.
