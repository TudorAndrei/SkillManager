# Plan: Electron Shell that Ships and Drives the Skills CLI

## Goal

SkillManager must behave exactly like the `skills` CLI (`vercel-labs/skills`). Today it does not.
The embedded Zig engine copies skill folders into each agent directory and writes its own
`.skillmanager.json` receipt. The CLI keeps one copy in `.agents/skills/<name>/`, links every agent
directory to it with a relative symlink, and records the install in a lock file. Skills that
SkillManager installs stay invisible to `skills list` and `skills update`, and skills that the CLI
installed can break when SkillManager removes them.

This plan replaces the Zig and Native SDK shell with an Electron application that **ships the real
CLI inside the package** and drives it for every operation. The UI becomes a faithful front end for
the CLI. This replaces the completed cross-platform build workflow plan.

## Approach

### One rule

**The CLI is the engine. The application never writes skill state itself.**

No install code, no symlink code, no lock writing, no hash computation lives in this repository.
Every state change is a `skills` invocation. Behaviour is therefore identical by definition, not by
imitation, and it stays identical when the CLI changes.

The application reads state in only two ways, both read-only:

- `skills ls --json`, the one machine-readable command;
- the lock files and `SKILL.md` front matter, for metadata that `ls --json` does not return
  (description, source, hash, timestamps).

### Shipping the CLI

`skills@1.5.23` is installed into `vendor/` with its own lockfile and copied into the package by
electron-builder `extraResources`. It is pure JavaScript with two dependencies, `tar` and `yaml`, so
no native rebuild is needed.

It runs on Electron's own Node runtime:

```text
execFile(process.execPath, [cliPath, ...args], {
  env: { ...env, ELECTRON_RUN_AS_NODE: '1', CI: '1', DO_NOT_TRACK: '1' },
})
```

Electron 43.4.1 supplies Node 24.18.1 and the CLI requires Node 22.20.0 or later, so the bundled
runtime is sufficient. The user needs no Node installation, no npx, and no separate `skills`
install. The packaged version is pinned, so the app and the CLI never disagree about behaviour.

### The UI follows the CLI

Every CLI command gets a UI surface, and every UI action is one command:

| CLI command | UI surface | How the result is read |
| --- | --- | --- |
| `add` | install panel, plus the picker for repositories with several skills | `ls --json` refresh |
| `remove` | detail panel button | `ls --json` refresh |
| `update` | detail panel button, and update all | `ls --json` refresh |
| `list --json` | the inventory list | direct JSON |
| `find` | discover view with a query field and an `--owner` filter | text output, ANSI removed |
| `use` | copy the skill prompt from the detail panel | stdout captured |
| `experimental_install` | restore a project from its lock file | `ls --json` refresh |
| `experimental_sync` | sync from `node_modules` | `ls --json` refresh |
| `init` | create a new skill | file created on disk |

Three rules keep the UI honest:

1. **Prompts become dialogs, then flags.** Where the CLI would ask which agents or which skills to
   use, the UI asks the same question and passes the answer as `--agent`, `--skill`, `-g` or `-p`,
   with `-y` so the child process never waits on input.
2. **The command is visible.** Each action shows the exact argument list before it runs, and a
   console panel streams the CLI's real stdout and stderr. The same line pasted into a terminal
   gives the same result.
3. **Text is never state.** Output from `find` and `add -l` is parsed only to offer choices. What is
   installed always comes from `ls --json` and the lock files.

The footer stops claiming an embedded Zig engine and shows the bundled CLI version instead.

### Child process rules

- Always an argument array, never a shell string.
- Always `-y`, plus `CI=1` in the environment, so no command waits for input.
- `DO_NOT_TRACK=1` and `DISABLE_TELEMETRY=1` by default; the CLI reads both.
- `GH_TOKEN` and `GITHUB_TOKEN` pass through when present, for private repositories and rate limits.
- A timeout kills the child, and the user can cancel a running command.
- ANSI escapes are removed before output reaches an error message; the console panel keeps the raw
  text.

### Process architecture

- **Renderer** — the current React UI, extended with the console panel and the new command views. It
  keeps the `Snapshot` shape declared in `App.tsx`.
- **Preload** — `contextBridge` exposes `window.skillmanager.invoke(command, payload)` and a stream
  channel for console output. Context isolation stays on, node integration stays off.
- **Main** — the command runner, the read-only inventory reader, and project discovery.

### File layout

