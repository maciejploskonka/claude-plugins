# Pulse

See how your Claude Code session is doing, and act on it in one click.

```
──────────────────────────────────────────────────────────────────────────────
ctx ██░░░░░░░░ 20% 195k/1M · cache 97% · 5h 20% resets 1h52m · 7d 7% resets 5d03h12m · $5.03
[ Summarize ] [ Handoff ]
❯
```

- **Usage bar** above the prompt: context fill, prompt cache hit rate of the
  last request, rate limits with reset times, session cost. Green, yellow from
  your alarm level, red 15 points above it.
- **Summarize** compacts the conversation (same as `/compact`).
- **Handoff** asks Claude to write a handoff note, then offers
  `Clear & continue`: a fresh conversation that starts by reading the note.

## Install

```
/plugin marketplace add maciejploskonka/claude-plugins
/plugin install pulse@maciejploskonka
```

A setup wizard opens:
choose the parts you want, what the bar shows, and when to warn you. On a
narrow terminal the wizard waits; a row above the prompt offers
`Set up` or `Use defaults`.

## Commands

| Command | Does |
| --- | --- |
| `/pulse-setup` | Change what Pulse shows and how |
| `/pulse-handoff` | Write a handoff note and offer to start fresh |
| `/pulse-reset` | Restore the default settings |

## FAQ

**The `[-]` at the right of the bar?** Claude Code draws it, not Pulse. It
collapses the whole band; Pulse cannot change it.

**Handoff notes in the project?** If you pick `.claude/handoffs` in the
project, add `.claude/handoffs/` to `.gitignore`.

**Update:** `/plugin marketplace update maciejploskonka`. Restart Claude Code if the new version does not show.

## Changelog

- 0.1.0 — first release: usage bar, handoff, setup wizard.
