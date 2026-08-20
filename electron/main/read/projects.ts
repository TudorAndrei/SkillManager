import { readdir, access } from "node:fs/promises";
import { basename, dirname, join, parse } from "node:path";
import { PROJECT_LOCK_FILE } from "./locks.ts";

export interface ProjectRow {
  path: string;
  name: string;
}

/** Legacy name that the CLI still recognises in older projects. */
const LEGACY_LOCK_FILE = "skills.lock";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function hasProjectLock(directory: string): Promise<boolean> {
  return (
    (await exists(join(directory, PROJECT_LOCK_FILE))) ||
    (await exists(join(directory, LEGACY_LOCK_FILE)))
  );
}

function ancestors(startDir: string): string[] {
  const chain: string[] = [];
  const root = parse(startDir).root;
  let current = startDir;
  while (current !== root) {
    chain.push(current);
    current = dirname(current);
  }
  return chain;
}

async function siblingProjects(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const candidate = join(directory, entry.name);
    if (await hasProjectLock(candidate)) found.push(candidate);
  }
  return found;
}

/**
 * Find the projects the user is likely to manage: the launch directory, any
 * ancestor that holds a lock file, and the directories beside the launch
 * directory that hold one. The launch directory is always first, so the app has
 * a project root even before any skill is installed.
 */
export async function discoverProjects(startDir: string): Promise<ProjectRow[]> {
  const ordered: string[] = [startDir];

  const chain = ancestors(startDir);
  const locked: string[] = [];
  for (const directory of chain) {
    if (await hasProjectLock(directory)) locked.push(directory);
  }
  ordered.push(...locked);

  // Repositories that sit beside the launch directory, which is where a user
  // keeps their other checkouts.
  ordered.push(...(await siblingProjects(dirname(startDir))));

  const seen = new Set<string>();
  const projects: ProjectRow[] = [];
  for (const path of ordered) {
    if (seen.has(path)) continue;
    seen.add(path);
    projects.push({ path, name: basename(path) || path });
  }
  return projects;
}
