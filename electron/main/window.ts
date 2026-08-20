import { join } from "node:path";
import { app, shell, BrowserWindow } from "electron";

/** Values carried over from the Native SDK manifest that this shell replaces. */
const WINDOW = {
  title: "SkillManager",
  width: 1180,
  height: 760,
  minWidth: 980,
  minHeight: 620,
  background: "#090b0d",
} as const;

/** Set by scripts/dev.mjs when the Vite dev server is running. */
const devServerUrl = process.env.SKILLMANAGER_DEV_URL;

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: WINDOW.title,
    width: WINDOW.width,
    height: WINDOW.height,
    minWidth: WINDOW.minWidth,
    minHeight: WINDOW.minHeight,
    backgroundColor: WINDOW.background,
    show: false,
    webPreferences: {
      preload: join(app.getAppPath(), "out", "preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  // Startup must be observable: a renderer that fails to load or crashes says so
  // instead of leaving an empty window.
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`Renderer failed to load ${url}: ${description} (${String(code)})`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Renderer stopped: ${details.reason}`);
  });

  // The renderer is a local page. It never opens windows, and every external
  // link goes to the system browser instead of navigating this window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (devServerUrl && url.startsWith(devServerUrl)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  if (devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadFile(join(app.getAppPath(), "frontend", "dist", "index.html"));

  return window;
}