```text
electron/
  main/
    index.ts          # app lifecycle, single instance, window
    window.ts         # window options carried over from app.zon
    ipc.ts            # command handlers and the output stream
    snapshot.ts       # builds the Snapshot object the renderer expects
    cli/
      run.ts          # locate and start the bundled CLI, stream output, cancel
      args.ts         # one builder per command, with the flag rules
      parse.ts        # ANSI removal, find and add -l readers
    read/
      inventory.ts    # skills ls --json for both scopes
      locks.ts        # skills-lock.json v1 and .skill-lock.json v3, read-only
      manifest.ts     # SKILL.md front matter for descriptions
      projects.ts     # project discovery
  preload/
    index.ts
frontend/             # renderer, plus the console panel and command views
vendor/               # pinned skills CLI install with its own lockfile
vite.main.config.ts
vite.preload.config.ts
scripts/dev.mjs
electron-builder.yml
```

### Out of scope

- Any re-implementation of install, symlink, lock, or hash behaviour.
- Windows support. Targets stay macOS arm64 and Linux x64.
- macOS signing and notarization. Releases stay unsigned, as today.
- Auto-update, and updating the bundled CLI at runtime. The CLI version is pinned per release.

## Implementation Phases

### Phase 1: Electron shell with the bundled CLI and console

- Add `electron`, `electron-builder`, `vite`, and `vitest` to the root `package.json`, and remove
  `@native-sdk/cli`. `electron-vite` 5 accepts Vite 5 to 7 only, while the renderer is on Vite 8, so
  the main and preload bundles are built with plain Vite configs, and `scripts/dev.mjs` starts the
  dev server and Electron together.
- Add `vendor/package.json` and lockfile pinning `skills` to `1.5.23`; install with
  `npm ci --prefix vendor --omit=dev`.
- Add `electron/main/index.ts`, `electron/main/window.ts`, and `electron/preload/index.ts` with the
  `app.zon` window values: 1180x760, minimum 980x620, title `SkillManager`; keep
  `contextIsolation: true`, `nodeIntegration: false`, and denial of external navigation.
- Add `electron/main/cli/run.ts`: path resolution for development and packaged runs, the
  environment and timeout rules, streamed stdout and stderr, and cancel.
- Add `electron/main/cli/parse.ts` with ANSI removal.
- Add `vite.main.config.ts` and `vite.preload.config.ts`, both emitting CommonJS, because a preload
  script with `sandbox: true` cannot be an ES module.
- Set `base: "./"` in `frontend/vite.config.ts`. The renderer now loads over `file://`, where the
  absolute asset paths of the previous build resolve against the filesystem root and leave a blank
  window.
- Move the renderer bridge rename here from Phase 2, because the console panel and the version
  footer both need it.
- Add the console panel to the renderer, showing the argument list and the streamed output.
- Show the bundled CLI version in the footer, read from `skills --version`.
- Add a smoke test asserting that the bundled CLI reports `1.5.23`.
  **Commit:** `feat(shell): ship the skills cli inside an electron shell`

### Phase 2: Read the inventory from the CLI

- Add `electron/main/read/inventory.ts` for `skills ls --json` in the selected project and
  `skills ls -g --json` for global scope, then merge.
- Add `electron/main/read/locks.ts` for `<project>/skills-lock.json` (version 1, `computedHash`) and
  `~/.agents/.skill-lock.json` (version 3, `skillFolderHash`); treat both as read-only and mark
  skills with no entry as unmanaged instead of hiding them.
- Add `electron/main/read/manifest.ts` for the `name` and `description` front matter fields, which
  `ls --json` does not return.
- Add `electron/main/read/projects.ts` for project discovery from the launch directory, its
  ancestors, and sibling directories.
- Add `electron/main/snapshot.ts` and the read handlers in `ipc.ts`: `skillmanager.snapshot`,
  `.project`, `.search`, `.scope`, `.agent`, `.select`, `.refresh`.
- Build the agent filter list from the `agents` array that `ls --json` returns.
- Replace the three `activity` entries that still name the Zig engine. The bridge itself moved to
  Phase 1.
- Add unit tests for the JSON reader, the lock readers, and the unmanaged state.
  **Commit:** `feat(skills): read the inventory from the bundled cli`

### Phase 3: Install, update, and remove through the CLI

- Add `electron/main/cli/args.ts` with one builder per command: `add <source> -y --skill <names>
  --agent <agents>` plus `-g` or `-p`, `remove -y -s <name>`, `update -y [name]`, each with the
  scope flag.
