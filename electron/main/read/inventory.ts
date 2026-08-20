import type { RunResult } from "../cli/run.ts";

/** One entry of `skills ls --json`. */
export interface CliSkill {
  name: string;
  path: string;
  scope: "project" | "global";
  agents: string[];
  source: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
}

export type Runner = (args: string[], cwd?: string) => Promise<RunResult>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * `ls --json` is the only machine-readable command, so this is the one place
 * where CLI output becomes state. Anything unexpected is dropped rather than
 * guessed.
 */
export function parseListJson(text: string): CliSkill[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("The skills CLI did not return a JSON list.");
  }
  if (!Array.isArray(parsed)) return [];

  const skills: CliSkill[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const name = asString(record.name);
    const path = asString(record.path);
    if (!name || !path) continue;
    skills.push({
      name,
      path,
      scope: record.scope === "global" ? "global" : "project",
      agents: Array.isArray(record.agents)
        ? record.agents.filter((a): a is string => typeof a === "string")
        : [],
      source: asString(record.source),
      sourceUrl: asString(record.sourceUrl),
      sourceType: asString(record.sourceType),
    });
  }
  return skills;
}

async function listScope(run: Runner, args: string[], cwd?: string): Promise<CliSkill[]> {
  const result = await run(args, cwd);
  if (result.code !== 0) {
    const detail = (result.stderr.trim() || result.stdout.trim()).split("\n").pop();
    throw new Error(detail ?? `\`${result.commandLine}\` failed.`);
  }
  return parseListJson(result.stdout);
}

/** Project skills come from the selected directory, global skills from `$HOME`. */
export async function readInventory(run: Runner, projectRoot: string): Promise<CliSkill[]> {
  const [project, global] = await Promise.all([
    listScope(run, ["ls", "--json"], projectRoot),
    listScope(run, ["ls", "-g", "--json"]),
  ]);
  return [...project, ...global];
}
