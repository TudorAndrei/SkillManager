import type { Snapshot } from "../main/snapshot.ts";

/**
 * The contract between the renderer and the main process. Both sides import
 * these types, so a command payload or result cannot drift on one side only.
 * The imports are type-only and disappear at build time, so the preload script
 * keeps no runtime dependency on the main process.
 */

export const INVOKE_CHANNEL = "skillmanager:invoke";
export const OUTPUT_CHANNEL = "skillmanager:output";

interface VersionInfo {
  app: string;
  cli: string;
  cliPath: string;
  pinned: string;
}

/** Every command payload is a flat set of named strings. */
export type BridgePayload = Readonly<Record<string, string>>;

export type BridgeResult = Snapshot | VersionInfo | null;

export interface OutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

export interface SkillManagerBridge {
  invoke: (command: string, payload?: BridgePayload) => Promise<BridgeResult>;
  onOutput: (listener: (chunk: OutputChunk) => void) => () => void;
}
