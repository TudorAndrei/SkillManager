# TODO: Electron Shell that Ships and Drives the Skills CLI

## Phase 1: Electron shell with the bundled CLI and console

- [x] Add `electron`, `electron-builder`, `vite`, and `vitest` to the root `package.json`; remove `@native-sdk/cli`.
- [x] Build the main and preload bundles with plain Vite configs, because `electron-vite` 5 accepts Vite 5 to 7 and the renderer is on Vite 8.
- [x] Emit CommonJS for both bundles, because a preload script with `sandbox: true` cannot be an ES module.
- [x] Set `base: "./"` in `frontend/vite.config.ts` so assets resolve over `file://`.
- [x] Add `scripts/dev.mjs` to build the bundles, start the Vite dev server, and then start Electron.
- [x] Change `useNativeBridge` in `frontend/src/App.tsx` to `window.skillmanager.invoke` (moved here from Phase 2, because the console and version footer need it).
- [x] Add `vendor/package.json` and lockfile pinning `skills` to `1.5.23`.
- [x] Add `electron/main/index.ts` and `electron/main/window.ts` with the `app.zon` window values: 1180x760, minimum 980x620, title `SkillManager`.
- [x] Add `electron/preload/index.ts` exposing `window.skillmanager.invoke` and the output stream channel.
- [x] Set `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; deny `setWindowOpenHandler` and external navigation.
- [x] Report renderer load failures and renderer crashes, so startup is observable.
- [x] Add `electron/main/cli/run.ts`: development and packaged path resolution, `ELECTRON_RUN_AS_NODE=1`, `CI=1`, `DO_NOT_TRACK=1`, `DISABLE_TELEMETRY=1`, `GH_TOKEN` passthrough, timeout, streamed stdout and stderr, cancel.
- [x] Add `electron/main/cli/parse.ts` with ANSI removal and spinner collapse.
- [x] Add the console panel to the renderer, showing the argument list before the run and the streamed output.
- [x] Show the bundled CLI version in the footer, from `skills --version`.
- [x] Add a smoke test asserting the bundled CLI reports `1.5.23`.
- [ ] Commit: `feat(shell): ship the skills cli inside an electron shell`

## Phase 2: Read the inventory from the CLI

- [x] Add `electron/main/read/inventory.ts` for `skills ls --json` and `skills ls -g --json`, then merge both lists.
- [x] Add `electron/main/read/locks.ts` for `<project>/skills-lock.json` (version 1, `computedHash`) and `~/.agents/.skill-lock.json` (version 3, `skillFolderHash`), read-only.
- [x] Mark skills with no lock entry as unmanaged and keep them in the list.
- [x] Add `electron/main/read/manifest.ts` for the `name` and `description` front matter fields.
- [x] Add `electron/main/read/projects.ts` for discovery from the launch directory, its ancestors, and sibling directories.
- [x] Add `electron/main/snapshot.ts` producing the `Snapshot` shape declared in `frontend/src/App.tsx`.
- [x] Add read handlers in `ipc.ts`: `skillmanager.snapshot`, `.project`, `.search`, `.scope`, `.agent`, `.select`, `.refresh`.
- [x] Build the agent filter list from the `agents` array returned by `ls --json`.
- [x] Replace the three `activity` entries that still name the Zig engine.
- [x] Add unit tests for the JSON reader, both lock readers, the unmanaged state, project discovery, and snapshot filtering.
- [ ] Commit: `feat(skills): read the inventory from the bundled cli`

## Phase 3: Install, update, and remove through the CLI

- [ ] Add `electron/main/cli/args.ts` builders: `add <source> -y --skill <names> --agent <agents>` with `-g` or `-p`, `remove -y -s <name>`, `update -y [name]`.
- [ ] Run `skills add -l` for repositories with several skills and parse the candidates after ANSI removal.
- [ ] Fail soft on a parse failure: show the raw output and offer manual entry or `--skill '*'`.
- [ ] Confirm every result with an `ls --json` refresh and a lock re-read, never from command text.
- [ ] Wire `skillmanager.install`, `.discover`, `.update`, and `.remove` in `ipc.ts`.
- [ ] Add a confirmation step before removing a skill that has no lock entry.
- [ ] Add unit tests for every argument builder and for the `add -l` reader.
- [ ] Commit: `feat(skills): install, update, and remove through the bundled cli`

## Phase 4: Cover the remaining CLI commands

- [ ] Add the discover view for `find [query] --owner <owner>`, listing `owner/repo@skill` with install counts.
- [ ] Add an install action on each find result that calls `add`.
- [ ] Add "copy prompt" in the detail panel, calling `use <source>@<skill>` and capturing stdout.
- [ ] Add "restore project" for `experimental_install`, scoped to the selected project.
- [ ] Add "sync from node_modules" for `experimental_sync`.
- [ ] Add "new skill" for `init <name>`.
- [ ] Add unit tests for the `find` output reader.
- [ ] Commit: `feat(ui): cover the remaining skills cli commands`

## Phase 5: Remove the Zig and Native SDK layer

- [ ] Delete `src/main.zig`, `src/model.zig`, `src/skill_store.zig`, `src/skill_paths.zig`, `src/skill_manifest.zig`, `src/github_source.zig`, `src/tests.zig`, `app.zon`, and `.native/`.
- [ ] Remove `zig` from `mise.toml`.
- [ ] Update `.gitignore` for the Electron output directories and drop `zig-out/` and `.native/`.
- [ ] Extend the `oxfmt` and `oxlint` globs in `hk.pkl` to cover `electron/**`.
- [ ] Rewrite the Run and Commands sections of `README.md`, and replace "Embedded Skill Engine" with the bundled CLI statement and its version.
- [ ] Commit: `refactor(app): remove the zig native sdk layer`

## Phase 6: Package and release Electron artifacts

- [ ] Add `electron-builder.yml` with `appId: dev.skillmanager.desktop`, macOS `zip` arm64, Linux `tar.gz` x64, and `extraResources` from `vendor/node_modules` to `skills-cli`.
- [ ] Update `.github/workflows/verify.yml`: drop Zig, the Native SDK CLI, and the GTK and WebKitGTK packages; add type check, lint, unit tests, and an unpacked build that runs the bundled CLI once.
- [ ] Update `.github/workflows/release.yml`: keep semantic-release and the two-platform matrix; set the version from the release tag in `package.json`.
- [ ] Keep the asset names `SkillManager-linux-x64.tar.gz` and `SkillManager-macos-arm64.zip`.
- [ ] Run `actionlint`, `zizmor`, and `hk check --all`.
- [ ] Commit: `ci(release): package electron artifacts for linux and macos`

## Verification

- [ ] `hk check --all` passes.
- [ ] Unit tests pass for the argument builders, the ANSI remover, the `ls --json` reader, both lock readers, and the `find` and `add -l` readers.
- [ ] The packaged app runs the bundled CLI and reports `1.5.23` without any Node installation on the machine.
- [ ] Command equality: the argument list shown in the console panel, pasted into a terminal with the same CLI, produces the same result.
- [ ] Manual: install `vercel-labs/agent-skills` into an empty temporary project from the app, then confirm from a terminal that `skills ls` in that directory lists the same skill.
- [ ] Manual: `<project>/skills-lock.json` holds `source`, `sourceType`, `skillPath`, and `computedHash`; `.agents/skills/<name>/SKILL.md` exists; `.claude/skills/<name>` is a symlink to `../../.agents/skills/<name>`.
- [ ] Manual: a global install writes the entry in `~/.agents/.skill-lock.json` and the symlink in `~/.claude/skills/<name>`.
- [ ] Manual: `skills add <repo> -y` from a terminal, then refresh in the app, shows the new skill.
- [ ] Manual: remove from the app clears the lock entry, the store directory, and every agent symlink.
- [ ] Manual: `find`, `use`, `experimental_install`, `experimental_sync`, and `init` each run from the UI and show their output in the console panel.
- [ ] Edge cases: a repository with several `SKILL.md` files opens the picker; an unmanaged skill asks for confirmation before removal; a directory with no lock file falls back to the launch directory; a network failure shows the error strip; a long command can be cancelled and the app stays responsive.
- [ ] Edge case: `~/.agents/skills` holds directories with no lock entry (63 directories against 11 entries on the development machine) and all of them appear in the global list.
- [ ] No regression: window size and minimum size, the Command-K search shortcut, the scope and agent filters, the detail panel, and the install picker behave as before.
- [ ] The renderer has no Node access: `contextIsolation` on, `nodeIntegration` off, and the preload exposes only `invoke` and the output stream.
- [ ] No install, symlink, lock write, or hash code exists in `electron/`; `grep -rn "symlink\|createHash\|writeFile.*lock" electron/` returns nothing.
- [ ] Release artifacts install and start on macOS arm64 and Linux x64.

## Review

- [ ] Code reviewed
- [ ] PLAN.md updated if the approach changed during implementation
- [ ] All phase commits are clean and describe their intent
- [ ] TODO.md items all checked off
