import { spawn } from "node:child_process";
import { cleanOutput, formatCommandLine } from "./parse.ts";

export interface OutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

export interface RunResult {
  /** The argument list, without the interpreter path. Shown to the user. */
  args: string[];
  commandLine: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
}

export interface RunCliOptions {
  cliPath: string;
  /** Node-capable executable. In Electron this is the app binary itself. */
  execPath?: string;
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  onOutput?: (chunk: OutputChunk) => void;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const KILL_GRACE_MS = 2_000;

/**
 * Environment for every CLI run.
 *
 * `ELECTRON_RUN_AS_NODE` turns the Electron binary into a Node runtime, so the
 * bundled CLI needs no Node installation on the machine. `CI` plus `-y` on the
 * argument list keep the child from waiting for input. Telemetry is disabled by
 * default; the CLI reads both variable names.
 */
function cliEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...base,
    ELECTRON_RUN_AS_NODE: "1",
    CI: "1",
    DO_NOT_TRACK: "1",
    DISABLE_TELEMETRY: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };
}

/**
 * Start the bundled CLI. The argument list is always an array, never a shell
 * string, so no user value can reach a shell.
 */
export function runCli(args: string[], options: RunCliOptions): Promise<RunResult> {
  const execPath = options.execPath ?? process.execPath;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const commandLine = formatCommandLine(args);

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(execPath, [options.cliPath, ...args], {
      cwd: options.cwd,
      env: cliEnvironment(options.env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const collect = (stream: "stdout" | "stderr") => (data: Buffer) => {
      const text = cleanOutput(data.toString("utf8"));
      if (stream === "stdout") stdout += text;
      else stderr += text;
      options.onOutput?.({ stream, text });
    };

    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));

    const stop = () => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, KILL_GRACE_MS).unref?.();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    timer.unref?.();

    const onAbort = () => {
      cancelled = true;
      stop();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = () => {
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    child.on("error", (error) => {
      finish();
      reject(error);
    });

    child.on("close", (code, signal) => {
      finish();
      resolve({ args, commandLine, code, signal, stdout, stderr, timedOut, cancelled });
    });
  });
}

/** True when the CLI finished normally and was neither cancelled nor stopped. */
export function succeeded(result: RunResult): boolean {
  return result.code === 0 && !result.timedOut && !result.cancelled;
}

/** One sentence that explains a failed run, for the error strip in the UI. */
export function failureMessage(result: RunResult): string {
  if (result.cancelled) return "The command was cancelled.";
  if (result.timedOut) return "The command did not finish in time and was stopped.";
  const detail = (result.stderr.trim() || result.stdout.trim()).split("\n").filter(Boolean).pop();
  return detail ?? `The command failed with exit code ${String(result.code)}.`;
}
