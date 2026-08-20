import { homedir } from "node:os";
import { parse } from "node:path";
import { app, dialog, ipcMain, type BrowserWindow } from "electron";
import {
  addArgs,
  agentIdentifier,
  removeArgs,
  repoSkillsArgs,
  updateArgs,
  validAgentsArgs,
  type Scope,
} from "./cli/args.ts";
import { parseRepoSkills, parseValidAgents, type RepoSkill } from "./cli/parse.ts";
import { resolveCliPath, VENDORED_CLI_VERSION } from "./cli/paths.ts";
import { failureMessage, runCli, succeeded, type OutputChunk, type RunResult } from "./cli/run.ts";
import { asObject, asText, type JsonValue } from "./read/json.ts";
import { collectInventory, type Inventory } from "./read/collect.ts";
import { discoverProjects, type ProjectRow } from "./read/projects.ts";
import { buildSnapshot, emptySnapshot, type Snapshot } from "./snapshot.ts";
import { INVOKE_CHANNEL, OUTPUT_CHANNEL, type BridgeResult } from "../shared/contract.ts";

interface DiscoveryResult {
  candidates: RepoSkill[];
}

interface UiState {
  projects: ProjectRow[];
  projectRoot: string;
  filters: { search: string; scope: string; agent: string };
  active: string | null;
  inventory: Inventory | null;
  /** Agent identifiers the CLI accepts, read from the CLI itself. */
  validAgents: string[];
  status: string;
  error: { title: string; detail: string } | null;
}

/**
 * The directory the app was started from. A bundle started from Finder reports
 * the filesystem root, which is no use as a project, so fall back to `$HOME`.
 */
function launchDirectory(): string {
  const cwd = process.cwd();
  return cwd === parse(cwd).root ? homedir() : cwd;
}

const state: UiState = {
  projects: [],
  projectRoot: launchDirectory(),
  filters: { search: "", scope: "all", agent: "all" },
  active: null,
  inventory: null,
  validAgents: [],
  status: "Ready",
  error: null,
};

let currentRun: AbortController | null = null;

function cliPath(): string {
  return resolveCliPath({
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  });
}

/** Read one named string from a command payload. The payload is external input. */
function stringField(payload: JsonValue, name: string): string {
  return asText(asObject(payload)?.[name]) ?? "";
}

/**
 * Every CLI run reports its argument list and its output to the renderer, so the
 * console panel shows exactly what ran.
 */
async function run(window: BrowserWindow | null, args: string[], cwd?: string): Promise<RunResult> {
  const controller = new AbortController();
  currentRun = controller;
  const send = (chunk: OutputChunk) => {
    if (!window || window.isDestroyed()) return;
    window.webContents.send(OUTPUT_CHANNEL, chunk);
  };

  send({ stream: "stdout", text: `$ ${["skills", ...args].join(" ")}\n` });
  try {
    return await runCli(args, {
      cliPath: cliPath(),
      cwd,
      onOutput: send,
      signal: controller.signal,
    });
  } finally {
    currentRun = null;
  }
}

async function cliVersion(window: BrowserWindow | null): Promise<string> {
  const result = await run(window, ["--version"]);
  if (!succeeded(result)) throw new Error(failureMessage(result));
  return result.stdout.trim();
}

/** Build the current view from the cached inventory. This starts no CLI run. */
function snapshot(): Snapshot {
  if (!state.inventory) {
    return emptySnapshot({
      projects: state.projects,
      projectRoot: state.projectRoot,
      filters: state.filters,
      status: state.status,
      error: state.error,
    });
  }
  return buildSnapshot({
    projects: state.projects,
    projectRoot: state.projectRoot,
    skills: state.inventory.skills,
    filters: state.filters,
    active: state.active,
    status: state.status,
    error: state.error,
  });
}

/** Re-read the inventory with the CLI, then rebuild the view. */
async function reload(window: BrowserWindow | null): Promise<Snapshot> {
  if (state.projects.length === 0) {
    state.projects = await discoverProjects(state.projectRoot);
    state.projectRoot = state.projects[0]?.path ?? state.projectRoot;
  }

  try {
    state.inventory = await collectInventory(
      (args, cwd) => run(window, args, cwd),
      state.projectRoot,
      homedir(),
    );
    state.error = null;
    const unknown = [state.inventory.projectLock, state.inventory.globalLock].find(
      (lock) => lock.unknownVersion,
    );
    state.status = unknown
      ? `Lock file version ${String(unknown.version)} is newer than this build reads`
      : `Read with skills ${VENDORED_CLI_VERSION}`;
  } catch (error) {
    state.error = {
      title: "Could not read the inventory.",
      detail: error instanceof Error ? error.message : String(error),
    };
    state.status = "Inventory read failed";
  }
  return snapshot();
}

function scopeField(payload: JsonValue): Scope {
  return stringField(payload, "scope") === "global" ? "global" : "project";
}

