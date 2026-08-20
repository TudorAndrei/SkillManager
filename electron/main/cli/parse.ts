const ESC = String.fromCharCode(27);
const BELL = String.fromCharCode(7);

/** CSI sequences (colour, cursor moves) and OSC sequences (window titles, links). */
const ANSI_PATTERN = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BELL}]*(?:${BELL}|${ESC}\\\\)|${ESC}[@-Z\\\\-_]`,
  "g",
);

/** Remove colour and cursor sequences so output is readable and comparable. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/**
 * Collapse spinner frames. The CLI redraws one line with carriage returns, which
 * would otherwise fill the console panel with hundreds of duplicate lines.
 */
function collapseProgress(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const frames = line.split("\r");
      return frames[frames.length - 1] ?? line;
    })
    .join("\n");
}

/** Readable text for the console panel and for error messages. */
export function cleanOutput(text: string): string {
  return collapseProgress(stripAnsi(text));
}

/** Render an argument list the way a user would type it in a terminal. */
export function formatCommandLine(args: string[]): string {
  const quoted = args.map((arg) =>
    /[\s"'*$`\\|&;<>()]/.test(arg) || arg.length === 0 ? `'${arg.replace(/'/g, `'\\''`)}'` : arg,
  );
  return ["skills", ...quoted].join(" ");
}

export interface RepoSkill {
  name: string;
  description: string;
}

const SKILL_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Read the candidate list of `skills add <source> -l`.
 *
 * This output is human text, so it is used only to offer a choice. What is
 * installed always comes from `ls --json` afterwards. A format change makes
 * this return nothing, and the caller then shows the raw output instead.
 */
export function parseRepoSkills(text: string): RepoSkill[] {
  const skills: RepoSkill[] = [];
  for (const raw of cleanOutput(text).split("\n")) {
    const line = raw.replace(/^[│|]\s?/, "");
    const content = line.trim();
    if (content.length === 0) continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= 4) {
      if (SKILL_NAME.test(content)) skills.push({ name: content, description: "" });
      continue;
    }
    const current = skills[skills.length - 1];
    if (current === undefined) continue;
    current.description =
      current.description === "" ? content : `${current.description} ${content}`;
  }
  return skills;
}

export interface FoundSkill {
  /** `owner/repo@skill`, which is what `add` and `use` accept. */
  slug: string;
  installs: string;
  url: string;
}

const FIND_ROW = /^(\S+\/\S+@\S+)\s+(.*)$/;

/**
 * Read the results of `skills find`. Human text again, so it only offers
 * choices: installing one of them runs `add` and the list is then read back
 * from `ls --json`.
 */
export function parseFindResults(text: string): FoundSkill[] {
  const found: FoundSkill[] = [];
  for (const raw of cleanOutput(text).split("\n")) {
    const line = raw.trim();
    const row = FIND_ROW.exec(line);
    if (row !== null) {
      found.push({ slug: row[1], installs: row[2].trim(), url: "" });
      continue;
    }
    const current = found[found.length - 1];
    if (current === undefined || !line.startsWith("└")) continue;
    current.url = line.slice(1).trim();
  }
  return found;
}

/** The valid agent identifiers, which the CLI prints when one is rejected. */
export function parseValidAgents(text: string): string[] {
  const line = cleanOutput(text)
    .split("\n")
    .find((candidate) => candidate.includes("Valid agents:"));
  if (line === undefined) return [];
  return line
    .slice(line.indexOf("Valid agents:") + "Valid agents:".length)
    .split(",")
    .map((agent) => agent.trim())
    .filter((agent) => agent.length > 0);
}
