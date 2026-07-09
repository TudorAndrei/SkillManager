# Plan: Embedded Skill Library

## Goal
Replace the current hardcoded Native SDK scaffold with a real in-process skill manager. The app should scan project and global skill directories, parse real `SKILL.md` files, show accurate rows/counts/details, and support install/update/remove without routing skill operations through `npx skills` or another skill CLI subprocess.

## Approach
The current app is a Native SDK shell made of `app.zon`, `src/main.zig`, `src/app.native`, and `src/model.zig`. The main gap is that `src/model.zig` owns `default_skill_rows` sample data and derived UI state, so the app cannot truthfully respond to filters or skill operations.

The implementation should introduce a small embedded domain layer in Zig and keep the UI declarative:

- Add `src/skill_paths.zig` for supported agents and their project/global skill locations. Start with the paths already implied by the UI: Codex project `.agents/skills`, Codex global `~/.codex/skills`, Claude Code `.claude/skills`, Cursor `.agents/skills`, and compatible shared `.agents/skills` paths.
- Add `src/skill_manifest.zig` for reading `SKILL.md`, extracting frontmatter fields such as `name` and `description`, and falling back to directory names/first paragraph when frontmatter is incomplete.
- Add `src/skill_store.zig` for scanning directories, copying/removing skill directories, writing/reading `.skillmanager.json` receipts, and returning bounded arrays/slices that the Native SDK model can render.
- Add `src/github_source.zig` for GitHub source parsing and fetch planning: shorthand such as `owner/repo`, GitHub URLs, optional subpaths, GitHub tree API URLs, and raw file URLs. Network requests should use Native SDK effects where possible instead of spawning `curl` or `npx`.
- Refactor `src/model.zig` so `Model.skill_rows`, counts, active detail fields, filters, and activity rows are derived from real store results rather than constants. `update` should dispatch intent messages and handle result messages; view-only derived state should be centralized so side tabs, search, and agent filters cannot contradict the list/detail pane.
- Update `src/app.native` only to support real states: loading, empty, error, install progress, and disabled buttons while operations are running. Avoid new decorative layout work until the data flow is correct.
- Add `src/tests.zig` for parser/path/filter/store behavior and wire it into `src/main.zig` with a `test` block.

Theme reference:

- A subagent was dispatched to extract the Prime Intellect visual theme from `https://www.primeintellect.ai/`. It reported a near-black technical/research-lab style with square corners, dense modular panels, hairline borders, mono uppercase labels, white primary CTAs, and restrained green/cyan accents.
- The live page also shows a strongly technical product language: numbered sections such as `TRAINING 01`, `INFERENCE 02`, `COMPUTE 03`, and `RESEARCH 04`; CLI snippets such as `$ pip install prime`; dense environment and compute cards; figure labels; research/story feeds; and action labels such as `START TRAINING`, `BOOK A CALL`, and `FIND COMPUTE`.
- Translate that into SkillManager as a deep dark futuristic control surface: near-black background, graphite panels, `1px` hairline borders, square corners, white primary install/sync actions, green status dots for valid/installed states, small uppercase metadata labels, monospaced path/source fields, numbered section labels for sidebar groups, and dense registry/inspection panels instead of large airy cards.
- Approximate token direction for Phase 5: background `#0E0E0E`, surface `#161616`, subtle surface `#191919`, selected row `#1A1A1A`, border `#202020`/`#2A2A2A`, text `#FFFFFF`, secondary text `#B3B3B3`, muted text `#737373`, disabled/ghost text `#595959`, primary CTA background `#FFFFFF`, primary CTA text `#000000`, success/accent green `#85ED75`, atmospheric cyan/green `#2DDC9A`/`#0E8F74`/`#7FB6C7`, destructive red `#D64B3F`.

Key decisions:

- Keep the skill engine embedded in Zig. No `npx skills`, no `git` subprocess, and no shelling out for scan/install/update/remove.
- Copy installed skills into destination folders rather than symlinking in the first implementation. Copying is simpler, predictable for sandboxing, and avoids broken links when source folders move.
- Treat `.skillmanager.json` receipts as SkillManager-owned metadata. Existing skills without receipts are still scannable and removable, but update-from-source is only enabled when a receipt exists.
- Implement local scanning and local install before GitHub install. This gives the UI real data quickly and reduces the first integration risk.

Out of scope for this plan:

- Publishing or packaging a signed macOS app.
- Multi-platform behavior beyond macOS paths.
- Full compatibility with every `vercel-labs/skills` CLI option.
- Marketplace browsing/search beyond installing a known GitHub/local source.

## Implementation Phases

### Phase 1: Stabilize Native UI State
- Remove hardcoded `default_skill_rows` as the source of truth in `src/model.zig`; keep only temporary seed data in tests if needed.
- Make `src/app.native` render only rows with `visible = true` or switch to a filtered iterable model field so side filters actually change content.
- Ensure scope, agent, and search filters update counts, active selection, detail pane, empty state, and status line together.
- Keep `native check`, `native test`, and `native dev` passing.
**Commit:** `fix(ui): make filters and selection reflect model state`