- Run `skills add -l` for repositories with more than one skill, parse the candidate list after ANSI
  removal, and keep the existing picker dialog. If parsing fails, show the raw output and let the
  user pass `--skill '*'`.
- Confirm every result with an `ls --json` refresh and a lock re-read, never by reading command
  text.
- Wire `skillmanager.install`, `.discover`, `.update`, and `.remove`.
- Ask for confirmation before removing a skill with no lock entry, because the old
  `isKnownSkillPath` guard in `src/skill_store.zig` no longer applies.
- Add unit tests for every argument builder and for the `add -l` reader.
  **Commit:** `feat(skills): install, update, and remove through the bundled cli`

### Phase 4: Cover the remaining CLI commands

- Add a discover view for `find [query] --owner <owner>`, listing `owner/repo@skill` entries with
  their install counts, each with an install action that calls `add`.
- Add "copy prompt" to the detail panel, calling `use <source>@<skill>` and capturing stdout.
- Add "restore project" for `experimental_install` and "sync from node_modules" for
  `experimental_sync`, both scoped to the selected project.
- Add "new skill" for `init <name>`.
- Add unit tests for the `find` output reader.
  **Commit:** `feat(ui): cover the remaining skills cli commands`

### Phase 5: Remove the Zig and Native SDK layer

- Delete `src/main.zig`, `src/model.zig`, `src/skill_store.zig`, `src/skill_paths.zig`,
  `src/skill_manifest.zig`, `src/github_source.zig`, `src/tests.zig`, `app.zon`, and `.native/`.
- Remove `zig` from `mise.toml` and update `.gitignore` for the Electron output directories.
- Extend the `oxfmt` and `oxlint` globs in `hk.pkl` to cover `electron/**`.
- Rewrite `README.md`: the Run and Commands sections, and replace "Embedded Skill Engine" with a
  statement that the app ships and drives the pinned `skills` CLI, including the version.
  **Commit:** `refactor(app): remove the zig native sdk layer`

### Phase 6: Package and release Electron artifacts

- Add `electron-builder.yml` with `appId: dev.skillmanager.desktop`, macOS `zip` arm64, Linux
  `tar.gz` x64, and `extraResources` copying `vendor/node_modules` to `skills-cli`.
- Update `.github/workflows/verify.yml`: remove Zig, the Native SDK CLI, and the GTK and WebKitGTK
  packages; add type check, lint, unit tests, and an unpacked build that runs the bundled CLI once.
- Update `.github/workflows/release.yml`: keep semantic-release, the two-platform matrix, and the
  asset names `SkillManager-linux-x64.tar.gz` and `SkillManager-macos-arm64.zip`; set the version
  from the release tag in `package.json`.
- Verify with `actionlint`, `zizmor`, and `hk check --all`.
  **Commit:** `ci(release): package electron artifacts for linux and macos`

## Risks & Tradeoffs

- **Only `list` is machine-readable.** Mitigation: state always comes from `ls --json` and the lock
  files; command text is used only to offer choices, and the raw output stays visible in the console
  panel.
- **`find` and `add -l` output can change format.** Mitigation: the parsers fail soft. A parse
  failure shows the raw output and a manual entry field instead of an error.
- **Interactive prompts can block a child process.** Mitigation: `-y` on every call, explicit
  `--skill` and `--agent`, `CI=1`, a timeout, and a cancel action.
- **Process start cost.** Each action starts a Node process, about 100 to 300 ms. Acceptable,
  because installs are network-bound and the inventory refresh is one call.
- **Pinned CLI version.** Users do not get CLI fixes until the app releases. Mitigation: the version
  is visible in the footer, and a CLI bump is a normal dependency commit.
- **Destructive removes.** The app can now remove what the CLI installed, which is the point.
  Mitigation: confirm before removing a skill with no lock entry.
- **Package size.** About 150 MB against 2 MB today, which is the cost of the bundled runtime.
- **Unsigned macOS artifacts.** Gatekeeper warnings continue, as today.

## Open Questions

- Should the console panel be always visible, or open on demand from a status line?
- Should `find` results use the CLI, or the `skills.sh` API that the CLI itself uses through
  `SKILLS_API_URL`? The plan uses the CLI, to keep one behaviour source.
- Should the app expose `--copy` (copy instead of symlink) as an install option? The plan uses the
  CLI default, which is symlink.
- Should a CLI version bump be a release-blocking test, so that a new CLI cannot ship without the
  parsers being checked?
