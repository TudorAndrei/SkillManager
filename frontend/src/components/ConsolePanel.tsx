import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Eraser, SquareTerminal, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConsoleLine = { id: number; stream: "stdout" | "stderr"; text: string };

/**
 * Shows the exact command that runs and the output it produces. The CLI is the
 * engine, so the user can always see what the app asked it to do.
 */
export function ConsolePanel({
  lines,
  open,
  busy,
  onToggle,
  onClear,
  onCancel,
}: {
  lines: ConsoleLine[];
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [lines, open]);

  const last = lines[lines.length - 1];

  return (
    <section className={cn("console-panel", open && "open")} aria-label="Skills CLI output">
      <header className="console-bar">
        <button type="button" className="console-toggle" onClick={onToggle}>
          <SquareTerminal size={14} />
          <span>SKILLS CLI</span>
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        {!open && (
          <code className="console-preview">{last?.text.trim() ?? "No command has run yet"}</code>
        )}
        <div className="console-actions">
          {busy && (
            <button type="button" onClick={onCancel} title="Cancel the running command">
              <X size={13} /> CANCEL
            </button>
          )}
          <button type="button" onClick={onClear} title="Clear the output">
            <Eraser size={13} /> CLEAR
          </button>
        </div>
      </header>
      {open && (
        <div className="console-output" role="log" aria-live="polite">
          {lines.length === 0 ? (
            <span className="console-empty">No command has run yet.</span>
          ) : (
            lines.map((line) => (
              <pre
                key={line.id}
                className={cn("console-line", line.stream === "stderr" && "error")}
              >
                {line.text}
              </pre>
            ))
          )}
          <div ref={endRef} />
        </div>
      )}
    </section>
  );
}
