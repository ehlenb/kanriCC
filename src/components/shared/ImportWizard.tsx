import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { IconUpload, IconArrowRight, IconCheck, IconTrash } from "@tabler/icons-react";

type EntityType = "clients" | "requisitions" | "candidates" | "processes";

const ENTITY_LABELS: Record<EntityType, string> = {
  clients: "Clients",
  requisitions: "Requisitions",
  candidates: "Candidates",
  processes: "Active processes",
};

const ENTITY_ORDER: EntityType[] = ["clients", "requisitions", "candidates", "processes"];

type HistoryRow = {
  id: string;
  entity_type: string;
  source_name: string | null;
  row_count: number;
  status: string;
  created_at: string;
};

export function ImportWizard() {
  const { user, teamId } = useAuth();
  const [entityType, setEntityType] = useState<EntityType>("clients");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [targetFields, setTargetFields] = useState<string[]>([]);
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [loadingMapping, setLoadingMapping] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceName, setSourceName] = useState("");

  async function loadHistory() {
    if (!teamId) return;
    try {
      const resp = await fetch(`/api/import?action=history&team_id=${teamId}`);
      const data = (await resp.json()) as { data?: HistoryRow[] };
      setHistory(data.data ?? []);
    } catch {
      // non-blocking
    }
  }

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  function handleFile(file: File) {
    setSourceName(file.name);
    Papa.parse(file, {
      complete: (parsed) => {
        const data = parsed.data as string[][];
        if (!data.length) {
          toast.error("Could not read that file. Is it a CSV?");
          return;
        }
        const [headerRow, ...rest] = data;
        setHeaders(headerRow);
        setRows(rest.filter((r) => r.some((c) => c?.trim())));
        void fetchMapping(headerRow, rest);
      },
      error: () => toast.error("Could not read that file. Is it a CSV?"),
    });
  }

  async function fetchMapping(headerRow: string[], sampleRows: string[][]) {
    setLoadingMapping(true);
    try {
      const resp = await fetch("/api/import?action=suggest-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          headers: headerRow,
          sample_rows: sampleRows.slice(0, 3),
        }),
      });
      const data = (await resp.json()) as {
        data?: { mapping: Record<string, string>; target_fields: string[] };
      };
      setMapping(data.data?.mapping ?? {});
      setTargetFields(data.data?.target_fields ?? []);
      setStep("map");
    } catch {
      toast.error("Could not suggest a column mapping. Map columns manually.");
      setStep("map");
    } finally {
      setLoadingMapping(false);
    }
  }

  async function handleCommit() {
    if (!user?.id || !teamId) return;
    setCommitting(true);
    try {
      const mappedRows = rows.map((row) => {
        const obj: Record<string, string> = {};
        for (const field of targetFields) {
          const sourceCol = mapping[field];
          if (!sourceCol) continue;
          const colIndex = headers.indexOf(sourceCol);
          if (colIndex >= 0) obj[field] = row[colIndex] ?? "";
        }
        return obj;
      });

      const resp = await fetch("/api/import?action=commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          recruiter_id: user.id,
          team_id: teamId,
          source_name: sourceName,
          rows: mappedRows,
        }),
      });
      const data = (await resp.json()) as {
        data?: { inserted_count: number; skipped_count: number };
        error?: string;
      };
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setResult({
        inserted: data.data?.inserted_count ?? 0,
        skipped: data.data?.skipped_count ?? 0,
      });
      setStep("done");
      void loadHistory();
    } catch {
      toast.error("Import failed. Try again.");
    } finally {
      setCommitting(false);
    }
  }

  async function handleRollback(batchId: string) {
    if (!user?.id) return;
    try {
      const resp = await fetch("/api/import?action=rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId, recruiter_id: user.id }),
      });
      const data = (await resp.json()) as { error?: string };
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success("Import rolled back.");
      void loadHistory();
    } catch {
      toast.error("Could not roll back that import.");
    }
  }

  function reset() {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setTargetFields([]);
    setStep("upload");
    setResult(null);
    setSourceName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div
      className="p-6"
      style={{ background: "var(--color-white)", border: "1px solid var(--color-ink-15)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <IconUpload size={15} style={{ color: "var(--color-ink-60)" }} />
        <h2 className="font-display text-base">Import data</h2>
      </div>
      <p className="text-[12px] mb-6" style={{ color: "var(--color-ink-60)" }}>
        Bring your current clients, requisitions, candidates, and active processes in from your
        existing ATS export (CSV). Import in this order: clients, then requisitions, then
        candidates, then processes.
      </p>

      {step === "upload" && (
        <div className="space-y-4">
          <div>
            <label className="label block mb-1">Entity type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType)}
              className="w-full"
            >
              {ENTITY_ORDER.map((et) => (
                <option key={et} value={et}>
                  {ENTITY_LABELS[et]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-1">CSV file</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
          {loadingMapping && (
            <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
              Suggesting a column mapping…
            </p>
          )}
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
            {rows.length} rows found in {sourceName}. Review the suggested mapping below and
            adjust any field before importing.
          </p>
          <div className="space-y-2">
            {targetFields.map((field) => (
              <div key={field} className="flex items-center gap-3">
                <span className="text-[12px] font-mono w-48" style={{ color: "var(--color-ink-60)" }}>
                  {field}
                </span>
                <IconArrowRight size={13} style={{ color: "var(--color-ink-30)" }} />
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                  className="flex-1"
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-accent btn-sm" onClick={() => void handleCommit()} disabled={committing}>
              {committing ? "Importing…" : `Import ${rows.length} rows`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reset} disabled={committing}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-3">
          <p className="text-[13px] flex items-center gap-1.5" style={{ color: "var(--color-moss)" }}>
            <IconCheck size={14} /> Imported {result.inserted} {ENTITY_LABELS[entityType].toLowerCase()}
            {result.skipped > 0 ? ` (${result.skipped} skipped — likely duplicates or missing links)` : ""}.
          </p>
          <button className="btn btn-outline btn-sm" onClick={reset}>
            Import another file
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--color-ink-15)" }}>
          <p className="label mb-2">Import history</p>
          <div className="space-y-1">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-[12px] py-1">
                <span style={{ color: h.status === "rolled_back" ? "var(--color-ink-30)" : "var(--color-ink)" }}>
                  {ENTITY_LABELS[h.entity_type as EntityType] ?? h.entity_type} — {h.row_count} rows
                  {h.source_name ? ` (${h.source_name})` : ""}
                  {h.status === "rolled_back" ? " — rolled back" : ""}
                </span>
                {h.status !== "rolled_back" && (
                  <button
                    className="btn btn-ghost btn-sm flex items-center gap-1"
                    onClick={() => void handleRollback(h.id)}
                    style={{ color: "var(--color-vermillion)" }}
                  >
                    <IconTrash size={12} /> Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
