import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
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
import { IconSearch, IconPlus, IconSparkles } from "@tabler/icons-react";
import { initials } from "@/lib/candidate-utils";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsLayout,
});

type ClientListItem = {
  id: string;
  company_name: string;
  years_in_japan: number | null;
  japan_team_size: number | null;
  hiring_manager_name: string | null;
  created_at: string;
};

function ClientsLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const loc = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, company_name, years_in_japan, japan_team_size, hiring_manager_name, created_at",
        )
        .order("company_name");
      if (error) throw error;
      return data as ClientListItem[];
    },
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return clients;
    const needle = q.toLowerCase();
    return clients.filter((c) =>
      c.company_name.toLowerCase().includes(needle),
    );
  }, [clients, q]);

  const activeId = loc.pathname.split("/clients/")[1];

  useEffect(() => {
    if (loc.pathname === "/clients" && filtered.length > 0) {
      navigate({
        to: "/clients/$id",
        params: { id: filtered[0].id },
        replace: true,
      });
    }
  }, [loc.pathname, filtered, navigate]);

  return (
    <div className="flex h-screen">
      <div
        className="flex w-[300px] shrink-0 flex-col"
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
            <h1 className="text-base font-semibold">{t('clients.title')}</h1>
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
              placeholder={t('clients.searchPlaceholder')}
              className="h-9 pl-8 text-[13px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 text-sm" style={{ color: "#888780" }}>
              {t('common.loading')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium">
                {clients.length > 0 ? t('clients.noResults') : "No clients yet."}
              </p>
              {clients.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setOpenNew(true)}
                >
                  <IconPlus size={14} className="mr-1" />
                  {t('clients.addClient')}
                </Button>
              )}
            </div>
          ) : (
            filtered.map((c) => (
              <Link
                key={c.id}
                to="/clients/$id"
                params={{ id: c.id }}
                className="block transition-colors"
                style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}
              >
                <div
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{
                    background:
                      activeId === c.id
                        ? "rgba(26,26,24,0.05)"
                        : "transparent",
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center  text-xs font-medium"
                    style={{ background: "#eeede8", color: "#1a1a18" }}
                  >
                    {initials(c.company_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {c.company_name}
                    </p>
                    <p className="text-xs" style={{ color: "#5f5e5a" }}>
                      {c.years_in_japan
                        ? `${c.years_in_japan} years in Japan`
                        : ""}
                      {c.japan_team_size
                        ? ` · Team: ${c.japan_team_size}`
                        : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>

      <NewClientDialog
        open={openNew}
        onClose={() => setOpenNew(false)}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["clients"] });
          setOpenNew(false);
          navigate({ to: "/clients/$id", params: { id } });
        }}
        recruiterId={user!.id}
      />
    </div>
  );
}

function NewClientDialog({
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
  const [form, setForm] = useState({ company_name: "", website: "", hiring_manager_name: "" });
  const [busy, setBusy] = useState(false);
  const [kanriSaving, setKanriSaving] = useState(false);

  function resetForm() {
    setForm({ company_name: "", website: "", hiring_manager_name: "" });
  }

  async function saveBasic() {
    if (!form.company_name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({
        recruiter_id: recruiterId,
        company_name: form.company_name.trim(),
        website: form.website.trim() || null,
        hiring_manager_name: form.hiring_manager_name.trim() || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    resetForm();
    onCreated(data.id);
  }

  async function saveWithKanri() {
    if (!form.company_name.trim()) return;
    setKanriSaving(true);
    try {
      // Fetch enrichment first
      const body: Record<string, string> = { company_name: form.company_name.trim() };
      if (form.website.trim()) body.url = form.website.trim();
      const enrichRes = await fetch("/api/ai/enrich-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const enrichJson = await enrichRes.json() as {
        enrichment?: { strategy_notes?: string; years_in_japan?: number; japan_team_size?: number };
        error?: string;
      };

      const enrichment = enrichJson.enrichment;
      const { data, error } = await supabase
        .from("clients")
        .insert({
          recruiter_id: recruiterId,
          company_name: form.company_name.trim(),
          website: form.website.trim() || null,
          hiring_manager_name: form.hiring_manager_name.trim() || null,
          strategy_notes: enrichment?.strategy_notes ?? null,
          years_in_japan: enrichment?.years_in_japan ?? null,
          japan_team_size: enrichment?.japan_team_size ?? null,
        })
        .select("id")
        .single();

      if (error) { toast.error(error.message); setKanriSaving(false); return; }
      resetForm();
      onCreated(data.id);
    } catch {
      toast.error("Intelligence search failed. Client was not saved.");
      setKanriSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !kanriSaving) onClose(); }}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        {kanriSaving ? (
          <KanriLoadingScreen />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a client</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <Field label="Company name" required>
                <Input
                  value={form.company_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  placeholder="e.g. Softbank Robotics Japan"
                  autoFocus
                />
              </Field>
              <Field label="Website or URL">
                <Input
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="e.g. https://softbankrobotics.com/jp"
                />
              </Field>
              <Field label="Hiring manager name">
                <Input
                  value={form.hiring_manager_name}
                  onChange={(e) => setForm((f) => ({ ...f, hiring_manager_name: e.target.value }))}
                  placeholder="e.g. Yamada Taro"
                />
              </Field>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} className="sm:mr-auto">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={saveBasic}
                disabled={busy || !form.company_name.trim()}
              >
                Save client
              </Button>
              <Button
                onClick={saveWithKanri}
                disabled={busy || !form.company_name.trim()}
                className="gap-1.5"
                style={{ background: "#c94f2a", color: "#fff", border: "none" }}
              >
                <IconSparkles size={14} />
                Kanri Save
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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

function KanriLoadingScreen() {
  return (
    <>
      <style>{`
        @keyframes kanri-ink {
          0%   { clip-path: inset(100% 0 0 0); opacity: 0.9; }
          15%  { opacity: 1; }
          70%  { clip-path: inset(0% 0 0 0); }
          85%  { clip-path: inset(0% 0 0 0); opacity: 1; }
          100% { clip-path: inset(100% 0 0 0); opacity: 0.9; }
        }
      `}</style>
      <div
        className="flex flex-col items-center justify-center py-10 gap-6"
        style={{ minHeight: 260 }}
      >
        <div className="relative select-none" style={{ lineHeight: 1 }}>
          {/* Ghost layer */}
          <span
            style={{
              fontFamily: "'Shippori Mincho', serif",
              fontSize: 96,
              color: "rgba(26,26,24,0.07)",
              display: "block",
            }}
          >
            管理
          </span>
          {/* Ink fill layer */}
          <span
            style={{
              fontFamily: "'Shippori Mincho', serif",
              fontSize: 96,
              color: "rgba(26,26,24,0.82)",
              position: "absolute",
              inset: 0,
              display: "block",
              animation: "kanri-ink 3.2s ease-in-out infinite",
            }}
          >
            管理
          </span>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium" style={{ color: "#1a1a18" }}>
            Gathering company intelligence
          </p>
          <p className="text-xs" style={{ color: "#888780" }}>
            Searching the web for Japan operations, team size, and strategy…
          </p>
        </div>
      </div>
    </>
  );
}
