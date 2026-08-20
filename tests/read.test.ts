import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { collectInventory } from "../electron/main/read/collect.ts";
import { parseListJson } from "../electron/main/read/inventory.ts";
import { readGlobalLock, readProjectLock } from "../electron/main/read/locks.ts";
import { parseFrontmatter } from "../electron/main/read/manifest.ts";
import { discoverProjects } from "../electron/main/read/projects.ts";
import { buildSnapshot, UNMANAGED_SOURCE } from "../electron/main/snapshot.ts";
import type { RunResult } from "../electron/main/cli/run.ts";

function result(stdout: string, code = 0): RunResult {
  return {
    args: [],
    commandLine: "skills ls --json",
    code,
    signal: null,
    stdout,
    stderr: "",
    timedOut: false,
    cancelled: false,
  };
}

describe("parseListJson", () => {
  it("reads the fields the CLI reports", () => {
    const skills = parseListJson(
      JSON.stringify([
        {
          name: "mermaid",
          path: "/p/.agents/skills/mermaid",
          scope: "project",
          agents: ["Claude Code", "Codex"],
          source: "mitsuhiko/agent-stuff",
          sourceUrl: null,
          sourceType: "github",
        },
      ]),
    );
    expect(skills).toHaveLength(1);
    expect(skills[0].agents).toEqual(["Claude Code", "Codex"]);
    expect(skills[0].sourceUrl).toBeNull();
  });

  it("returns nothing for an empty list", () => {
    expect(parseListJson("[]\n")).toEqual([]);
    expect(parseListJson("   ")).toEqual([]);
  });

  it("drops entries without a name or path instead of guessing", () => {
    expect(parseListJson(JSON.stringify([{ name: "x" }, { path: "/y" }, 7]))).toEqual([]);
  });

  it("reports non-JSON output rather than treating it as state", () => {
    expect(() => parseListJson("Found 9 skills")).toThrow(/did not return a JSON list/);
  });
});

describe("parseFrontmatter", () => {
  it("reads name and description", () => {
    const manifest = parseFrontmatter(
      ["---", "name: qmd", "description: Query markdown files.", "---", "", "# Body"].join("\n"),
    );
    expect(manifest).toEqual({ name: "qmd", description: "Query markdown files." });
  });

  it("ignores nested metadata keys", () => {
    const manifest = parseFrontmatter(
      ["---", "name: deploy", "metadata:", "  author: vercel", "---"].join("\n"),
    );
    expect(manifest.name).toBe("deploy");
    expect(manifest.description).toBeNull();
  });

  it("returns empty fields when there is no front matter", () => {
    expect(parseFrontmatter("# Just a heading")).toEqual({ name: null, description: null });
  });
});

describe("lock files", () => {
  let home: string;
  let project: string;

  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "skillmanager-locks-"));
    project = join(root, "project");
    home = join(root, "home");
    await mkdir(project, { recursive: true });
    await mkdir(join(home, ".agents"), { recursive: true });

    await writeFile(
      join(project, "skills-lock.json"),
      JSON.stringify({
        version: 1,
        skills: {
          mermaid: {
            source: "mitsuhiko/agent-stuff",
            sourceType: "github",
            skillPath: "skills/mermaid/SKILL.md",
            computedHash: "c27878e3",
          },
        },
      }),
    );
    await writeFile(
      join(home, ".agents", ".skill-lock.json"),
      JSON.stringify({
        version: 3,
        skills: {
          advisor: {
            source: "owner/advisor",
            sourceType: "github",
            sourceUrl: "https://github.com/owner/advisor.git",
            skillPath: "skills/advisor/SKILL.md",
            skillFolderHash: "9289507",
            installedAt: "2026-04-14T11:46:26.849Z",
            updatedAt: "2026-04-14T11:47:19.873Z",
          },
        },
      }),
    );
  });

  it("reads the version 1 project schema", async () => {
    const lock = await readProjectLock(project);
    expect(lock.version).toBe(1);
    expect(lock.unknownVersion).toBe(false);
    expect(lock.entries.get("mermaid")?.hash).toBe("c27878e3");
  });

  it("reads the version 3 global schema with its own hash field", async () => {
    const lock = await readGlobalLock(home);
    expect(lock.version).toBe(3);
    expect(lock.entries.get("advisor")?.hash).toBe("9289507");
    expect(lock.entries.get("advisor")?.updatedAt).toBe("2026-04-14T11:47:19.873Z");
  });

  it("treats a missing lock file as an empty one", async () => {
    const lock = await readProjectLock(join(project, "nowhere"));
    expect(lock.entries.size).toBe(0);
    expect(lock.version).toBeNull();
  });

  it("flags a lock version newer than this build reads", async () => {
    const newer = join(project, "newer");
    await mkdir(newer, { recursive: true });
    await writeFile(join(newer, "skills-lock.json"), JSON.stringify({ version: 9, skills: {} }));
    const lock = await readProjectLock(newer);
    expect(lock.unknownVersion).toBe(true);
  });
});

