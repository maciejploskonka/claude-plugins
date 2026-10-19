# Pulse-caveman — design

Date: 2026-10-15
Author: Maciej Ploskonka
Status: draft, waiting for review. Updated the same day after Pulse 0.2.0
shipped another feature (typed text as the focus of Summarize and Handoff):
Pulse's add-on support moves to 0.3.0.

## Update 2026-10-16: caveman 4

The caveman skill changed upstream (v4). It has no levels any more: the modes
are three sibling skills, `caveman` (the voice), `ultracave` (grammar
stripped) and `megacave` (classical Chinese). `/caveman ultra` and
`/caveman wenyan` are aliases for the last two, and `/caveman status` reports
the mode without changing it. Articles are allowed again; fillers and
ceremony stay banned.

Since Pulse-caveman is not released yet, it was redesigned for caveman 4
only, with nothing kept from the levels. This section wins over anything
below it; read "level" below as "mode".

- **Detection.** At session start Pulse-caveman lists the installed modes
  (`caveman`, `ultracave`, `megacave`, also as `<plugin>:<mode>`). A `caveman`
  whose description names intensity levels is from before 4: outdated.
- **Outdated or missing.** One row: `caveman skill is outdated · update it:
  <link> [ Skip ]` (or `not installed · get it:`). Skip hides Pulse-caveman
  until the skill state changes; it is kept in `$.store` across sessions.
  Nothing else is shown or followed.
- **New session.** `Start this session in caveman? [ caveman ] [ ultracave ]
  [ Not now ]`, one button per installed mode.
- **Active.** The end of the bar's first row: `ultracave (35m) [ Off ]`,
  `[ Off ]` last, refreshed when the minute turns over (`(3h02m)`,
  `(2d03h02m)`). Already short, so no `short` form (Pulse 0.3.0 still draws
  one for add-ons that send it). Fading: `ultracave (35m) · fading [ Reload ]
  [ Off ]`.
- **Off.** `caveman off [ modes ]` (after `Not now` or `Off` alike). `modes`
  opens it: `caveman off [ caveman ] [ ultracave ] [ off ] [ hide ]`; `[ off ]`
  folds it back to `[ modes ]`; `[ hide ]` takes
  the piece away for the conversation, turning caveman on brings it back.
- **Resume.** Each conversation's mode, start, fading and hide are kept in
  `$.store` by session id (the newest 50); `claude --resume` restores them at
  session start (the resumed conversation keeps its id). One with nothing
  kept starts with the question.
- **New conversations without a start event.** On Claude Code 2.1.301,
  `/clear` starts a new conversation with every plugin's memory empty and
  sends no start event (and where an organization manages Claude Code, no
  `classic.*` event at all). Pulse-caveman loads when the band is drawn with
  nothing loaded (on a timer, once per conversation) and after a `/clear` the
  person types. `classic.SessionStart` is not used.
- **Pulse's `Clear & continue` keeps the mode.** A `/clear` run by Pulse
  (origin `{ kind: 'plugin', name: 'pulse' }`) carries the work on, so
  Pulse-caveman reads its mode before the clear, then turns the same mode on
  in the new conversation with its start time kept and runs the mode's
  command again. Off before it: a fresh start, as after a typed `/clear`.
  This wins over the `/clear` rows below.
- **No fading after compaction.** Claude Code restores the skills a
  conversation used after compacting ("Skills restored"), so only drift marks
  fading.
- **caveman's own start mode.** caveman's plugin (not skills copied into a
  skills folder) starts each session in its `defaultMode`, resolved as caveman
  does: `CAVEMAN_DEFAULT_MODE`, `.caveman/config.json` or `.caveman.json` from
  the project up, `~/.config/caveman/config.json`, else `caveman`. A mode
  there: Pulse-caveman starts as active, no question; `manual` or `off`: the
  question. `/clear` repeats it.
- **Outdated check.** `ultracave` or `megacave` installed means caveman 4,
  whatever `caveman`'s description says.
- **Turning on** runs the mode's own command (`/ultracave`). That works
  although `ultracave` and `megacave` forbid Claude to load them itself
  (checked live).
- **Typed commands.** `/caveman`, `/ultracave`, `/megacave` and the skill's own
  aliases `/caveman ultra` and `/caveman wenyan` are followed;
  `/caveman status` changes nothing and gets `Caveman mode: <mode>` as
  context, the line the skill relays.
