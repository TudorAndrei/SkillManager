import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

const INVOKE_CHANNEL = "skillmanager:invoke";
const OUTPUT_CHANNEL = "skillmanager:output";

export interface OutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

/**
 * The whole surface the renderer gets: one request function and one output
 * stream. No filesystem, no child process, no Node API.
 */
const bridge = {
  invoke(command: string, payload?: unknown): Promise<unknown> {
    return ipcRenderer.invoke(INVOKE_CHANNEL, command, payload);
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

export type SkillManagerBridge = typeof bridge;
