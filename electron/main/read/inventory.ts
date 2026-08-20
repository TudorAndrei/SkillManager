import type { RunResult } from "../cli/run.ts";
import { asObject, asText, asTextList, parseJson } from "./json.ts";

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

/**
 * `ls --json` is the only machine-readable command, so this is the one place
 * where CLI output becomes state. Anything unexpected is dropped rather than
 * guessed.
 */
export function parseListJson(text: string): CliSkill[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const parsed = parseJson(trimmed);
  if (parsed === null) throw new Error("The skills CLI did not return a JSON list.");
  if (!Array.isArray(parsed)) return [];

  const skills: CliSkill[] = [];
  for (const item of parsed) {
    const record = asObject(item);
    if (record === null) continue;
    const name = asText(record.name);
    const path = asText(record.path);
    if (name === null || path === null) continue;
    skills.push({
      name,
      path,
      scope: record.scope === "global" ? "global" : "project",
      agents: asTextList(record.agents),
      source: asText(record.source),
      sourceUrl: asText(record.sourceUrl),
      sourceType: asText(record.sourceType),
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
