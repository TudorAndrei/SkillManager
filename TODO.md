# TODO: Embedded Skill Library

## Phase 1: Stabilize Native UI State
- [x] Remove hardcoded `default_skill_rows` as the source of truth in `src/model.zig`.
- [x] Make `src/app.native` render filtered rows only, not hidden/non-matching sample rows.
- [x] Keep scope, agent, search, counts, selected row, detail pane, empty state, and status line consistent after every click.
- [x] Verify `native check`, `native test`, and `native dev` pass.
- [x] Commit included in consolidated root commit because the repository had no prior baseline.

## Phase 2: Parse and Scan Installed Skills
- [x] Add `src/skill_paths.zig` for supported agent/scope path definitions.
- [x] Add `src/skill_manifest.zig` for `SKILL.md` frontmatter and summary parsing.
- [x] Add `src/skill_store.zig` scanning functions for project/global skill roots.
- [x] Replace sample rows in `src/model.zig` with scan results on boot and Refresh.
- [x] Add `src/tests.zig` coverage for path resolution, manifest parsing, fallback metadata, and filtering.
- [x] Commit included in consolidated root commit because the repository had no prior baseline.

## Phase 3: Local Install and Remove
- [x] Implement local skill install by copying directories containing `SKILL.md` into the selected agent/scope destination.
- [x] Write `.skillmanager.json` receipts for SkillManager-installed skills.
- [x] Implement selected-skill removal with known-root containment checks.
- [x] Wire `install_project`, `install_global`, and `remove_active` in `src/model.zig` to real operations.
- [x] Add tests for local install, overwrite behavior, receipt writing, safe removal, and rescan after mutation.
- [x] Commit included in consolidated root commit because the repository had no prior baseline.

## Phase 4: GitHub Source Install and Receipt-Based Update
- [x] Add `src/github_source.zig` for GitHub shorthand/URL/subpath parsing.
- [x] Fetch GitHub tree metadata and raw files without spawning `git`, `curl`, or `npx`.
- [x] Install selected or discovered GitHub skills into the chosen agent/scope destination.
- [x] Implement update using `.skillmanager.json` receipt source metadata.
- [x] Add fixture-based tests for GitHub parsing, fetch planning, install, and update behavior.
- [x] Commit included in consolidated root commit because the repository had no prior baseline.

## Phase 5: Prime Intellect-Inspired Dark Theme
- [x] Convert the subagent's Prime Intellect theme extraction into concrete `src/main.zig` design tokens: `#0E0E0E`, `#161616`, `#191919`, `#202020`, `#2A2A2A`, `#FFFFFF`, `#B3B3B3`, `#737373`, `#85ED75`, `#2DDC9A`, and `#D64B3F`.
- [x] Replace the current light tokens in `skillManagerTokens` with a deep dark futuristic palette and near-zero radius.
- [x] Update `src/app.native` surfaces for dark sidebar, dense registry list rows, inspection-console detail panels, square badges, activity cards, and install controls.
- [x] Use uppercase mono labels for section headers, badges, button text where supported, path/source fields, and status metadata.
- [x] Style primary actions as white blocks with black text where Native SDK tokens allow; keep secondary actions dark with hairline borders.
- [x] Verify the three-pane layout remains readable at `window_min_width` and `window_min_height` from `src/main.zig`.
- [x] Run `native check`, `native test`, and `native dev` after theme changes.
- [x] Commit included in consolidated root commit because the repository had no prior baseline.

## Phase 6: Real App Polish and Documentation
- [x] Add real loading, empty, and error states to `src/app.native`.
- [x] Disable update/remove/install controls while an operation is in progress.
- [x] Add or document project-root selection/default behavior.
- [x] Update `README.md` with supported paths, limitations, run commands, and test commands.
- [x] Run a manual `native dev` smoke test for startup/rendering; mutation paths are covered by `native test`.
- [x] Commit included in consolidated root commit because the repository had no prior baseline.

## Verification
- [x] `native check` passes with no stale model contract warnings.
- [x] `native test` passes and includes `src/tests.zig`.
- [x] `native dev` launches without layout overflow diagnostics.
- [x] Manual smoke test: app starts and renders scanned skill state; filter/rescan behavior is covered by model/store tests.
- [x] Manual smoke test: local install copies a fixture skill into project scope and the new skill appears after rescan.
- [x] Manual smoke test: remove deletes only the selected known-root skill directory and updates the list/detail pane.
- [x] Manual smoke test: GitHub install path uses Zig HTTP/raw fetch code and does not run `npx skills`, `git`, or `curl`.
- [x] Manual visual check: SkillManager uses a coherent deep dark futuristic Prime Intellect-inspired style without startup layout diagnostics.
- [x] Edge cases tested: missing `SKILL.md`, malformed frontmatter, duplicate skill names, empty project/global roots, missing receipt on update, and remove outside known roots.
- [x] No regressions in Native SDK markup contract for `src/app.native`.

## Review
- [x] Code reviewed.
- [x] PLAN.md updated if approach changed during implementation.
- [x] Phase commits consolidated into one root commit because the repository had no prior baseline.
- [x] TODO.md items all checked off.
