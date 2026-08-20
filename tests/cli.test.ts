import { describe, expect, it } from "vitest";
import { resolveCliPath, VENDORED_CLI_VERSION } from "../electron/main/cli/paths.ts";
import { cleanOutput, formatCommandLine, stripAnsi } from "../electron/main/cli/parse.ts";
import { failureMessage, runCli, succeeded } from "../electron/main/cli/run.ts";

const devCliPath = resolveCliPath({
  packaged: false,
  appPath: process.cwd(),
  resourcesPath: "/unused",
});

describe("resolveCliPath", () => {
  it("uses the vendor directory in development", () => {
    expect(devCliPath).toBe(`${process.cwd()}/vendor/node_modules/skills/bin/cli.mjs`);
  });

  it("keeps a node_modules parent when packaged, so tar and yaml resolve", () => {
    const packaged = resolveCliPath({
      packaged: true,
      appPath: "/app/Resources/app.asar",
      resourcesPath: "/app/Resources",
    });
    expect(packaged).toBe("/app/Resources/skills-cli/node_modules/skills/bin/cli.mjs");
  });
});

describe("output cleaning", () => {
  const esc = String.fromCharCode(27);

  it("removes colour sequences", () => {
    expect(stripAnsi(`${esc}[1mSkills${esc}[0m`)).toBe("Skills");
  });

  it("keeps only the last spinner frame of a redrawn line", () => {
    expect(cleanOutput("Fetching.\rFetching..\rFound 9 skills")).toBe("Found 9 skills");
  });

  it("quotes arguments that a shell would treat specially", () => {
    expect(formatCommandLine(["add", "owner/repo", "--skill", "*"])).toBe(
      "skills add owner/repo --skill '*'",
    );
  });
});

describe("the bundled CLI", () => {
  it("reports the pinned version", async () => {
    const result = await runCli(["--version"], { cliPath: devCliPath });
    expect(succeeded(result), failureMessage(result)).toBe(true);
    expect(result.stdout.trim()).toBe(VENDORED_CLI_VERSION);
    expect(result.commandLine).toBe("skills --version");
  }, 60_000);

  it("reports failure for an unknown command instead of throwing", async () => {
    const result = await runCli(["definitely-not-a-command"], { cliPath: devCliPath });
    expect(succeeded(result)).toBe(false);
    expect(failureMessage(result)).toContain("skills --help");
  }, 60_000);
});
