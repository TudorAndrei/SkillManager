import { useState } from "react";
import { FilePlus2, FolderSync, History } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * The project-wide CLI commands: `experimental_install` to restore a project
 * from its lock file, `experimental_sync` to link skills from `node_modules`,
 * and `init` to create a new skill.
 */
export function ProjectActions({
  busy,
  onRestore,
  onSync,
  onInit,
}: {
  busy: boolean;
  onRestore: () => void;
  onSync: () => void;
  onInit: (name: string) => void;
}) {
  const [name, setName] = useState("");

  const create = () => {
    const wanted = name.trim();
    if (wanted.length === 0) return;
    setName("");
    onInit(wanted);
  };

  return (
    <>
      <button type="button" className="agent-button" disabled={busy} onClick={onRestore}>
        <History size={15} />
        <span>Restore from lock</span>
        <code>install</code>
      </button>
      <button type="button" className="agent-button" disabled={busy} onClick={onSync}>
        <FolderSync size={15} />
        <span>Sync node_modules</span>
        <code>sync</code>
      </button>
      <div className="init-row">
        <Input
          aria-label="New skill name"
          value={name}
          placeholder="new-skill-name"
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create();
          }}
        />
        <button
          type="button"
          className="init-button"
          title="Create a new skill"
          disabled={busy || name.trim().length === 0}
          onClick={create}
        >
          <FilePlus2 size={15} />
        </button>
      </div>
    </>
  );
}
