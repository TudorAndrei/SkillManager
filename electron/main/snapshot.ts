import type { EnrichedSkill } from "./read/collect.ts";
import type { ProjectRow } from "./read/projects.ts";

/**
 * The state the renderer draws. The field names match the `Snapshot` type that
 * `frontend/src/App.tsx` already declares, so the view code did not change when
 * the engine changed.
 */
export interface SkillRow {
  id: string;
  name: string;
  description: string;
  scope: "Project" | "Global";
  scopeVariant: string;
  agent: string;
  path: string;
  source: string;
  visible: boolean;
  active: boolean;
}

export interface SkillDetail {
  name: string;
  description: string;
  scope: string;
  scopeVariant: string;
  agent: string;
  path: string;
  source: string;
  managed: boolean;
  hash: string;
  updatedAt: string;
}

export interface Snapshot {
  projects: ProjectRow[];
  projectRoot: string;
  skills: SkillRow[];
  /** Agent names the CLI reported, for the sidebar filter. */
  agents: string[];
  counts: { total: number; project: number; global: number; visible: number };
  filters: { search: string; scope: string; agent: string };
  active: string | null;
  detail: SkillDetail | null;
  status: string;
  operation: { inProgress: boolean; label: string };
  error: { title: string; detail: string } | null;
}

export interface SnapshotInput {
  projects: ProjectRow[];
  projectRoot: string;
  skills: EnrichedSkill[];
  filters: { search: string; scope: string; agent: string };
  active: string | null;
  status: string;
  operation?: { inProgress: boolean; label: string };
  error?: { title: string; detail: string } | null;
}

export const UNMANAGED_SOURCE = "unmanaged";

export function skillId(skill: EnrichedSkill): string {
  return `${skill.cli.scope}:${skill.cli.name}`;
}

function displayName(skill: EnrichedSkill): string {
  return skill.manifest.name ?? skill.cli.name;
}

function description(skill: EnrichedSkill): string {
  return skill.manifest.description ?? "No description in SKILL.md";
}

function source(skill: EnrichedSkill): string {
  return skill.lock?.source ?? skill.cli.source ?? UNMANAGED_SOURCE;
}

function agentSummary(agents: string[]): string {
  if (agents.length === 0) return "no agent link";
  if (agents.length === 1) return agents[0];
  return `${agents.length} agents`;
}

function matchesSearch(skill: EnrichedSkill, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle.length === 0) return true;
  const haystack = [
    displayName(skill),
    skill.cli.name,
    description(skill),
    source(skill),
    skill.cli.path,
    ...skill.cli.agents,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function matchesScope(skill: EnrichedSkill, scope: string): boolean {
  return scope === "all" || skill.cli.scope === scope;
}

function matchesAgent(skill: EnrichedSkill, agent: string): boolean {
  return agent === "all" || skill.cli.agents.includes(agent);
}

/** Every agent name the CLI reported, sorted, for the sidebar filter. */
export function agentNames(skills: EnrichedSkill[]): string[] {
  const names = new Set<string>();
  for (const skill of skills) for (const agent of skill.cli.agents) names.add(agent);
  return [...names].sort((a, b) => a.localeCompare(b));
}

function toDetail(skill: EnrichedSkill): SkillDetail {
  return {
    name: displayName(skill),
    description: description(skill),
    scope: skill.cli.scope === "global" ? "Global" : "Project",
    scopeVariant: skill.cli.scope === "global" ? "primary" : "secondary",
    agent: skill.cli.agents.length > 0 ? skill.cli.agents.join(", ") : "no agent link",
    path: skill.cli.path,
    source: source(skill),
    managed: skill.lock !== null,
    hash: skill.lock?.hash ?? "",
    updatedAt: skill.lock?.updatedAt ?? skill.lock?.installedAt ?? "",
  };
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const rows: SkillRow[] = [];
  let projectCount = 0;
  let globalCount = 0;
  let visibleCount = 0;

  for (const skill of input.skills) {
    if (skill.cli.scope === "global") globalCount += 1;
    else projectCount += 1;

    const visible =
      matchesScope(skill, input.filters.scope) &&
      matchesAgent(skill, input.filters.agent) &&
      matchesSearch(skill, input.filters.search);
    if (visible) visibleCount += 1;

    const id = skillId(skill);
    rows.push({
      id,
      name: displayName(skill),
      description: description(skill),
      scope: skill.cli.scope === "global" ? "Global" : "Project",
      scopeVariant: skill.cli.scope === "global" ? "primary" : "secondary",
      agent: agentSummary(skill.cli.agents),
      path: skill.cli.path,
      source: source(skill),
      visible,
      active: id === input.active,
    });
  }

  const activeSkill = input.skills.find((skill) => skillId(skill) === input.active) ?? null;

  return {
    projects: input.projects,
    projectRoot: input.projectRoot,
    skills: rows,
    agents: agentNames(input.skills),
    counts: {
      total: rows.length,
      project: projectCount,
      global: globalCount,
      visible: visibleCount,
    },
    filters: input.filters,
    active: activeSkill ? input.active : null,
    detail: activeSkill ? toDetail(activeSkill) : null,
    status: input.status,
    operation: input.operation ?? { inProgress: false, label: "Idle" },
    error: input.error ?? null,
  };
}

export function emptySnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    projects: [],
    projectRoot: ".",
    skills: [],
    agents: [],
    counts: { total: 0, project: 0, global: 0, visible: 0 },
    filters: { search: "", scope: "all", agent: "all" },
    active: null,
    detail: null,
    status: "Ready",
    operation: { inProgress: false, label: "Idle" },
    error: null,
    ...overrides,
  };
}
