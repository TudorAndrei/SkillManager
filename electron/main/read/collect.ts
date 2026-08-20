import { readInventory, type CliSkill, type Runner } from "./inventory.ts";
import { readGlobalLock, readProjectLock, type LockEntry, type LockFile } from "./locks.ts";
import { readSkillManifest, type SkillManifest } from "./manifest.ts";

export interface EnrichedSkill {
  cli: CliSkill;
  manifest: SkillManifest;
  /** Null when the CLI did not record this skill. It is then unmanaged. */
  lock: LockEntry | null;
}

export interface Inventory {
  skills: EnrichedSkill[];
  projectLock: LockFile;
  globalLock: LockFile;
}

/**
 * Collect what the app shows: the CLI's own list, the lock entry for each skill,
 * and the description from the installed SKILL.md.
 *
 * A skill with no lock entry stays in the list and is reported as unmanaged. On
 * this machine `~/.agents/skills` holds far more directories than the global
 * lock records, and hiding them would misreport what the agents can load.
 */
export async function collectInventory(
  run: Runner,
  projectRoot: string,
  home: string,
): Promise<Inventory> {
  const [cliSkills, projectLock, globalLock] = await Promise.all([
    readInventory(run, projectRoot),
    readProjectLock(projectRoot),
    readGlobalLock(home),
  ]);

  const skills = await Promise.all(
    cliSkills.map(async (cli) => ({
      cli,
      manifest: await readSkillManifest(cli.path),
      lock: (cli.scope === "global" ? globalLock : projectLock).entries.get(cli.name) ?? null,
    })),
  );

  return { skills, projectLock, globalLock };
}
