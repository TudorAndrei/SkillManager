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

export interface ProjectRow {
  path: string;
  name: string;
}

export interface Snapshot {
  projects: ProjectRow[];
  projectRoot: string;
  skills: SkillRow[];
  counts: { total: number; project: number; global: number; visible: number };
  filters: { search: string; scope: string; agent: string };
  active: string | null;
  detail: {
    name: string;
    description: string;
    scope: string;
    scopeVariant: string;
    agent: string;
    path: string;
    source: string;
  } | null;
  status: string;
  operation: { inProgress: boolean; label: string };
  error: { title: string; detail: string } | null;
}

export function emptySnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    projects: [],
    projectRoot: ".",
    skills: [],
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
