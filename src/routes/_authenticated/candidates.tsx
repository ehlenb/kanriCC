import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { initials, relativeTime, touchTone } from "@/lib/candidate-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconSearch, IconPlus } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/candidates")({
  component: CandidatesLayout,
});

type CandidateListItem = {
  id: string;
  full_name: string;
  full_name_japanese: string | null;
  current_title: string | null;
  current_company: string | null;
  japanese_level: string | null;
  english_level: string | null;
  updated_at: string;
};

function CandidatesLayout() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const loc = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["candidates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select(
          "id, full_name, full_name_japanese, current_title, current_company, japanese_level, english_level, updated_at",
        )
        .eq("recruiter_id", user!.id)
        .order("updated_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as CandidateListItem[];
    },
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return candidates;
    const needle = q.toLowerCase();
    return candidates.filter((c) =>
      [c.full_name, c.full_name_japanese, c.current_company, c.current_title]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [candidates, q]);

  const activeId = loc.pathname.split("/candidates/")[1];

  useEffect(() => {
    if (loc.pathname === "/candidates" && filtered.length > 0) {
      navigate({
        to: "/candidates/$id",
        params: { id: filtered[0].id },
        replace: true,
      });
    }
  }, [loc.pathname, filtered, navigate]);

  return (
    <div className="flex h-screen">
      {/* List pane */}
      <div
        className="flex w-[340px] shrink-0 flex-col"
        style={{
          background: "#f5f5f3",
          borderRight: "0.5px solid rgba(26,26,24,0.12)",
        }}
      >
        <div
          className="px-4 pt-5 pb-3"
          style={{ borderBottom: "0.5px solid rgba(26,26,24,0.12)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold">Candidates</h1>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpenNew(true)}
              className="-mr-1 h-8 gap-1"
            >
              <IconPlus size={14} />
              New
            </Button>
          </div>
          <div className="relative">
            <IconSearch
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "#888780" }}
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, company"
              className="h-9 pl-8 text-[13px]"
            />
          </div>
          <p
            className="mt-2.5 text-[11px] uppercase tracking-wider"
            style={{ color: "#888780" }}
          >
            {filtered.length} {filtered.length === 1 ? "person" : "people"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 text-sm" style={{ color: "#888780" }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium">
                {candidates.length > 0 ? "No matches." : "No candidates yet."}
              </p>
              {candidates.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setOpenNew(true)}
                >
                  <IconPlus size={14} className="mr-1" />
                  Add candidate
                </Button>
              )}
            </div>
          ) : (
            filtered.map((c) => (
              <Link
                key={c.id}
                to="/candidates/$id"
                params={{ id: c.id }}
                className="block transition-colors"
                style={{
                  borderBottom: "0.5px solid rgba(26,26,24,0.08)",
                }}
              >
                <div
                  className="flex items-start gap-3 px-4 py-3.5"
                  style={{
                    background:
                      activeId === c.id
                        ? "rgba(26,26,24,0.05)"
                        : "transparent",
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                    style={{ background: "#eeede8", color: "#1a1a18" }}
                  >
                    {initials(c.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-medium">
                        {c.full_name}
                      </p>
                      <TouchPill iso={c.updated_at} />
                    </div>
                    <p
                      className="mt-0.5 truncate text-xs"
                      style={{ color: "#5f5e5a" }}
                    >
                      {c.current_title || "—"}
                      {c.current_company ? ` · ${c.current_company}` : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>

      <NewCandidateDialog
        open={openNew}
        onClose={() => setOpenNew(false)}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["candidates"] });
          setOpenNew(false);
          navigate({ to: "/candidates/$id", params: { id } });
        }}
        recruiterId={user!.id}
      />
    </div>
  );
}

function TouchPill({ iso }: { iso: string | null }) {
  const tone = touchTone(iso);
  const styles = {
    fresh: { background: "#eaf3de", color: "#27500a" },
    warm: { background: "#e6f1fb", color: "#185fa5" },
    cool: { background: "#faeeda", color: "#633806" },
    cold: { background: "#fcebeb", color: "#a32d2d" },
  }[tone];

  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={styles}
    >
      {relativeTime(iso)}
    </span>
  );
}

const LANGUAGE_LEVELS = [
  "Native",
  "Fluent",
  "High Business",
  "Business",
  "Low Business",
  "High Conversational",
  "Conversational",
  "Low Conversational",
  "Basic",
];

function NewCandidateDialog({
  open,
  onClose,
  onCreated,
  recruiterId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  recruiterId: string;
}) {
  const [form, setForm] = useState({
    full_name: "",
    full_name_japanese: "",
    current_title: "",
    current_company: "",
    japanese_level: "",
    english_level: "",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.full_name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("candidates")
      .insert({
        recruiter_id: recruiterId,
        full_name: form.full_name.trim(),
        full_name_japanese: form.full_name_japanese || null,
        current_title: form.current_title || null,
        current_company: form.current_company || null,
        japanese_level: (form.japanese_level as never) || null,
        english_level: (form.english_level as never) || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setForm({
      full_name: "",
      full_name_japanese: "",
      current_title: "",
      current_company: "",
      japanese_level: "",
      english_level: "",
    });
    onCreated(data.id);
  }

  function set(key: keyof typeof form) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Field label="Full name (romaji)" required>
            <Input
              value={form.full_name}
              onChange={(e) => set("full_name")(e.target.value)}
              placeholder="e.g. Nakamura Kenji"
              autoFocus
            />
          </Field>
          <Field label="Full name (Japanese)">
            <Input
              value={form.full_name_japanese}
              onChange={(e) => set("full_name_japanese")(e.target.value)}
              placeholder="e.g. 中村 健二"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current title">
              <Input
                value={form.current_title}
                onChange={(e) => set("current_title")(e.target.value)}
                placeholder="Robotics Engineer"
              />
            </Field>
            <Field label="Current company">
              <Input
                value={form.current_company}
                onChange={(e) => set("current_company")(e.target.value)}
                placeholder="Sony Corporation"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Japanese level">
              <Select value={form.japanese_level} onValueChange={set("japanese_level")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="English level">
              <Select value={form.english_level} onValueChange={set("english_level")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy || !form.full_name.trim()}
          >
            Save candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span style={{ color: "#a32d2d" }}> *</span>}
      </Label>
      {children}
    </div>
  );
}
