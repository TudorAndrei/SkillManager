# SkillManager

A desktop front end for the [`skills` CLI](https://github.com/vercel-labs/skills), for managing
agent skills across project and global installs.

**The CLI is the engine.** This repository contains no install, symlink, lock-file, or hash code.
The app ships a pinned copy of the CLI and runs it for every change, so its behaviour is the CLI's
behaviour. The UI shows the exact command before it runs and streams the real output.

- `vendor/` pins `skills@1.5.23`, which is packaged with the app and started on Electron's own Node
  runtime. The user needs no Node installation.
- `electron/main` runs the CLI, reads the inventory, and owns the window.
- `electron/preload` exposes one request function and one output stream. Nothing else.
- `frontend/src` contains the React UI and its shadcn-style components.

## Install

macOS on Apple Silicon, with Homebrew. This repository is its own tap:

```sh
brew tap tudorandrei/skillmanager https://github.com/TudorAndrei/SkillManager
brew install --cask --no-quarantine skillmanager
```

The app is not signed or notarized by Apple, so macOS quarantines it.
`--no-quarantine` avoids that. Without the flag, open the installed app once from
the Finder context menu and confirm.

The cask carries the app with its own copy of the skills CLI and the Node runtime it needs, so
nothing else has to be installed. `Casks/skillmanager.rb` is updated by the release workflow, so
`brew upgrade --cask skillmanager` follows each release.

Linux users take `SkillManager-linux-x64.tar.gz` from the
[releases page](https://github.com/TudorAndrei/SkillManager/releases). Homebrew has no cask support
on Linux.

## Run from source

```sh
npm install                        # tooling
npm ci --prefix vendor             # the pinned skills CLI
bun install --cwd frontend         # renderer dependencies
npm run dev                        # dev server plus Electron
```

`npm run build` produces the main, preload, and renderer bundles. `npm start` builds and starts the
app from those bundles.

## What each action runs

| UI | Command |
| --- | --- |
| Inventory list and refresh | `skills ls --json`, `skills ls -g --json` |
| Install | `skills add <source> -y --skill <name> --agent <agent>` |
| Update | `skills update <name> -y` |
| Remove | `skills remove -y -s <name>` |
| Skill picker | `skills add <source> -l` |
| Find | `skills find <query> --owner <owner>` |
| Copy prompt | `skills use <source>@<name>` |
| Restore from lock | `skills experimental_install` |
| Sync node_modules | `skills experimental_sync -y` |
| New skill | `skills init <name>` |

Every command carries `-y`, and `CI=1` is set, so no child process waits for input. Telemetry is
disabled with `DO_NOT_TRACK=1` and `DISABLE_TELEMETRY=1`.

`ls --json` is the only machine-readable command. Output from `find` and `add -l` is read only to
offer choices, and it fails soft: when the format changes, the app shows the CLI's own text. What
is installed always comes from `ls --json` and the lock files.

## What the app reads directly

Read-only, for metadata that `ls --json` does not return:

- `<project>/skills-lock.json`, version 1, hash field `computedHash`;
- `~/.agents/.skill-lock.json`, version 3, hash field `skillFolderHash`, plus timestamps;
- the `name` and `description` front matter of each installed `SKILL.md`.

A skill with no lock entry stays in the list and is marked unmanaged, because the agents still load
it. Removing one asks for confirmation first.

Projects are discovered from `skills-lock.json` (and the legacy `skills.lock`) in the launch
directory, its ancestors, and the directories beside it. Without a lock file, the launch directory
is used. Global scope resolves from `HOME`.

## Code Quality

```sh
npm run lint       # oxlint with the anti-slop rules
npm run knip       # unused files, exports, and dependencies
npm run typecheck  # main and preload types
npm test           # unit tests
```

`tools/oxlint/anti-slop/` holds the Oxlint plugin from
[dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), installed by its own
`install-anti-slop` skill and configured in `.oxlintrc.json`. All 15 generic rules run at
`error`. `electron/main/read/json.ts` is the single JSON parse boundary, and it is the only
file that inspects unparsed values.

[knip](https://github.com/webpro-nl/knip) checks the root and `frontend` workspaces for unused
files, exports, and dependencies.

## Git Hooks

Install the mise-managed tools and hk hooks with:

```sh
mise install
mise exec -- hk check --all
```

The hooks run repository hygiene checks plus gitleaks, oxlint, and oxfmt. Commit messages
are checked against the conventional commit format.

## Upgrading the bundled CLI

1. Change the version in `vendor/package.json` and run `npm install --prefix vendor`.
2. Change `VENDORED_CLI_VERSION` in `electron/main/cli/paths.ts`.
3. Run `npm test`. The smoke test checks the version, and the reader tests cover both lock schemas.
4. Check the two fail-soft readers in `electron/main/cli/parse.ts` against the new output.