/** The working directory decides the project. Global commands use `-g` instead. */
function cwdFor(scope: Scope): string | undefined {
  return scope === "project" ? state.projectRoot : undefined;
}

/** Ask the CLI which agent identifiers it accepts. It answers when one is wrong. */
async function loadValidAgents(window: BrowserWindow | null): Promise<string[]> {
  if (state.validAgents.length > 0) return state.validAgents;
  const result = await run(window, validAgentsArgs());
  state.validAgents = parseValidAgents(result.stdout + result.stderr);
  return state.validAgents;
}

function findSkill(id: string) {
  return state.inventory?.skills.find((skill) => `${skill.cli.scope}:${skill.cli.name}` === id);
}

/** A skill with no lock entry is removed only after the user agrees. */
async function confirmUnmanagedRemoval(
  window: BrowserWindow | null,
  name: string,
): Promise<boolean> {
  const options = {
    type: "warning" as const,
    buttons: ["Cancel", "Remove"],
    defaultId: 0,
    cancelId: 0,
    message: `Remove ${name}?`,
    detail:
      "No lock file records this skill, so the skills CLI did not install it. " +
      "Removing it deletes the installed files and every agent link.",
  };
  const answer = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  return answer.response === 1;
}

/**
 * Run a command that changes state, then read the result back with `ls --json`
 * and the lock files. The command's own text is never parsed for a result.
 */
async function runWrite(
  window: BrowserWindow | null,
  args: string[],
  cwd: string | undefined,
  failureTitle: string,
): Promise<Snapshot> {
  const result = await run(window, args, cwd);
  const refreshed = await reload(window);
  if (succeeded(result)) return refreshed;
  state.error = { title: failureTitle, detail: failureMessage(result) };
  return snapshot();
}

async function dispatch(
  window: BrowserWindow | null,
  command: string,
  payload: JsonValue,
): Promise<BridgeResult | DiscoveryResult> {
  switch (command) {
    case "skillmanager.version":
      return {
        app: app.getVersion(),
        cli: await cliVersion(window),
        cliPath: cliPath(),
        pinned: VENDORED_CLI_VERSION,
      };
    case "skillmanager.cancel":
      currentRun?.abort();
      return null;
    case "skillmanager.snapshot":
    case "skillmanager.refresh":
      return reload(window);
    case "skillmanager.project": {
      const path = stringField(payload, "path");
      if (path.length > 0 && path !== state.projectRoot) {
        state.projectRoot = path;
        state.active = null;
      }
      return reload(window);
    }
    // Filters and selection are view state. They never start a CLI run.
    case "skillmanager.search":
      state.filters = { ...state.filters, search: stringField(payload, "value") };
      return snapshot();
    case "skillmanager.scope":
      state.filters = { ...state.filters, scope: stringField(payload, "value") || "all" };
      return snapshot();
    case "skillmanager.agent":
      state.filters = { ...state.filters, agent: stringField(payload, "value") || "all" };
      return snapshot();
    case "skillmanager.select":
      state.active = stringField(payload, "id") || null;
      return snapshot();
    case "skillmanager.discover": {
      const result = await run(window, repoSkillsArgs(stringField(payload, "source")));
      return { candidates: parseRepoSkills(result.stdout + result.stderr) };
    }
    case "skillmanager.install": {
      const scope = scopeField(payload);
      const requested = stringField(payload, "agent");
      const agents =
        requested === "" || requested === "all"
          ? ["*"]
          : [agentIdentifier(requested, await loadValidAgents(window))];
      const skill = stringField(payload, "skill");
      const args = addArgs({
        source: stringField(payload, "source"),
        skills: [skill === "" ? "*" : skill],
        agents,
        scope,
      });
      return runWrite(window, args, cwdFor(scope), "Install failed.");
    }
    case "skillmanager.update": {
      const skill = findSkill(stringField(payload, "id"));
      if (skill === undefined) return snapshot();
      const scope = skill.cli.scope;
      return runWrite(
        window,
        updateArgs({ skill: skill.cli.name, scope }),
        cwdFor(scope),
        "Update failed.",
      );
    }
    case "skillmanager.remove": {
      const skill = findSkill(stringField(payload, "id"));
      if (skill === undefined) return snapshot();
      // No lock entry means the CLI did not install this skill. Removing it is
      // still correct, but the user should say so first.
      if (skill.lock === null && !(await confirmUnmanagedRemoval(window, skill.cli.name))) {
        return snapshot();
      }
      const scope = skill.cli.scope;
      state.active = null;
      return runWrite(
        window,
        removeArgs({ skill: skill.cli.name, scope }),
        cwdFor(scope),
        "Remove failed.",
      );
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(INVOKE_CHANNEL, async (_event, command: string, payload: JsonValue) =>
    dispatch(getWindow(), command, payload),
  );
}
