# Releasing

How a change gets from a branch to the people who installed a plugin.

## Rules

- `main` changes only through a pull request. It cannot be pushed to
  directly, force-pushed or deleted (a ruleset on GitHub enforces this).
- Pull requests are squash-merged: each one becomes one commit on `main`,
  titled with the pull request's title. The branch is deleted after merge.
- A pull request that changes a plugin bumps that plugin's `version` in
  `plugins/<name>/.claude-plugin/plugin.json` and adds a line for it under
  `## Changelog` in `plugins/<name>/README.md`. Without a new version,
  installed copies keep running the old code.
- Versions are `MAJOR.MINOR.PATCH`: the last number for fixes, the middle
  one for new features, the first for changes that break how people use it.

## Steps

1. Work on a branch. Bump the version and write the changelog line there.
2. Open a pull request into `main`, titled `<Plugin> <version>: <summary>`,
   for example `Pulse 0.1.2: setup wizard fixes for short panes`.
3. Squash-merge it.
4. Tag the merge commit and push the tag. Tags are named
   `<plugin>-v<version>`, so plugins in this repo never share a tag:

   ```sh
   git switch main && git pull
   git tag -a pulse-v0.1.2 -m "Pulse 0.1.2"
   git push origin pulse-v0.1.2
   ```

5. Create the GitHub Release from the tag, titled `<Plugin> <version>`,
   with that version's changelog lines as its notes, marked as latest:

   ```sh
   gh release create pulse-v0.1.2 --title "Pulse 0.1.2" --notes-file notes.md --latest
   ```

6. People update with `/plugin marketplace update maciejploskonka`.
