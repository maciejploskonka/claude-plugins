# claude-plugins

Plugins for [Claude Code](https://claude.com/claude-code) by Maciej Ploskonka.

![Pulse: the usage bar above the Claude Code prompt](docs/images/pulse/bar.png)

## Plugins

| Plugin | What it does |
| --- | --- |
| [**Pulse**](plugins/pulse) | A live bar above the prompt: context fill, prompt cache, rate limits with reset times, session cost. One-click `Summarize` and `Handoff`. Set up once with a short wizard. |
| [**Pulse-caveman**](plugins/pulse-caveman) | Turn [caveman](https://github.com/JuliusBrussee/caveman) on with one press; see whether it is on, in which mode, and for how long. Shows inside the Pulse bar with Pulse 0.3.0 or later. |

More Pulse-family plugins will join this list. Each installs on its own, with
`/plugin install <name>@maciejploskonka`.

## Install

In a Claude Code session, run these two lines:

```
/plugin marketplace add maciejploskonka/claude-plugins
/plugin install pulse@maciejploskonka
```

1. The first line adds this repository as a plugin source (a *marketplace*). You
   do this once; every plugin here installs from it.
2. The second line installs Pulse. Pick the scope when asked: `user` for every
   project, `project` for the current repository only.
3. Pulse opens its setup wizard. Answer four short screens, or press `Use
   defaults`. Done.

Tested on Claude Code 2.1.299, in the terminal.

## Update

```
/plugin marketplace update maciejploskonka
```

Restart Claude Code if the new version does not show.

## Remove

```
/plugin uninstall pulse@maciejploskonka
```

## License

[MIT](LICENSE)