describe("discoverProjects", () => {
  it("puts the launch directory first and finds locked siblings", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillmanager-projects-"));
    const start = join(root, "here");
    const sibling = join(root, "other");
    await mkdir(start, { recursive: true });
    await mkdir(sibling, { recursive: true });
    await writeFile(join(root, "skills-lock.json"), "{}");
    await writeFile(join(sibling, "skills-lock.json"), "{}");

    const projects = await discoverProjects(start);
    const paths = projects.map((project) => project.path);
    expect(paths[0]).toBe(start);
    expect(paths).toContain(root);
    expect(paths).toContain(sibling);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("collectInventory and buildSnapshot", () => {
  it("keeps skills that no lock file records and reports them as unmanaged", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillmanager-inventory-"));
    const skillDir = join(root, ".agents", "skills", "loose");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      ["---", "name: loose", "description: Added by hand.", "---"].join("\n"),
    );

    const listed = JSON.stringify([
      {
        name: "loose",
        path: skillDir,
        scope: "project",
        agents: ["Codex"],
        source: null,
        sourceUrl: null,
        sourceType: null,
      },
    ]);
    const run = async (args: string[]) => result(args.includes("-g") ? "[]" : listed);

    const inventory = await collectInventory(run, root, root);
    expect(inventory.skills).toHaveLength(1);
    expect(inventory.skills[0].lock).toBeNull();

    const snapshot = buildSnapshot({
      projects: [{ path: root, name: "root" }],
      projectRoot: root,
      skills: inventory.skills,
      filters: { search: "", scope: "all", agent: "all" },
      active: "project:loose",
      status: "ok",
    });
    expect(snapshot.skills[0].source).toBe(UNMANAGED_SOURCE);
    expect(snapshot.skills[0].description).toBe("Added by hand.");
    expect(snapshot.agents).toEqual(["Codex"]);
    expect(snapshot.detail?.managed).toBe(false);
    expect(snapshot.counts).toMatchObject({ total: 1, project: 1, global: 0, visible: 1 });
  });

  it("filters by scope, agent, and search without changing the counts", async () => {
    const skills = [
      {
        cli: {
          name: "alpha",
          path: "/p/.agents/skills/alpha",
          scope: "project" as const,
          agents: ["Codex"],
          source: "o/r",
          sourceUrl: null,
          sourceType: "github",
        },
        manifest: { name: "alpha", description: "First skill." },
        lock: null,
      },
      {
        cli: {
          name: "beta",
          path: "/h/.agents/skills/beta",
          scope: "global" as const,
          agents: ["Claude Code"],
          source: null,
          sourceUrl: null,
          sourceType: null,
        },
        manifest: { name: "beta", description: "Second skill." },
        lock: null,
      },
    ];
    const base = {
      projects: [],
      projectRoot: "/p",
      skills,
      active: null,
      status: "ok",
    };

    const byScope = buildSnapshot({
      ...base,
      filters: { search: "", scope: "global", agent: "all" },
    });
    expect(byScope.counts).toMatchObject({ total: 2, visible: 1 });
    expect(byScope.skills.filter((row) => row.visible)[0].name).toBe("beta");

    const byAgent = buildSnapshot({
      ...base,
      filters: { search: "", scope: "all", agent: "Codex" },
    });
    expect(byAgent.skills.filter((row) => row.visible)[0].name).toBe("alpha");

    const bySearch = buildSnapshot({
      ...base,
      filters: { search: "second", scope: "all", agent: "all" },
    });
    expect(bySearch.counts.visible).toBe(1);
    expect(bySearch.skills.filter((row) => row.visible)[0].name).toBe("beta");
  });
});
