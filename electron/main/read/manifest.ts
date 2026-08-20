import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface SkillManifest {
  name: string | null;
  description: string | null;
}

const EMPTY: SkillManifest = { name: null, description: null };

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

/**
 * Read the `name` and `description` fields of a SKILL.md front matter block.
 *
 * `ls --json` does not return the description, so the application reads the file
 * the CLI installed. This is display metadata only: it never decides state.
 */
export function parseFrontmatter(raw: string): SkillManifest {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return EMPTY;

  const end = text.indexOf("\n---", 3);
  if (end === -1) return EMPTY;

  const block = text.slice(text.indexOf("\n") + 1, end);
  const manifest: SkillManifest = { name: null, description: null };
  for (const line of block.split("\n")) {
    // Nested keys such as `metadata: author:` are indented; only read top level.
    if (/^\s/.test(line)) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1));
    if (key === "name" && value.length > 0) manifest.name = value;
    if (key === "description" && value.length > 0) manifest.description = value;
  }
  return manifest;
}

export async function readSkillManifest(skillDir: string): Promise<SkillManifest> {
  try {
    return parseFrontmatter(await readFile(join(skillDir, "SKILL.md"), "utf8"));
  } catch {
    return EMPTY;
  }
}
