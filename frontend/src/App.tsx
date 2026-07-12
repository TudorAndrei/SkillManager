import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDot,
  CloudDownload,
  Code2,
  Command,
  FileCode2,
  FolderOpen,
  Globe2,
  Layers3,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Skill = {
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
};

type Snapshot = {
  projects: Project[];
  projectRoot: string;
  skills: Skill[];
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
};

type Scope = "all" | "project" | "global";
type Agent = "all" | "codex" | "cursor" | "claude-code";
type Project = { path: string; name: string };

type SkillCandidate = { path: string; name: string };
type PendingInstall = { source: string; scope: Scope; agent: string };

type DiscoveryResult = { candidates: SkillCandidate[] };

declare global {
  interface Window {
    zero?: {
      invoke: (command: string, payload?: unknown) => Promise<unknown>;
    };
  }
}

const emptySnapshot: Snapshot = {
  projects: [],
  projectRoot: ".",
  skills: [],
  counts: { total: 0, project: 0, global: 0, visible: 0 },
  filters: { search: "", scope: "all", agent: "codex" },
  active: null,
  detail: null,
  status: "Connecting to native engine...",
  operation: { inProgress: false, label: "Idle" },
  error: null,
};

const activity = [
  {
    icon: ShieldCheck,
    title: "Embedded engine",
    detail: "Filesystem and GitHub operations stay inside the native process.",
  },
  {
    icon: TerminalSquare,
    title: "Bridge connected",
    detail: "React is talking to the Zig model through Native SDK policy checks.",
  },
  {
    icon: Sparkles,
    title: "Ready state",
    detail: "The inventory is sourced from discovered SKILL.md manifests.",
  },
];

function isRemoteSource(value: string) {
  const source = value.trim();
  return (
    source.startsWith("https://github.com/") ||
    (!source.startsWith(".") &&
      !source.startsWith("/") &&
      !source.startsWith("~") &&
      source.split("/").length >= 2)
  );
}

function useNativeBridge() {
  const request = useCallback(async function request<T = Snapshot>(
    command: string,
    payload?: unknown,
  ): Promise<T> {
    if (!window.zero?.invoke)
      throw new Error("Native bridge unavailable. Start the app with native dev.");
    return (await window.zero.invoke(command, payload)) as T;
  }, []);
  return request;
}

