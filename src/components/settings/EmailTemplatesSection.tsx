import { useState } from "react";
import { toast } from "sonner";
import { IconFileText, IconPencil, IconTrash, IconPlus } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
  type EmailTemplate,
  type TemplateCategory,
  type TemplateVisibility,
} from "@/hooks/useEmailTemplates";

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  job_spec: "Email Job Spec",
  client: "Email Client",
  general: "General",
};

type Draft = {
  name: string;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  subject: string;
  body: string;
};

const EMPTY_DRAFT: Draft = { name: "", category: "general", visibility: "team", subject: "", body: "" };

function TemplateForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Draft;
  onSave: (d: Draft) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [d, setD] = useState<Draft>(initial);
  return (
    <div className="space-y-2 p-3" style={{ background: "var(--color-ink-05)", border: "0.5px solid var(--color-ink-15)" }}>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="label block mb-1">Name</Label>
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="h-8 text-[13px]" />
        </div>
        <div>
          <Label className="label block mb-1">Mode</Label>
          <Select value={d.category} onValueChange={(v) => setD({ ...d, category: v as TemplateCategory })}>
            <SelectTrigger className="h-8 text-[13px]" style={{ width: 150 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general" className="text-[13px]">General</SelectItem>
              <SelectItem value="job_spec" className="text-[13px]">Email Job Spec</SelectItem>
              <SelectItem value="client" className="text-[13px]">Email Client</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="label block mb-1">Visibility</Label>
          <Select value={d.visibility} onValueChange={(v) => setD({ ...d, visibility: v as TemplateVisibility })}>
            <SelectTrigger className="h-8 text-[13px]" style={{ width: 110 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="team" className="text-[13px]">Team</SelectItem>
              <SelectItem value="private" className="text-[13px]">Private</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="label block mb-1">Subject</Label>
        <Input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} className="h-8 text-[13px]" />
      </div>
      <div>
        <Label className="label block mb-1">Body</Label>
        <Textarea value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} rows={6} className="text-[12px] font-sans resize-none" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <button className="btn btn-primary btn-sm" onClick={() => onSave(d)} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function EmailTemplatesSection() {
  const { user } = useAuth();
  const { data: templates = [], isLoading } = useEmailTemplates();
  const create = useCreateEmailTemplate();
  const update = useUpdateEmailTemplate();
  const del = useDeleteEmailTemplate();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);

  async function handleCreate(d: Draft) {
    try {
      await create.mutateAsync({ name: d.name.trim(), category: d.category, subject: d.subject.trim() || null, body: d.body, visibility: d.visibility });
      toast.success("Template created.");
      setCreating(false);
    } catch {
      toast.error("Could not create the template.");
    }
  }

  async function handleUpdate(id: string, d: Draft) {
    try {
      await update.mutateAsync({ id, name: d.name.trim(), category: d.category, subject: d.subject.trim() || null, body: d.body, visibility: d.visibility });
      toast.success("Template updated.");
      setEditingId(null);
    } catch {
      toast.error("Could not update the template.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast.success("Template deleted.");
      setDeleteTarget(null);
    } catch {
      toast.error("Could not delete the template.");
    }
  }

  const grouped = (["job_spec", "client", "general"] as TemplateCategory[])
    .map((cat) => ({ cat, items: templates.filter((t) => t.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-6 p-6" style={{ background: "var(--color-white)", border: "1px solid var(--color-ink-15)" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <IconFileText size={15} style={{ color: "var(--color-ink-60)" }} />
          <h2 className="font-display text-base">Email templates</h2>
        </div>
        {!creating && (
          <button className="btn btn-outline btn-sm flex items-center gap-1.5" onClick={() => setCreating(true)}>
            <IconPlus size={13} /> New template
          </button>
        )}
      </div>
      <p className="text-[12px] mb-4" style={{ color: "var(--color-ink-60)" }}>
        Reusable subject + body for the candidate-page Email composer. General templates show in every mode.
      </p>

      {creating && (
        <div className="mb-4">
          <TemplateForm initial={EMPTY_DRAFT} onSave={(d) => void handleCreate(d)} onCancel={() => setCreating(false)} saving={create.isPending} />
        </div>
      )}

      {isLoading ? (
        <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>Loading…</p>
      ) : templates.length === 0 && !creating ? (
        <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>No templates yet.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.cat}>
              <p className="label mb-1.5">{CATEGORY_LABEL[g.cat]}</p>
              <div className="space-y-1.5">
                {g.items.map((t) =>
                  editingId === t.id ? (
                    <TemplateForm
                      key={t.id}
                      initial={{ name: t.name, category: t.category, visibility: t.visibility, subject: t.subject ?? "", body: t.body }}
                      onSave={(d) => void handleUpdate(t.id, d)}
                      onCancel={() => setEditingId(null)}
                      saving={update.isPending}
                    />
                  ) : (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3"
                      style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-05)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">
                          {t.name}
                          {t.visibility === "private" && (
                            <span className="text-[10px] font-mono ml-2" style={{ color: "var(--color-ink-30)" }}>PRIVATE</span>
                          )}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: "var(--color-ink-30)" }}>
                          {t.subject || "(no subject)"}
                        </p>
                      </div>
                      {t.created_by === user?.id && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button className="btn btn-ghost btn-sm p-1" onClick={() => setEditingId(t.id)} aria-label="Edit">
                            <IconPencil size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm p-1" onClick={() => setDeleteTarget(t)} aria-label="Delete" style={{ color: "var(--color-danger)" }}>
                            <IconTrash size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent style={{ maxWidth: 400 }}>
          <DialogHeader>
            <DialogTitle className="font-display text-base">Delete template</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] py-2" style={{ color: "var(--color-ink-60)" }}>
            Delete "{deleteTarget?.name}"? This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)} disabled={del.isPending}>Cancel</Button>
            <button className="btn btn-primary btn-sm" onClick={() => void handleDelete()} disabled={del.isPending} style={{ background: "var(--color-danger)" }}>
              {del.isPending ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
