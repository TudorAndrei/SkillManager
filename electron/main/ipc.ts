import { app, ipcMain, type BrowserWindow } from "electron";
import { resolveCliPath, VENDORED_CLI_VERSION } from "./cli/paths.ts";
import { failureMessage, runCli, succeeded, type OutputChunk, type RunResult } from "./cli/run.ts";
import { emptySnapshot, type Snapshot } from "./snapshot.ts";

export const INVOKE_CHANNEL = "skillmanager:invoke";
export const OUTPUT_CHANNEL = "skillmanager:output";

export interface VersionInfo {
  app: string;
  cli: string;
  cliPath: string;
  pinned: string;
}

type Payload = Record<string, unknown> | undefined;

let currentRun: AbortController | null = null;

function cliPath(): string {
  return resolveCliPath({
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  });
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

async function dispatch(
  window: BrowserWindow | null,
  command: string,
  _payload: Payload,
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
    case "skillmanager.search":
    case "skillmanager.scope":
    case "skillmanager.agent":
    case "skillmanager.select":
    case "skillmanager.project":
      // The inventory reader arrives in the next phase. Until then the shell
      // reports an honest empty state instead of pretending to have data.
      return emptySnapshot({ status: "Inventory reader not connected yet" });
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(INVOKE_CHANNEL, async (_event, command: string, payload: Payload) =>
    dispatch(getWindow(), command, payload),
  );
}
