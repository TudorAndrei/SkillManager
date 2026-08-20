import { builtinModules } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig({
  build: {
    outDir: "out/main",
    emptyOutDir: true,
    target: "node24",
    minify: false,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL("./electron/main/index.ts", import.meta.url)),
      formats: ["cjs"],
      fileName: () => "index.cjs",
    },
    rollupOptions: { external: ["electron", ...nodeBuiltins] },
  },
});
