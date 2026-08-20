import { useState } from "react";
import { CloudDownload, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type FoundSkill = { slug: string; installs: string; url: string };

/**
 * `skills find` over skills.sh. The CLI prints human text, so a result that
 * does not parse is shown as the CLI wrote it rather than hidden.
 */
export function FindDialog({
  open,
  busy,
  results,
  output,
  onOpenChange,
  onSearch,
  onInstall,
}: {
  open: boolean;
  busy: boolean;
  results: FoundSkill[];
  output: string;
  onOpenChange: (open: boolean) => void;
  onSearch: (query: string, owner: string) => void;
  onInstall: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");

  const search = () => {
    if (query.trim().length > 0) onSearch(query.trim(), owner.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="skill-picker-dialog">
        <DialogHeader>
          <DialogTitle>Find skills</DialogTitle>
          <DialogDescription>
            Search skills.sh with the bundled CLI, then install one with the same CLI.
          </DialogDescription>
        </DialogHeader>
        <div className="find-form">
          <Input
            aria-label="Search query"
            value={query}
            placeholder="typescript"
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") search();
            }}
          />
          <Input
            aria-label="Owner filter"
            value={owner}
            placeholder="owner (optional)"
            disabled={busy}
            onChange={(event) => setOwner(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") search();
            }}
          />
          <Button variant="secondary" disabled={busy || query.trim().length === 0} onClick={search}>
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />}
            SEARCH
          </Button>
        </div>
        <div className="skill-picker-list">
          {results.map((result) => (
            <button
              type="button"
              className="skill-picker-option"
              key={result.slug}
              disabled={busy}
              onClick={() => onInstall(result.slug)}
            >
              <span className="skill-picker-icon">
                <CloudDownload size={17} />
              </span>
              <span className="skill-picker-copy">
                <strong>{result.slug}</strong>
                <code>{result.installs}</code>
              </span>
            </button>
          ))}
          {results.length === 0 && output.trim().length > 0 && (
            <pre className="find-raw">{output.trim()}</pre>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
