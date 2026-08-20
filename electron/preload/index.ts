import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  INVOKE_CHANNEL,
  OUTPUT_CHANNEL,
  type BridgePayload,
  type BridgeResult,
  type OutputChunk,
  type SkillManagerBridge,
} from "../shared/contract.ts";

/**
 * The whole surface the renderer gets: one request function and one output
 * stream. No filesystem, no child process, no Node API.
 */
const bridge: SkillManagerBridge = {
  invoke(command: string, payload?: BridgePayload): Promise<BridgeResult> {
    // SAFETY: the main process answers this channel with a BridgeResult for
    // every command it accepts, and rejects any command it does not.
    return ipcRenderer.invoke(INVOKE_CHANNEL, command, payload) as Promise<BridgeResult>;
  },
  onOutput(listener: (chunk: OutputChunk) => void): () => void {
    const handler = (_event: IpcRendererEvent, chunk: OutputChunk) => listener(chunk);
    ipcRenderer.on(OUTPUT_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(OUTPUT_CHANNEL, handler);
    };
  },
};

contextBridge.exposeInMainWorld("skillmanager", bridge);
