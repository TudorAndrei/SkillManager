#!/usr/bin/env node
// Development runner: build the main and preload bundles, start the Vite dev
// server for the renderer, then start Electron pointed at it.
import { spawn } from "node:child_process";
import process from "node:process";

const DEV_URL = "http://127.0.0.1:5173/";
const READY_TIMEOUT_MS = 30_000;

function run(command, args, options = {}) {
  return spawn(command, args, { stdio: "inherit", ...options });
}

function once(command, args) {
  return new Promise((resolve, reject) => {
    const child = run(command, args);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)),
    );
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The dev server did not answer at ${url}`);
}

await once("npm", ["run", "build:main"]);
await once("npm", ["run", "build:preload"]);

const renderer = run("npm", [
  "run",
  "--prefix",
  "frontend",
  "dev",
  "--",
  "--host",
  "127.0.0.1",
  "--port",
  "5173",
  "--strictPort",
]);

const stop = () => {
  renderer.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  await waitForServer(DEV_URL, READY_TIMEOUT_MS);
} catch (error) {
  stop();
  throw error;
}

const electron = run("npx", ["electron", "."], {
  env: { ...process.env, SKILLMANAGER_DEV_URL: DEV_URL },
});

electron.on("close", (code) => {
  stop();
  process.exit(code ?? 0);
});
