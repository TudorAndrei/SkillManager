import { homedir } from "node:os";
import { parse } from "node:path";
import { app, ipcMain, type BrowserWindow } from "electron";
import { resolveCliPath, VENDORED_CLI_VERSION } from "./cli/paths.ts";
import { failureMessage, runCli, succeeded, type OutputChunk, type RunResult } from "./cli/run.ts";
import { collectInventory, type Inventory } from "./read/collect.ts";
import { discoverProjects, type ProjectRow } from "./read/projects.ts";
import { buildSnapshot, emptySnapshot, type Snapshot } from "./snapshot.ts";

export const INVOKE_CHANNEL = "skillmanager:invoke";
export const OUTPUT_CHANNEL = "skillmanager:output";

export interface VersionInfo {
  app: string;
  cli: string;
  cliPath: string;
  pinned: string;
}

type Payload = Record<string, unknown> | undefined;

interface UiState {
  projects: ProjectRow[];
  projectRoot: string;
  filters: { search: string; scope: string; agent: string };
  active: string | null;
  inventory: Inventory | null;
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

function stringField(payload: Payload, name: string): string {
  const value = payload?.[name];
  return typeof value === "string" ? value : "";
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

async function dispatch(
  window: BrowserWindow | null,
  command: string,
  payload: Payload,
): Promise<VersionInfo | Snapshot | null> {
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
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(INVOKE_CHANNEL, async (_event, command: string, payload: Payload) =>
    dispatch(getWindow(), command, payload),
  );
}
