import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { asNumber, asObject, asText, entriesOf, parseJson, type JsonValue } from "./json.ts";

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
const GLOBAL_LOCK_FILE = join(".agents", ".skill-lock.json");
const SUPPORTED_PROJECT_LOCK_VERSION = 1;
const SUPPORTED_GLOBAL_LOCK_VERSION = 3;

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

function toEntry(name: string, value: JsonValue): LockEntry | null {
  const record = asObject(value);
  if (record === null) return null;
  return {
    name,
    source: asText(record.source),
    sourceType: asText(record.sourceType),
    sourceUrl: asText(record.sourceUrl),
    skillPath: asText(record.skillPath),
    // The project schema names the hash `computedHash`, the global one
    // `skillFolderHash`. Both hold the same folder digest.
    hash: asText(record.computedHash) ?? asText(record.skillFolderHash),
    installedAt: asText(record.installedAt),
    updatedAt: asText(record.updatedAt),
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

  const record = asObject(parseJson(raw));
  if (record === null) return emptyLock(path);

  const version = asNumber(record.version);
  const entries = new Map<string, LockEntry>();
  for (const [name, value] of entriesOf(record.skills)) {
    const entry = toEntry(name, value);
    if (entry !== null) entries.set(name, entry);
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