export default function App() {
  const request = useNativeBridge();
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("vercel-labs/agent-skills");
  const [skillPath, setSkillPath] = useState("");
  const [installScope, setInstallScope] = useState<Scope>("project");
  const [busy, setBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState("");
  const [candidates, setCandidates] = useState<SkillCandidate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingInstall, setPendingInstall] = useState<PendingInstall | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchSequence = useRef(0);

  const applySnapshot = useCallback((next: Snapshot) => {
    setSnapshot(next);
    setQuery(next.filters.search);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setBridgeError("");
      applySnapshot(await request("skillmanager.snapshot", {}));
    } catch (error) {
      setBridgeError(error instanceof Error ? error.message : "Native bridge unavailable.");
    }
  }, [applySnapshot, request]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const sequence = ++searchSequence.current;
    const timeout = window.setTimeout(async () => {
      try {
        const next = await request("skillmanager.search", { value: query });
        if (sequence === searchSequence.current) applySnapshot(next);
      } catch (error) {
        if (sequence === searchSequence.current)
          setBridgeError(error instanceof Error ? error.message : "Search failed.");
      }
    }, 110);
    return () => window.clearTimeout(timeout);
  }, [applySnapshot, query, request]);

  const run = useCallback(
    async (command: string, payload: unknown = {}) => {
      setBusy(true);
      setBridgeError("");
      try {
        applySnapshot(await request(command, payload));
      } catch (error) {
        setBridgeError(error instanceof Error ? error.message : "Native operation failed.");
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, request],
  );

  const visibleSkills = useMemo(
    () => snapshot.skills.filter((skill) => skill.visible),
    [snapshot.skills],
  );
  const activeDetail = snapshot.detail;

  const chooseScope = (scope: Scope) => void run("skillmanager.scope", { value: scope });
  const chooseAgent = (agent: Agent) => void run("skillmanager.agent", { value: agent });
  const chooseProject = (path: string) => void run("skillmanager.project", { path });

  const selectedInstallAgent = snapshot.filters.agent === "all" ? "codex" : snapshot.filters.agent;

  const install = async () => {
    const installSource = source.trim();
    const installPath = skillPath.trim();
    const payload = {
      source: installSource,
      skill: installPath,
      scope: installScope,
      agent: selectedInstallAgent,
    };

    if (installPath || !isRemoteSource(installSource)) {
      await run("skillmanager.install", payload);
      return;
    }

    setBusy(true);
    setBridgeError("");
    try {
      const result = await request<DiscoveryResult>("skillmanager.discover", {
        source: installSource,
      });
      if (result.candidates.length === 1) {
        setSkillPath(result.candidates[0].path);
        await run("skillmanager.install", { ...payload, skill: result.candidates[0].path });
      } else if (result.candidates.length > 1) {
        setCandidates(result.candidates);
        setPendingInstall({
          source: installSource,
          scope: installScope,
          agent: selectedInstallAgent,
        });
        setPickerOpen(true);
      } else {
        await run("skillmanager.install", payload);
      }
    } catch (error) {
      setBridgeError(
        error instanceof Error ? error.message : "Could not inspect repository skills.",
      );
    } finally {
      setBusy(false);
    }
  };

  const closePicker = () => {
    setPickerOpen(false);
    setPendingInstall(null);
    setCandidates([]);
  };

  const installCandidate = (candidate: SkillCandidate) => {
    if (!pendingInstall) return;
    setSkillPath(candidate.path);
    const payload = {
      source: pendingInstall.source,
      skill: candidate.path,
      scope: pendingInstall.scope,
      agent: pendingInstall.agent,
    };
    closePicker();
    void run("skillmanager.install", payload);
  };

  return (
    <>
      <main className="app-shell">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Layers3 size={17} strokeWidth={2.2} />
            </div>
            <div>
              <div className="brand-name">SKILLMANAGER</div>
              <div className="brand-meta">
                NATIVE CONTROL SURFACE <span>01</span>
              </div>
            </div>
          </div>
          <div className="topbar-divider" />
          <div className="command-search">
            <Search size={17} />
            <Input
              aria-label="Search skills"
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills, agents, descriptions..."
            />
            <kbd>
              <Command size={11} /> K
            </kbd>
          </div>
          <div className="topbar-actions">
            <Button
              size="icon"
              variant="ghost"
              title="Refresh inventory"
              disabled={busy}
              onClick={() => void run("skillmanager.refresh")}
            >
              <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
            </Button>
          </div>
        </header>

        <div className="workspace">
          <aside className="sidebar">
            <section className="sidebar-section">
              <SectionLabel index="01" label="PROJECTS" />
              {snapshot.projects.length > 0 ? (
                <Select value={snapshot.projectRoot} onValueChange={chooseProject}>
                  <SelectTrigger aria-label="Select project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.projects.map((project) => (
                      <SelectItem key={project.path} value={project.path}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline">No lockfile projects detected</Badge>
              )}
            </section>
            <section className="sidebar-section">
              <SectionLabel index="02" label="LIBRARY" />
              <ScopeButton
                icon={Layers3}
                label="All skills"
                count={snapshot.counts.total}
                active={snapshot.filters.scope === "all"}
                onClick={() => chooseScope("all")}
              />
              <ScopeButton
                icon={FolderOpen}
                label="Project"
                count={snapshot.counts.project}
                active={snapshot.filters.scope === "project"}
                onClick={() => chooseScope("project")}
              />
              <ScopeButton
                icon={Globe2}
                label="Global"
                count={snapshot.counts.global}
                active={snapshot.filters.scope === "global"}
                onClick={() => chooseScope("global")}
              />
            </section>

            <section className="sidebar-section">
              <SectionLabel index="03" label="AGENT TARGET" />
              <AgentButton
                icon={Bot}
                label="All agents"
                value="all"
                active={snapshot.filters.agent === "all"}
                onClick={() => chooseAgent("all")}
              />
              <AgentButton
                icon={Code2}
                label="Codex"
                value="codex"
                active={snapshot.filters.agent === "codex"}
                onClick={() => chooseAgent("codex")}
              />
              <AgentButton
                icon={TerminalSquare}
                label="Cursor"
                value="cursor"
                active={snapshot.filters.agent === "cursor"}
                onClick={() => chooseAgent("cursor")}
              />
              <AgentButton
                icon={Sparkles}
                label="Claude Code"
                value="claude-code"
                active={snapshot.filters.agent === "claude-code"}
                onClick={() => chooseAgent("claude-code")}
              />
            </section>

            <section className="sidebar-section install-section">
              <SectionLabel index="04" label="INSTALL SOURCE" />
              <label className="field-label" htmlFor="source">
                REPOSITORY OR PATH
              </label>
              <Input
                id="source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="owner/repository"
                disabled={busy}
              />
              <label className="field-label" htmlFor="skill-path">
                SKILL SUBPATH <span>OPTIONAL</span>
              </label>
              <Input
                id="skill-path"
                value={skillPath}
                onChange={(event) => setSkillPath(event.target.value)}
                placeholder="skills/my-skill"
                disabled={busy}
              />
              <div className="install-scope-toggle" role="group" aria-label="Install scope">
                <button
                  type="button"
                  className={installScope === "project" ? "selected" : ""}
                  onClick={() => setInstallScope("project")}
                >
                  PROJECT
                </button>
                <button
                  type="button"
                  className={installScope === "global" ? "selected" : ""}
                  onClick={() => setInstallScope("global")}
                >
                  GLOBAL
                </button>
              </div>
              <Button
                className="w-full"
                variant="secondary"
                disabled={busy || !source.trim()}
                onClick={() => void install()}
              >
                {busy ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <CloudDownload size={15} />
                )}
                INSTALL SKILL
              </Button>
            </section>

            <div className="sidebar-footer">
              <div className="root-line">
                <span>PROJECT ROOT</span>
                <code>{snapshot.projectRoot}</code>
              </div>
              <div className="root-line">
                <span>ENGINE</span>
                <code>EMBEDDED / ZIG</code>
              </div>
            </div>
          </aside>

          <section className="inventory-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" /> LIVE INVENTORY
                </div>
                <h1>
                  {snapshot.filters.scope === "all"
                    ? "Installed skills"
                    : `${snapshot.filters.scope} skills`}
                </h1>
              </div>
              <div className="heading-stats">
                <span>{snapshot.counts.visible.toString().padStart(2, "0")} MATCHES</span>
                <span className="heading-pulse">
                  <CircleDot size={12} /> SCANNED
                </span>
              </div>
            </div>

            {bridgeError && (
              <div className="alert-strip">
                <CircleAlert size={15} />
                <span>{bridgeError}</span>
                <button type="button" onClick={() => setBridgeError("")} title="Dismiss">
                  <X size={14} />
                </button>
              </div>
            )}
            {snapshot.error && (
              <div className="alert-strip">
                <CircleAlert size={15} />
                <span>
                  <strong>{snapshot.error.title}</strong> {snapshot.error.detail}
                </span>
              </div>
            )}

            <div className="inventory-list" aria-live="polite">
              {visibleSkills.length > 0 ? (
                visibleSkills.map((skill, index) => (
                  <SkillRow
                    key={skill.id}
                    skill={skill}
                    index={index}
                    selected={snapshot.active === skill.id}
                    onClick={() => void run("skillmanager.select", { id: skill.id })}
                  />
                ))
              ) : (
                <div className="empty-state">
                  <PackageCheck size={28} />
                  <p>
                    {snapshot.counts.total === 0
                      ? "No skills discovered"
                      : "No skills match this view"}
                  </p>
                  <span>
                    {snapshot.counts.total === 0
                      ? "Refresh after installing a skill or choose a known source."
                      : "Adjust the search, scope, or agent target."}
                  </span>
                </div>
              )}
            </div>
            <div className="panel-footer">
              <span>{snapshot.status}</span>
              <span className="mono">{snapshot.counts.total} TOTAL RECORDS</span>
            </div>
          </section>

          <aside className="detail-panel">
            {activeDetail ? (
              <>
                <div className="detail-header">
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> SELECTED MODULE
                  </div>
                  <Badge variant={activeDetail.scope === "Global" ? "success" : "default"}>
                    {activeDetail.scope}
                  </Badge>
                </div>
                <div className="detail-title-row">
                  <h2>{activeDetail.name}</h2>
                  <Check size={18} className="detail-check" />
                </div>
                <p className="detail-description">{activeDetail.description}</p>

                <Card className="metadata-card">
                  <CardHeader>
                    <CardTitle>MODULE METADATA</CardTitle>
                  </CardHeader>
                  <CardContent className="metadata-content">
                    <MetaRow label="AGENT" value={activeDetail.agent} />
                    <MetaRow label="PATH" value={activeDetail.path} mono />
                    <MetaRow label="SOURCE" value={activeDetail.source} mono />
                  </CardContent>
                </Card>

                <div className="detail-actions">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void run("skillmanager.update", { id: snapshot.active })}
                  >
                    <RefreshCw size={15} /> UPDATE
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void run("skillmanager.remove", { id: snapshot.active })}
                  >
                    <Trash2 size={15} /> REMOVE
                  </Button>
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <FileCode2 size={30} />
                <span>Select a skill to inspect its module data.</span>
              </div>
            )}

            <div className="activity-block">
              <div className="activity-heading">
                <span className="eyebrow">
                  <span className="eyebrow-line" /> ACTIVITY
                </span>
                <Activity size={15} />
              </div>
              <div className="activity-list">
                {activity.map(({ icon: Icon, title, detail }) => (
                  <div className="activity-item" key={title}>
                    <Icon size={15} />
                    <div>
                      <strong>{title}</strong>
                      <span>{detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => (open ? setPickerOpen(true) : closePicker())}
      >
        <DialogContent className="skill-picker-dialog">
          <DialogHeader>
            <DialogTitle>Choose a skill to install</DialogTitle>
            <DialogDescription>
              This repository contains multiple SKILL.md packages. Select the one you want to add.
            </DialogDescription>
          </DialogHeader>
          <div className="skill-picker-list">
            {candidates.map((candidate) => (
              <button
                type="button"
                className="skill-picker-option"
                key={candidate.path}
                onClick={() => installCandidate(candidate)}
              >
                <span className="skill-picker-icon">
                  <PackageCheck size={17} />
                </span>
                <span className="skill-picker-copy">
                  <strong>{candidate.name}</strong>
                  <code>{candidate.path}</code>
                </span>
                <ChevronRight size={16} className="skill-picker-arrow" />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closePicker}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionLabel({ index, label }: { index: string; label: string }) {
  return (
    <div className="section-label">
      <span>{index}</span>
      {label}
    </div>
  );
}

function ScopeButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof Layers3;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={cn("nav-button", active && "active")} onClick={onClick}>
      <Icon size={16} />
      <span>{label}</span>
      <Badge variant={active ? "default" : "secondary"}>{count}</Badge>
    </button>
  );
}

function AgentButton({
  icon: Icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={cn("agent-button", active && "active")} onClick={onClick}>
      <Icon size={15} />
      <span>{label}</span>
      <code>{value}</code>
    </button>
  );
}

function SkillRow({
  skill,
  index,
  selected,
  onClick,
}: {
  skill: Skill;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={cn("skill-row", selected && "selected")} onClick={onClick}>
      <span className="row-index">{(index + 1).toString().padStart(2, "0")}</span>
      <span className="row-main">
        <span className="row-title">
          {skill.name}
          <ChevronRight size={14} className="row-chevron" />
        </span>
        <span className="row-description">{skill.description}</span>
        <span className="row-agent">
          <Bot size={12} /> {skill.agent}
        </span>
      </span>
      <Badge variant={skill.scope === "Global" ? "success" : "outline"}>{skill.scope}</Badge>
    </button>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="meta-row">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}