- **Drift** counts fillers and ceremony ("Sure!", "Let me", "Hope this
  helps"), not articles. `megacave` is not checked.
- **`/pulse-caveman`** takes `caveman`, `ultracave`, `megacave`, `off`,
  `reload`, and `skip` on the outdated or missing row. Nothing else.

## Goal

`pulse-caveman` is a Claude Code plugin in the Pulse family. It makes the
caveman skill easy to turn on, without forcing it. It also shows whether caveman
is on, at which level, and for how long.

- It works on its own, with or without Pulse.
- When Pulse 0.3.0 or later is installed, caveman shows inside the Pulse bar
  instead of in its own row.
- It does not ship the caveman skill. Each person installs the skill
  themselves. Nobody is forced into caveman.

Success means:

- A person with the caveman skill installed starts a session and sees a
  question with level buttons. One press turns caveman on.
- They can always see whether caveman is on, at which level, and since when.
- When caveman may have faded (after a compaction, or answers drifting back
  to full sentences), they see it and can reload it with one press.
- A person without the skill sees one quiet row explaining how to get it, and
  nothing else.
- With Pulse installed, everything sits inside the Pulse bar.

## What the person sees

### Standalone (no Pulse, or Pulse older than 0.3.0)

All rows sit above the prompt, in the Pulse family look.

**Session start** (a new conversation, caveman off). The question is in the
accent colour:

```
Start this session in caveman?  [ lite ] [ full ] [ ultra ]  [ Not now ]
```

- A level button turns caveman on at that level.
- `Not now`, or the person's first message, shrinks it to the off row.
- `/clear` or a Pulse handoff starts a new conversation, so the question
  shows again.

**Off:**

```
caveman off [ lite ] [ full ] [ ultra ]
```

**On:**

```
caveman full [ Off ] · on 12m
```

- `on 12m` counts up from the moment caveman was turned on: `on 0m`, `on 12m`,
  `on 1h05m`.

**Fading:**

```
caveman full [ Reload ] [ Off ] · on 34m · fading
```

- `Reload` sends the same level again and clears `fading`.

**Skill not installed:**

```
caveman skill not installed · how to get it: <link to the Pulse-caveman README>
```

- There is no start question and there are no buttons in this case.

**Pulse installed but older than 0.3.0:** the standalone rows, with a grey hint
at the end:

```
caveman full [ Off ] · on 12m  · update Pulse to show this in its bar
```

### With Pulse 0.3.0 or later

Pulse-caveman draws nothing of its own. Pulse draws caveman's status as the
last piece of its stats row, with caveman's buttons inside it, right after the
level. (Changed after the first live test: the buttons first sat in Pulse's
button row behind `caveman:`.)

```
Off:
ctx ██░░ 6% 60k/1M · cache 99% · 5h 9% resets 2h48m · 7d 21% resets 4d00h48m · $0.29 · caveman off [ lite ] [ full ] [ ultra ]
[ Summarize ] [ Handoff ]

On:
ctx ██░░ 6% 60k/1M · … · $0.29 · caveman full [ Off ] · on 12m
[ Summarize ] [ Handoff ]

Fading:
ctx ██░░ 6% 60k/1M · … · $0.29 · caveman full [ Reload ] [ Off ] · on 34m · fading
[ Summarize ] [ Handoff ]
```

The session-start question gets its own row under Pulse's separator line,
above the bar, the way Pulse's "not set up" row does. Once it shrinks, the
caveman status moves into the bar as above.

### Colours

Pulse family rules, theme keys only:

| Part | Colour |
| --- | --- |
| `caveman`, `off`, `· on 12m`, `·`, hints, the "not installed" row | the Pulse grey: `inactive` with `dimColor` |
| The level (`full`) | `text` (white, like Pulse's numbers) |
| `fading` | `warning` (yellow) |
| The start question text | `claude` (accent) |
| Level buttons, `Off`, `Not now` | secondary buttons |
| `Reload` | primary button (the action to take) |

No information is carried by colour alone.

## Behaviour

### Levels

- The buttons offer `lite`, `full` and `ultra`.
- A level set another way (for example `/caveman wenyan-full` typed by hand)
  is shown by its name. The buttons stay the same three.

### State changes

| Event | Result |
| --- | --- |
| A level button, `/pulse-caveman <level>`, or `/caveman <level>` typed by the person | on, at that level; the timer starts at 0 |
| `Off`, `/pulse-caveman off`, or the person writing "stop caveman" or "normal mode" | off |
| `/clear`, or a Pulse handoff's `Clear & continue` | off, and the start question shows again |
| Summarize, `/compact`, or auto-compaction | fading (on, kept, marked) |
| Drift detected | fading |
| `Reload` | the same level is sent again; fading is cleared; the timer keeps running |

- Turning on runs the skill's own command, `/caveman <level>` (or
  `/<plugin>:caveman <level>` when a plugin brings the skill), as if the person
  typed it. A typed `/caveman` arrives as `command.run`, not `skill.prompt`
  (checked live), so that is also how a typed level is noticed. The engine
  allows a run only after a command's hook has finished, so it goes through
  `$.clock.after(0, …)`, as Pulse does.
- Turning off sends `stop caveman`.
- Buttons are hidden while Claude is working, like Pulse's.

### Detection

**Is the skill installed?** At session start, Pulse-caveman reads the
session's skill listing (`skills` in the session context). If `caveman` is
listed, it is installed. This covers user, project and plugin skills.

- Fallback, if the listing cannot be read: check that
  `~/.claude/skills/caveman/SKILL.md` exists.

**Which level is on?** Pulse-caveman hooks `skill.prompt` with the matcher
`caveman`. It fires whenever the skill loads, whether from a button, a typed
`/caveman ultra`, or Claude loading the skill itself. It reads the level from
the skill's arguments.

- Fallback, if the arguments do not carry the level: read it from the prompt
  text (`/caveman <level>`, `Use the caveman skill at level <level>.`).

**Drift.** At each turn end with caveman on at `full` or `ultra`,
Pulse-caveman counts filler words in Claude's answer:
- articles: "the", "a", "an";
- fillers: "just", "really", "basically", "actually", "simply".

An answer of 40 words or more with 4% or more of them filler counts as wordy.
Three wordy answers in a row mean fading. The count resets on Reload, on a new
level, and on every answer that is not wordy. `lite` keeps articles and the
`wenyan-*` levels are not English, so drift is not checked for them.

### Settings

None in v1. The level buttons make a remembered level unnecessary, and the
start question has `Not now`.

Kept per session, in `$.state`: level (or off), on-since time, fading, the
wordy-answer count, and whether the start question was answered.

## The Pulse add-on contract

The add-on contract lets Pulse show any family add-on without knowing its
internals, and lets add-ons know whether Pulse can show them.

**Add-on side.** Each add-on publishes one value in `$.state`, under the key
`addon` (so `pulse-caveman.addon`):

```ts
type PulseAddon = {
  contract: 1
  // The stats piece, as coloured parts; null for none.
  stat: { color: string; text: string; dim?: true }[] | null
  // Shown under the label `<label>:` in Pulse's button row.
  label: string
  buttons: { key: string; label: string; command: string; primary?: true }[]
  // Where the buttons go: inside the stat after this many parts, or null
  // for Pulse's button row.
  buttonsAt: number | null
  // A row of its own under Pulse's separator, above the bar; null for none.
  prompt: {
    parts: { color: string; text: string }[]
    buttons: { key: string; label: string; command: string; primary?: true }[]
  } | null
}
```

**Pulse side.** Pulse publishes `pulse.addons = { contract: 1 }`.

- Pulse reads the add-ons it knows by name. `$.state.get` needs the plugin
  name written in the code, so names are listed in Pulse.
- Pulse 0.3.0 knows `pulse-caveman` only. A name that is not installed
  reads as nothing and draws nothing.
- Pulse draws `stat` as the last stats piece, packed like the others.
- Pulse draws the buttons inside the stat at `buttonsAt`, hidden while Claude
  works; with `buttonsAt` null, as `label:` and the buttons after its own
  buttons, with a 3-space gap.
- Pulse draws `prompt` as its own row.
- A button press runs the add-on's command with `$.command.run`. Pulse never
  changes add-on state itself.

**Add-on reads Pulse.**
- `pulse.addons.contract` is 1 or higher: Pulse draws the add-on, so it draws
  nothing itself.
- Pulse's config is present but `pulse.addons` is missing: the add-on draws its
  own rows and adds the update hint.
- Pulse is not running: the add-on draws its own rows, with no hint.

**Versions.**
- A new add-on name needs one Pulse release that adds the name.
- A new field means contract 2. Pulse keeps drawing contract-1 add-ons.

## Pulse 0.3.0 changes

- Publish `pulse.addons = { contract: 1 }`.
- Read `pulse-caveman.addon`.
- Draw the add-on parts:
  - stat piece;
  - the buttons, inside the stat or in the button row;
  - prompt row.
- Button presses run the add-on command.
- Tests for each: an add-on present, absent, and on contract 2 (ignored).
- README: a short "Add-ons" section, a changelog line, version 0.3.0.

## Commands

| Command | Does |
| --- | --- |
| `/pulse-caveman lite` / `full` / `ultra` | Turn caveman on at that level |
| `/pulse-caveman off` | Turn it off |
| `/pulse-caveman reload` | Send the current level again |
| `/pulse-caveman` | Answer with the current status |

Without the skill installed, every command answers:
`The caveman skill is not installed. See <README link>.`

## Repository layout

```
plugins/pulse-caveman/.claude-plugin/plugin.json   name, version 0.1.0, MIT
plugins/pulse-caveman/hooks/hooks.json             { "modules": ["./register.tsx"] }
plugins/pulse-caveman/hooks/register.tsx           every function that takes `$`
plugins/pulse-caveman/hooks/drift.ts               the filler-word count (pure)
plugins/pulse-caveman/hooks/format.ts              row text, elapsed time (pure)
plugins/pulse-caveman/hooks/*.test.ts(x)           tests, with a fake engine
plugins/pulse-caveman/types/index.d.ts             $.state contract, PulseAddon type
plugins/pulse-caveman/README.md                    what it does, install, getting the skill, screenshots
docs/images/pulse-caveman/                         screenshots
.claude-plugin/marketplace.json                    one more entry
README.md                                          one more row
```

The caveman skill's source and license are checked when the README's
"Getting the caveman skill" section is written. The link in the "not
installed" row points to that section.

## Known constraints

- Claude Code loads plugins when a session starts. Installing the skill or
  the plugin mid-session shows up in the next session.
- Typing "stop caveman" is caught only in the person's own prompt, not in
  Claude's answers.
- Drift is a word-count heuristic. It can miss, or flag a long quoted text.
  It only marks fading; it never acts on its own.
- In standalone mode, which of Pulse's or caveman's rows comes first is decided
  by Claude Code's load order. This only matters with Pulse older than 0.3.0.

## Testing

`claude plugin test plugins/pulse-caveman`, UI tests on `terminal` and
`desktop`:

- skill missing: only the "not installed" row; commands answer the hint;
- session start: the question; a level press turns caveman on; `Not now` and
  a first message shrink it;
- on: the row with the level and the timer (mock clock: 0m, 12m, 1h05m); `Off`;
- `/caveman ultra` typed and Claude loading the skill: the row follows;
- `/clear`: off, and the question shows again; compaction: fading; `Reload`;
- drift: three wordy answers make it fading; a non-wordy one resets the count;
  `lite` and `wenyan-*` are not checked;
- Pulse present with contract 1: own rows hidden, `addon` value published;
  Pulse older than 0.3.0 present: own rows plus the hint; no Pulse: own rows, no hint;
- `drift.ts` and `format.ts` as pure unit tests.

In `plugins/pulse`: add-on drawing and button forwarding, as in "Pulse 0.3.0
changes".

Before every commit: `tsc` and `claude plugin validate` for both plugins.

## Release

As `RELEASING.md` says, one pull request and one tag per plugin version:

1. **Pulse 0.3.0**: the add-on contract, Pulse's side ("Pulse 0.3.0 changes").
   Safe on its own: with no add-on installed, the bar does not change. Tag
   `pulse-v0.3.0`.
2. **Pulse-caveman 0.1.0**: the new plugin, its `marketplace.json` entry and
   the root README row. Tag `pulse-caveman-v0.1.0`.

Pulse goes first, so Pulse-caveman is tested against a released Pulse. It also
works without Pulse, so the order only matters for the bar view.

## Out of scope

- Shipping the caveman skill.
- Measuring tokens saved. Could come later as a stat in the contract.
- A setup wizard. There is nothing to set.
- `pulse-agents`. It is a separate spec. Pulse will name it when it ships.
