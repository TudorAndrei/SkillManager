# SkillManager

A Native SDK desktop app for managing agent skills across project and global installs.

This project uses `vercel-labs/native` with a React/Vite WebView frontend:

- `app.zon` declares the native app shell.
- `frontend/src` contains the React UI and shadcn-style components.
- `src/main.zig` wires the Native SDK runner, WebView frontend, bridge commands, and model.
- `src/model.zig` contains model state and update messages.

## Run

Install the Native SDK CLI, then run the app:

```sh
npm install -g @native-sdk/cli
native dev
```

`native dev` starts the Vite frontend automatically and serves the production bundle from
`frontend/dist` for packaged builds.

## Commands

```sh
native check
native test
native dev
```

## Git Hooks

Install the mise-managed tools and hk hooks with:

```sh
mise install
mise exec -- hk check --all
```

The hooks run repository hygiene checks plus gitleaks, oxlint, and oxfmt. Commit messages
are checked against the conventional commit format.

## Embedded Skill Engine

SkillManager keeps skill operations inside the app process. It scans `SKILL.md` files directly, copies local skill folders directly, fetches public GitHub skill files with Zig HTTP APIs, and does not route scan/install/update/remove through `npx skills`, `git`, `curl`, or another skill CLI subprocess.

Supported scan roots:

- Project Codex/shared skills: `.agents/skills`
- Global Codex skills: `~/.codex/skills`
- Claude Code skills: `.claude/skills` and `~/.claude/skills`
- Cursor global skills: `~/.cursor/skills`
- OpenCode global skills: `~/.config/opencode/skills`
- Gemini CLI global skills: `~/.gemini/skills`

Project scope currently resolves from the app launch directory. Global scope resolves from `HOME`.

## Install Sources

Local install copies a directory containing `SKILL.md` into the selected Project or Global destination and writes `.skillmanager.json`.

GitHub install accepts public sources such as:

- `vercel-labs/agent-skills` plus a skill path like `skills/find-docs`
- `https://github.com/vercel-labs/agent-skills/tree/main/skills/find-docs`

Update uses `.skillmanager.json` receipts. Pre-existing skills without receipts still scan and can be removed, but update requires a receipt.
