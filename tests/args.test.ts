import { describe, expect, it } from "vitest";
import {
  addArgs,
  agentIdentifier,
  findArgs,
  initArgs,
  removeArgs,
  repoSkillsArgs,
  restoreArgs,
  syncArgs,
  updateArgs,
  useArgs,
  validAgentsArgs,
} from "../electron/main/cli/args.ts";
import {
  formatCommandLine,
  parseFindResults,
  parseRepoSkills,
  parseValidAgents,
} from "../electron/main/cli/parse.ts";

describe("argument builders", () => {
  it("installs into a project with explicit skills and agents", () => {
    expect(
      addArgs({
        source: "vercel-labs/agent-skills",
        skills: ["deploy-to-vercel"],
        agents: ["claude-code"],
        scope: "project",
      }),
    ).toEqual([
      "add",
      "vercel-labs/agent-skills",
      "-y",
      "--skill",
      "deploy-to-vercel",
      "--agent",
      "claude-code",
    ]);
  });

  it("adds -g for global scope and keeps the wildcards", () => {
    expect(
      addArgs({ source: "owner/repo", skills: ["*"], agents: ["*"], scope: "global" }),
    ).toEqual(["add", "owner/repo", "-y", "--skill", "*", "--agent", "*", "-g"]);
  });

  it("never omits -y, because a prompt would block the child process", () => {
    const commands = [
      addArgs({ source: "o/r", skills: [], agents: [], scope: "project" }),
      removeArgs({ skill: "qmd", scope: "project" }),
      updateArgs({ skill: "qmd", scope: "project" }),
    ];
    for (const args of commands) expect(args).toContain("-y");
  });

  it("names the skill for remove and update", () => {
    expect(removeArgs({ skill: "qmd", scope: "global" })).toEqual([
      "remove",
      "-y",
      "-s",
      "qmd",
      "-g",
    ]);
    expect(updateArgs({ skill: "qmd", scope: "project" })).toEqual(["update", "qmd", "-y", "-p"]);
    expect(updateArgs({ skill: "qmd", scope: "global" })).toEqual(["update", "qmd", "-y", "-g"]);
  });

  it("lists repository skills without installing", () => {
    expect(repoSkillsArgs("owner/repo")).toEqual(["add", "owner/repo", "-l"]);
    expect(repoSkillsArgs("owner/repo")).not.toContain("-y");
  });

  it("builds the project-wide commands", () => {
    expect(findArgs("react", "")).toEqual(["find", "react"]);
    expect(findArgs("react", "vercel")).toEqual(["find", "react", "--owner", "vercel"]);
    expect(useArgs("vercel-labs/agent-skills", "deploy-to-vercel")).toEqual([
      "use",
      "vercel-labs/agent-skills@deploy-to-vercel",
    ]);
    expect(restoreArgs()).toEqual(["experimental_install"]);
    expect(syncArgs([])).toEqual(["experimental_sync", "-y"]);
    expect(syncArgs(["codex"])).toEqual(["experimental_sync", "-y", "--agent", "codex"]);
    expect(initArgs("my-skill")).toEqual(["init", "my-skill"]);
  });

  it("quotes a wildcard when the command line is shown to the user", () => {
    const line = formatCommandLine(
      addArgs({ source: "o/r", skills: ["*"], agents: [], scope: "project" }),
    );
    expect(line).toBe("skills add o/r -y --skill '*'");
  });
});

describe("agentIdentifier", () => {
  const valid = ["claude-code", "codex", "github-copilot", "antigravity-cli"];

  it("maps a display name to the identifier the CLI accepts", () => {
    expect(agentIdentifier("Claude Code", valid)).toBe("claude-code");
    expect(agentIdentifier("GitHub Copilot", valid)).toBe("github-copilot");
    expect(agentIdentifier("Antigravity CLI", valid)).toBe("antigravity-cli");
  });

  it("passes an unknown name through, so the CLI reports it", () => {
    expect(agentIdentifier("Some New Agent", valid)).toBe("some-new-agent");
  });
});

describe("fail-soft text readers", () => {
  it("reads the candidate list of add -l", () => {
    const output = [
      "│  Available Skills",
      "│",
      "│    vercel-composition-patterns",
      "│",
      "│      React composition patterns that scale.",
      "│",
      "│    deploy-to-vercel",
      "│",
      "│      Deploy applications and websites to Vercel.",
    ].join("\n");
    expect(parseRepoSkills(output)).toEqual([
      {
        name: "vercel-composition-patterns",
        description: "React composition patterns that scale.",
      },
      { name: "deploy-to-vercel", description: "Deploy applications and websites to Vercel." },
    ]);
  });

  it("returns nothing when the format changed, instead of guessing", () => {
    expect(parseRepoSkills("Something completely different\n")).toEqual([]);
  });

  it("reads the results of find, with the install count and the page", () => {
    const output = [
      "Install with npx skills add <owner/repo@skill>",
      "",
      "vercel/turborepo@turborepo 63.6K installs",
      "└ https://skills.sh/vercel/turborepo/turborepo",
      "",
      "vercel/ai@ai-sdk 48.9K installs",
      "└ https://skills.sh/vercel/ai/ai-sdk",
    ].join("\n");
    expect(parseFindResults(output)).toEqual([
      {
        slug: "vercel/turborepo@turborepo",
        installs: "63.6K installs",
        url: "https://skills.sh/vercel/turborepo/turborepo",
      },
      {
        slug: "vercel/ai@ai-sdk",
        installs: "48.9K installs",
        url: "https://skills.sh/vercel/ai/ai-sdk",
      },
    ]);
  });

  it("returns no results rather than guessing when find output changes", () => {
    expect(parseFindResults("No skills matched your search.")).toEqual([]);
  });

  it("reads the valid agent identifiers the CLI reports", () => {
    const agents = parseValidAgents("Invalid agents: x\nValid agents: claude-code, codex, zed\n");
    expect(agents).toEqual(["claude-code", "codex", "zed"]);
    expect(validAgentsArgs()[0]).toBe("ls");
  });

  it("returns nothing when no agent list is present", () => {
    expect(parseValidAgents("no such line")).toEqual([]);
  });
});
