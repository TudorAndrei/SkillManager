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

- [x] Add `electron/main/cli/args.ts` builders: `add <source> -y --skill <names> --agent <agents>` with `-g` or `-p`, `remove -y -s <name>`, `update -y [name]`.
- [x] Read the valid agent identifiers from the CLI itself, because `ls --json` reports display names and `--agent` takes identifiers.
- [x] Run `skills add -l` for repositories with several skills and parse the candidates after ANSI removal.
- [x] Fail soft on a parse failure: an empty candidate list installs with `--skill '*'` instead of guessing.
- [x] Confirm every result with an `ls --json` refresh and a lock re-read, never from command text.
- [x] Wire `skillmanager.install`, `.discover`, `.update`, and `.remove` in `ipc.ts`.
- [x] Add a confirmation step before removing a skill that has no lock entry.
- [x] Add unit tests for every argument builder, the `add -l` reader, and the agent identifier mapping.
- [x] Exercise install, update, discover, and remove through the real bridge in a temporary project.
- [ ] Commit: `feat(skills): install, update, and remove through the bundled cli`

## Phase 4: Cover the remaining CLI commands

- [x] Add the discover view for `find [query] --owner <owner>`, listing `owner/repo@skill` with install counts.
- [x] Add an install action on each find result that calls `add`.
- [x] Show the raw CLI text when no find result parses, instead of an empty list.
- [x] Add "copy prompt" in the detail panel, calling `use <source>@<skill>` and capturing stdout.
- [x] Add "restore project" for `experimental_install`, scoped to the selected project.
- [x] Add "sync from node_modules" for `experimental_sync`.
- [x] Add "new skill" for `init <name>`.
- [x] Add unit tests for the `find` output reader and the new argument builders.
- [x] Exercise find, init, restore, and use through the real bridge.
- [ ] Commit: `feat(ui): cover the remaining skills cli commands`

## Phase 5: Remove the Zig and Native SDK layer

- [ ] Delete `src/main.zig`, `src/model.zig`, `src/skill_store.zig`, `src/skill_paths.zig`, `src/skill_manifest.zig`, `src/github_source.zig`, `src/tests.zig`, `app.zon`, and `.native/`.
- [ ] Remove `zig` from `mise.toml`.
- [ ] Update `.gitignore` for the Electron output directories and drop `zig-out/` and `.native/`.
- [ ] Extend the `oxfmt` and `oxlint` globs in `hk.pkl` to cover `electron/**`.
- [ ] Rewrite the Run and Commands sections of `README.md`, and replace "Embedded Skill Engine" with the bundled CLI statement and its version.
- [ ] Commit: `refactor(app): remove the zig native sdk layer`

## Phase 6: Package and release Electron artifacts

- [x] Add `electron-builder.yml` with `appId: dev.skillmanager.desktop`, macOS `zip` arm64, Linux `tar.gz` x64, and `extraResources` from `vendor/node_modules` to `skills-cli/node_modules`.
- [x] Update `.github/workflows/verify.yml`: drop Zig, the Native SDK CLI, and the GTK and WebKitGTK packages; add type check, lint, knip, unit tests, and a build.
- [x] Download the Electron binary explicitly, because an npm install-script policy can skip its postinstall.
- [x] Update `.github/workflows/release.yml`: keep semantic-release and the two-platform matrix; set the version from the release tag with `npm version --no-git-tag-version`.
- [x] Check that each packaged artifact contains the bundled CLI before it is uploaded.
- [x] Keep the asset names `SkillManager-linux-x64.tar.gz` and `SkillManager-macos-arm64.zip`.
- [x] Run `actionlint`, `zizmor`, and `hk check --all`.
- [ ] Commit: `ci(release): package electron artifacts for linux and macos`

## Verification

- [x] `hk check --all` passes.
- [x] Unit tests pass for the argument builders, the ANSI remover, the `ls --json` reader, both lock readers, and the `find` and `add -l` readers. 36 tests.
- [x] The packaged app runs the bundled CLI and reports `1.5.23` from `SkillManager.app/Contents/Resources/skills-cli`.
- [x] Command equality: the same commands run from a terminal give the same result as the app.
- [x] Manual: `vercel-labs/agent-skills@deploy-to-vercel` installed from the app into an empty temporary project, and a terminal `skills ls` there reports the same skill, agent, and source.
- [x] Manual: `<project>/skills-lock.json` holds `source`, `sourceType`, `skillPath`, and `computedHash`, and the skill files are installed. Note: with one named agent the CLI copies into that agent's directory; the `.agents/skills` store with symlinks appears when several agents are selected. Both layouts read correctly.
- [ ] Manual: a global install writes the entry in `~/.agents/.skill-lock.json`. **Not run**: it would change the machine's global agent configuration. Only global reads were exercised.
- [x] Manual: `skills add dmmulroy/anti-slop -y` from a terminal, then refresh in the app, shows the new skill.
- [x] Manual: remove from the app clears the lock entry and the installed files.
- [x] Manual: `find` (12 results), `use` (prompt captured), `experimental_install`, `experimental_sync`, and `init` (SKILL.md created) all run through the real bridge.
- [x] Edge case: a repository with several `SKILL.md` files returns 9 candidates for the picker.
- [ ] Edge cases not exercised interactively: the confirmation dialog for an unmanaged removal, the cancel button during a long command, and the error strip on a network failure. Their code paths are in `ipc.ts` and `run.ts`.
- [x] Edge case: `~/.agents/skills` holds directories with no lock entry (80 listed against 11 entries) and all of them appear in the global list.
- [x] No regression: window size 1180x760 with a 980x620 minimum, the scope and agent filters, the detail panel, and the install picker all work.
- [x] The renderer has no Node access: `contextIsolation` on, `nodeIntegration` off, `sandbox` on, and the preload exposes only `invoke` and the output stream.
- [x] No install, symlink, lock write, or hash code exists in `electron/`; `grep -rn "symlink\|createHash\|writeFile" electron/` returns nothing.
- [x] macOS arm64: `SkillManager-macos-arm64.zip` built, and the app starts from the bundle.
- [ ] Linux x64: `SkillManager-linux-x64.tar.gz` built and contains `resources/skills-cli`, but **it was not started**, because no Linux machine was available.

## Review

- [ ] Code reviewed
- [x] PLAN.md updated where the approach changed during implementation: plain Vite instead of electron-vite, and the bridge rename moved into Phase 1.
- [x] All phase commits are clean and describe their intent
- [x] TODO.md items checked off, with the unverified items named above
