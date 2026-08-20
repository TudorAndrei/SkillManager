/**
 * One builder per command. These are the only place where flags are chosen, so
 * the rules that keep a child process non-interactive stay in one file:
 *
 * - `-y` on every command that can prompt;
 * - explicit `--skill` and `--agent`, so the CLI never asks which ones;
 * - `-g` for global scope; project scope is the default and uses the working
 *   directory instead.
 */

export type Scope = "project" | "global";

export interface AddRequest {
  source: string;
  /** Skill names, or `*` for every skill in the repository. */
  skills: string[];
  /** Agent identifiers, or `*` for every agent. */
  agents: string[];
  scope: Scope;
}

export interface SkillRequest {
  skill: string;
  scope: Scope;
}

/** The CLI rejects this name and answers with the list of valid agents. */
export const AGENT_PROBE = "__skillmanager_probe__";

function scopeFlags(scope: Scope, projectFlag: string | null): string[] {
  if (scope === "global") return ["-g"];
  return projectFlag === null ? [] : [projectFlag];
}

export function addArgs(request: AddRequest): string[] {
  const args = ["add", request.source, "-y"];
  if (request.skills.length > 0) args.push("--skill", ...request.skills);
  if (request.agents.length > 0) args.push("--agent", ...request.agents);
  return [...args, ...scopeFlags(request.scope, null)];
}

export function removeArgs(request: SkillRequest): string[] {
  return ["remove", "-y", "-s", request.skill, ...scopeFlags(request.scope, null)];
}

export function updateArgs(request: SkillRequest): string[] {
  return ["update", request.skill, "-y", ...scopeFlags(request.scope, "-p")];
}

/** List the skills of a repository without installing anything. */
export function repoSkillsArgs(source: string): string[] {
  return ["add", source, "-l"];
}

export function validAgentsArgs(): string[] {
  return ["ls", "-a", AGENT_PROBE];
}

/**
 * `ls --json` reports display names such as `Claude Code`, while `--agent`
 * expects identifiers such as `claude-code`. Match on the normalised form and
 * keep the CLI's own spelling.
 */
export function agentIdentifier(displayName: string, validAgents: string[]): string {
  const normalise = (value: string) => value.toLowerCase().replace(/[\s_]+/g, "-");
  const wanted = normalise(displayName);
  return validAgents.find((agent) => normalise(agent) === wanted) ?? wanted;
}
