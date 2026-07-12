# TODO: Cross-Platform Build Workflow

## Phase 1: Declare supported package targets

- [x] Update `.platforms` in `app.zon` to include `linux` and retain `macos`.
- [x] Run `native validate app.zon` against the updated manifest.
- [x] Run `native check --strict` to verify the existing frontend/bridge contract remains valid.
- [x] Commit: `chore(platform): declare linux packaging support`

## Phase 2: Add verification and automatic release automation

- [x] Add semantic-release configuration for SemVer versioning from Conventional Commits and GitHub Release creation on `main`.
- [x] Add `.github/workflows/verify.yml` with pull-request and `main`-push triggers; it must not upload artifacts.
- [x] Add `.github/workflows/release.yml`, triggered by pushes to `main`, with a semantic-release job and a conditional Linux / Apple-Silicon-macOS package matrix.
- [x] Configure `ubuntu-latest` for `linux-x64` and verify `macos-latest` is ARM64 before creating `macos-arm64` packages.
- [x] Install Bun, run `bun install --cwd frontend --frozen-lockfile`, and build `frontend/dist` with `bun run --cwd frontend build`.
- [x] Add and install the root-locked `@native-sdk/cli` with `npm ci --ignore-scripts`, then run its local binary for `native validate`, `native check --strict`, `native test --yes`, `native doctor --strict`, and `native build --yes` on both hosts.
- [x] Install Linux system-WebView build prerequisites before the Native SDK checks and builds.
- [x] In release jobs, pass the GitHub Release tag's SemVer into packaging without committing generated version changes.
- [x] Package `zig-out/bin/skillmanager` with `frontend/dist`; archive the Linux install tree and the macOS `.app` bundle.
- [x] Upload exactly two archives directly to the published GitHub Release with `gh release upload`.
- [ ] Verify the generated YAML, release configuration, and artifact paths in a GitHub Actions run from a clean checkout.
- [x] Commit: `ci(release): automate linux and macos releases`

## Phase 3: Extend Git hook coverage for workflows

- [x] Add the `actionlint` and `zizmor` builtins to the existing `hk.pkl` configuration for `.github/workflows/*.yml` files.
- [x] Add pinned `actionlint` and `zizmor` to `mise.toml` without changing existing frontend or secret-scanning tools.
- [x] Run `mise install` and reinstall hooks with `hk install --mise`.
- [x] Run `hk check --all`, including actionlint, and validate a Conventional Commit subject.
- [x] Commit: `chore(hooks): lint github actions security`

## Phase 4: Repair release package jobs

- [x] Install the locked Native SDK CLI inside each release package matrix job.
- [x] Remove the unused Native SDK CLI install from the semantic-release job.
- [x] Upgrade checkout and setup-node to immutable Node 24-based action releases.
- [x] Run actionlint, zizmor, and `hk check --all` after the workflow change.
- [ ] Push the repair and verify Linux/macOS verification and release package jobs succeed.
- [ ] Commit: `fix(ci): install native cli in release jobs`

## Verification

- [x] `app.zon` validates with both declared package targets.
- [x] `native check --strict` passes after the `app.zon` change.
- [x] On macOS, the workflow produces an unsigned, runnable `SkillManager.app` archive containing `Contents/MacOS/skillmanager` and the `frontend/dist` assets.
- [ ] On Linux, the workflow produces an install-tree archive containing `bin/skillmanager`, a `.desktop` launcher, and the packaged frontend assets.
- [ ] Both matrix jobs pass `native test --yes` and `native doctor --manifest app.zon --strict`.
- [ ] A pull request run produces no retained artifacts.
- [ ] A qualifying Conventional Commit on `main` creates a SemVer GitHub Release with exactly `SkillManager-linux-x64.tar.gz` and `SkillManager-macos-arm64.zip` assets.
- [x] No macOS signing/notarization, Windows build, or Intel/cross-architecture build is introduced.

## Review

- [x] Code reviewed.
- [x] PLAN.md updated when release packaging changed from a `release.published` workflow to same-workflow jobs due to `GITHUB_TOKEN` event propagation.
- [x] All phase commits are clean and describe their intent.
- [ ] TODO.md items all checked off.
