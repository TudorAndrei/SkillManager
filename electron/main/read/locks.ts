import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Lock files are read-only here. The CLI writes them; this application only
 * reports what they say.
 *
 * The two scopes use different schemas:
 * - project: `<project>/skills-lock.json`, version 1, hash field `computedHash`;
 * - global:  `~/.agents/.skill-lock.json`, version 3, hash field `skillFolderHash`,
 *   plus `installedAt`, `updatedAt`, and an optional `pluginName`.
 */
export const PROJECT_LOCK_FILE = "skills-lock.json";
export const GLOBAL_LOCK_FILE = join(".agents", ".skill-lock.json");
export const SUPPORTED_PROJECT_LOCK_VERSION = 1;
export const SUPPORTED_GLOBAL_LOCK_VERSION = 3;

export interface LockEntry {
  name: string;
  source: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  skillPath: string | null;
  hash: string | null;
  installedAt: string | null;
  updatedAt: string | null;
}

export interface LockFile {
  path: string;
  version: number | null;
  /** True when the file exists but its version is newer than this build knows. */
  unknownVersion: boolean;
  entries: Map<string, LockEntry>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toEntry(name: string, value: unknown): LockEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return {
    name,
    source: asString(record.source),
    sourceType: asString(record.sourceType),
    sourceUrl: asString(record.sourceUrl),
    skillPath: asString(record.skillPath),
    hash: asString(record.computedHash) ?? asString(record.skillFolderHash),
    installedAt: asString(record.installedAt),
    updatedAt: asString(record.updatedAt),
  };
}

function emptyLock(path: string): LockFile {
  return { path, version: null, unknownVersion: false, entries: new Map() };
}

async function readLock(path: string, supportedVersion: number): Promise<LockFile> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    // No lock file means nothing is recorded yet, which is a normal state.
    return emptyLock(path);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyLock(path);
  }
  if (typeof parsed !== "object" || parsed === null) return emptyLock(path);

  const record = parsed as Record<string, unknown>;
  const version = typeof record.version === "number" ? record.version : null;
  const entries = new Map<string, LockEntry>();
  const skills = record.skills;
  if (typeof skills === "object" && skills !== null) {
    for (const [name, value] of Object.entries(skills)) {
      const entry = toEntry(name, value);
      if (entry) entries.set(name, entry);
    }
  }

  return {
    path,
    version,
    unknownVersion: version !== null && version > supportedVersion,
    entries,
  };
}

export function readProjectLock(projectRoot: string): Promise<LockFile> {
  return readLock(join(projectRoot, PROJECT_LOCK_FILE), SUPPORTED_PROJECT_LOCK_VERSION);
}

export function readGlobalLock(home: string): Promise<LockFile> {
  return readLock(join(home, GLOBAL_LOCK_FILE), SUPPORTED_GLOBAL_LOCK_VERSION);
}
