# Plan: Cross-Platform Build Workflow

## Goal

Add GitHub Actions that validate SkillManager on Linux and Apple Silicon macOS, then automatically create SemVer GitHub Releases from Conventional Commits on `main` and attach the two platform packages. This replaces the completed embedded-skill-library plan with a focused delivery plan for reproducible release artifacts.

## Approach

SkillManager is a Native SDK desktop app: `app.zon` describes the desktop package, `src/main.zig` supplies the Zig application entry point, and `frontend/` produces the WebView assets that are embedded from `frontend/dist`. The repository has no `.github/workflows` directory today, and `app.zon` currently limits intended package targets to macOS even though the Native SDK supports the system WebView on Linux (WebKitGTK) and macOS (WKWebView).

The implementation will first declare Linux alongside macOS in `app.zon`, while retaining the existing system-WebView configuration. A verification workflow will run on pull requests and pushes to `main` using `ubuntu-latest` and the Apple Silicon `macos-latest` runner. It will install the native Linux WebKitGTK development dependencies on Ubuntu, provision Bun for the locked frontend dependencies, install the pinned Native SDK CLI, and run the frontend build and Native manifest/model/test checks. It will not package or retain artifacts.

A release workflow will use semantic-release with Conventional Commits to decide whether a push to `main` warrants a SemVer version. When it does, semantic-release will create the Git tag and GitHub Release, then conditionally fan out to Linux and Apple Silicon macOS package jobs in that same workflow. Keeping those jobs together is required because a release created with GitHub's built-in `GITHUB_TOKEN` does not trigger a separate `release.published` workflow. The package jobs derive the manifest version from the release tag without committing it, archive the Linux install tree and macOS `.app` bundle, and upload them directly to that GitHub Release. No non-release artifacts will be retained. The workflows will not sign/notarize macOS apps, build Intel macOS or Windows variants, or publish from branches other than `main`.

## Implementation Phases

### Phase 1: Declare supported package targets

- Update `app.zon` so `.platforms` contains both `"macos"` and `"linux"`, matching the requested build matrix and Native SDK package targets.
- Validate the amended manifest with `native validate app.zon` and run `native check --strict` to make sure the platform declaration leaves the existing bridge/frontend contract intact.
**Commit:** `chore(platform): declare linux packaging support`

### Phase 2: Add verification and automatic release automation

- Add a semantic-release configuration that analyzes Conventional Commits on `main`, calculates the next SemVer release, and creates a GitHub Release only when a new version is warranted.
- Add `.github/workflows/verify.yml` with pull-request and `main`-push triggers and a Linux/Apple-Silicon-macOS matrix using `ubuntu-latest` and `macos-latest`; it must not upload build artifacts.
- Add `.github/workflows/release.yml`, triggered by pushes to `main`, with a semantic-release job and a conditional Linux/Apple-Silicon-macOS package matrix that runs only when the release job publishes a version.
- Install Bun, restore the locked `frontend/bun.lock` dependency set with `bun install --cwd frontend --frozen-lockfile`, and build the Vite frontend with `bun run --cwd frontend build` before Native SDK compilation.
- Add a root `package.json`/`package-lock.json` that locks `@native-sdk/cli` to `0.4.0`; install it with `npm ci --ignore-scripts`, then run its local `native` binary for validation, tests, diagnosis, builds, and packaging on each matrix host.
- On Ubuntu, install the WebKitGTK and GTK packages required by the configured system WebView; on macOS, package unsigned (`--signing none`) because signing identities are intentionally out of scope.
- In release-package jobs only, make the release tag's SemVer value available to the package manifest without committing generated version changes, package `zig-out/bin/skillmanager` with `frontend/dist`, archive the platform package as `SkillManager-linux-x64.tar.gz` or `SkillManager-macos-arm64.zip`, and upload it with `gh release upload`.
- Verify the workflow YAML and release configuration are syntactically valid, the package paths match Native CLI output, verification passes from a clean checkout, and a qualifying Conventional Commit produces a release with exactly two assets.
**Commit:** `ci(release): automate linux and macos releases`

### Phase 3: Extend Git hook coverage for workflows

- Extend the existing `hk.pkl` configuration instead of regenerating it, adding `actionlint` and `zizmor` because `.github/workflows/verify.yml` and `.github/workflows/release.yml` are new GitHub Actions sources.
- Add the pinned `actionlint` tool and `zizmor` to `mise.toml`, retain the existing conventional-commit hook, and keep the existing frontend and secret-scanning checks unchanged.
- Run `mise install`, reinstall hooks with `hk install --mise`, run `hk check --all`, and test the conventional-commit validator with a valid Conventional Commit subject. Zizmor must pass without suppressions, including its immutable-action-reference and least-privilege checks.
**Commit:** `chore(hooks): lint github actions security`

## Risks & Tradeoffs

- `ubuntu-latest` can change its available WebKitGTK package names or versions. Mitigation: install the explicit development packages required by the Native SDK system-WebView build and let `native doctor --strict` fail early with a useful log.
- `macos-latest` must continue to resolve to an Apple Silicon runner for the selected macOS package. Mitigation: name the asset explicitly as `macos-arm64` and fail the workflow if the runner architecture is not ARM64; Intel output is intentionally out of scope.
- The system WebView keeps package size low but Linux rendering depends on the user's installed WebKitGTK runtime. Mitigation: use the Native SDK's system-engine packaging and document this distribution constraint rather than silently bundling Chromium/CEF.
- Unsigned macOS release assets may trigger Gatekeeper warnings. Mitigation: publish unsigned releases for now; add signing/notarization only when Developer ID credentials are available.
- Frontend dependencies are locked with Bun, while the Native CLI is installed globally with npm. Mitigation: pin the CLI version in the workflow and keep the two dependency-install steps separate and explicit.
- The existing hk configuration imports its pinned package over HTTPS. Mitigation: keep its already-pinned `v1.50.0` import and run hooks with normal developer/CI network access; do not regenerate unrelated hook settings.

## Confirmed Decisions

- Semantic-release will create GitHub Releases from SemVer versions determined by Conventional Commits.
- macOS release packages target Apple Silicon (`arm64`) only.
- Verification builds do not upload or retain artifacts; only published releases carry downloadable packages.
