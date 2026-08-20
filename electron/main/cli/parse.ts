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
export function collapseProgress(text: string): string {
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