### Phase 2: Parse and Scan Installed Skills
- Add `src/skill_paths.zig` with agent/scope path definitions and path expansion for project root and home directory.
- Add `src/skill_manifest.zig` to parse `SKILL.md` frontmatter and summary text.
- Add `src/skill_store.zig` scanning functions for known project/global directories and conversion into UI row data.
- Replace sample rows in `src/model.zig` with scan results on boot and Refresh.
- Add tests in `src/tests.zig` for path resolution, frontmatter parsing, fallback names/descriptions, and filtering.
**Commit:** `feat(skills): scan installed project and global skills`

### Phase 3: Local Install and Remove
- Extend `src/skill_store.zig` to install from local filesystem paths by copying directories containing `SKILL.md` into the selected agent/scope destination.
- Write `.skillmanager.json` receipts with source path, skill name, agent, scope, and installed timestamp.
- Implement remove for selected skills by deleting the owning skill directory after validating it is inside a known skill root.
- Wire `install_project`, `install_global`, and `remove_active` in `src/model.zig` to real operations and activity rows.
- Add tests covering local install, overwrite behavior, receipt writing, remove safety checks, and rescan after mutation.
**Commit:** `feat(skills): install and remove local skills`

### Phase 4: GitHub Source Install and Receipt-Based Update
- Add `src/github_source.zig` to parse `owner/repo`, GitHub URLs, optional subpaths, and selected skill names/paths.
- Use Native SDK network effects or a direct embedded HTTP path to fetch GitHub tree metadata and raw skill files without spawning external tools.
- Install one selected skill or all discovered skills from the GitHub source into the chosen agent/scope.
- Implement update for skills with `.skillmanager.json` receipts by refetching/copying the recorded source.
- Add tests for GitHub URL parsing and fetch-planning logic; use fixture JSON/raw files for deterministic install/update tests.
**Commit:** `feat(skills): install and update skills from github sources`

### Phase 5: Real App Polish and Documentation
- Apply the Prime Intellect-inspired visual direction gathered from the live site and design subagent task: deep dark futuristic shell, high-contrast technical typography, subdued grid/terminal surfaces, green/teal accent actions, and dense card/list treatments.
- Update `src/main.zig` design tokens from the current light palette to the dark theme.
- Update `src/app.native` layout styling so sidebars, skill rows, detail panels, badges, and activity cards share one coherent dark system.
- Add technical UI details that map the reference to SkillManager: uppercase mono section captions, `01/02/03` style counters for scope groups where useful, monospaced path/source fields, thin separators, compact pill metadata, square-corner buttons, and a terminal-like install source block.
- Prefer border/opacity/contrast for depth; avoid soft floating-card shadows and avoid rounded-card SaaS styling.
- Keep the three-pane management UI readable at the declared minimum window size.
**Commit:** `feat(ui): apply prime intellect inspired dark theme`

### Phase 6: Real App Polish and Documentation
- Update `src/app.native` for real loading/error/empty states and disable destructive controls while operations are in progress.
- Add a project-root control or documented initial project root behavior so project scope is clear.
- Update `README.md` with the real feature set, supported agents/paths, limitations, and run/test commands.
- Run `native check`, `native test`, and a manual `native dev` smoke test across scanning, filtering, local install, GitHub install, update, and remove.
**Commit:** `docs(app): document embedded skill management workflow`

## Risks & Tradeoffs
- Native SDK model updates are strict about markup bindings and effect payloads. Mitigation: keep store modules testable and keep UI state fields explicit, then run `native test` after each phase to refresh the model contract.
- GitHub API integration can fail due to rate limits, branch defaults, private repos, or network errors. Mitigation: start with public repositories, clear error messages, and fixture-based tests; defer authentication.
- Direct filesystem mutation is risky if path validation is weak. Mitigation: only remove directories under known skill roots, never delete arbitrary user-supplied paths, and test path containment.
- Copying rather than symlinking may duplicate files and lose live linkage to local sources. Mitigation: record source receipts and support update; consider symlink mode later.
- Prime Intellect styling is a reference, not a clone. Mitigation: extract reusable visual principles and tokens while keeping SkillManager’s interface native, dense, and task-focused.
- The current repository has no root commit, so phase commits cannot be cleanly reconstructed after the full implementation is present without fabricating history or creating knowingly broken intermediate commits. Mitigation: create one buildable root commit for the implemented app and keep the phase checklist as implementation evidence.

## Open Questions
- Should project scope default to the app launch directory, a user-selected project root, or a persisted project root?
- Should GitHub installs support private repositories/authentication in the first version, or only public sources?
- Which agents are required for v1 beyond Codex, Claude Code, and Cursor?
- Should update be disabled for pre-existing skills without `.skillmanager.json`, or should the app try to infer their source?
