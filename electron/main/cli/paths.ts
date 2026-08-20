import { join } from "node:path";

/**
 * The `skills` release that ships inside the package. The application never
 * installs skills itself: every state change is this CLI, so its version is
 * part of the product contract.
 */
export const VENDORED_CLI_VERSION = "1.5.23";

export interface CliLocation {
  packaged: boolean;
  /** Project root in development, `app.asar` when packaged. */
  appPath: string;
  /** Electron `process.resourcesPath`. */
  resourcesPath: string;
}

/**
 * `extraResources` copies `vendor/node_modules` to `resources/skills-cli/node_modules`,
 * so the CLI keeps a real `node_modules` parent and Node resolves its `tar` and
 * `yaml` dependencies without any extra configuration.
 */
export function resolveCliPath(location: CliLocation): string {
  const root = location.packaged
    ? join(location.resourcesPath, "skills-cli")
    : join(location.appPath, "vendor");
  return join(root, "node_modules", "skills", "bin", "cli.mjs");
}
