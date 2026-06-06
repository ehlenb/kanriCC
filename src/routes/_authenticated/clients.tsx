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
import { IconSearch, IconPlus } from "@tabler/icons-react";
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
            <h1 className="text-base font-semibold">Clients</h1>
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
              placeholder="Search by company name"
              className="h-9 pl-8 text-[13px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 text-sm" style={{ color: "#888780" }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium">
                {clients.length > 0 ? "No matches." : "No clients yet."}
              </p>
              {clients.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setOpenNew(true)}
                >
                  <IconPlus size={14} className="mr-1" />
                  Add client
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
  const [form, setForm] = useState({
    company_name: "",
    years_in_japan: "",
    japan_team_size: "",
    hiring_manager_name: "",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.company_name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({
        recruiter_id: recruiterId,
        company_name: form.company_name.trim(),
        years_in_japan: form.years_in_japan
          ? parseInt(form.years_in_japan)
          : null,
        japan_team_size: form.japan_team_size
          ? parseInt(form.japan_team_size)
          : null,
        hiring_manager_name: form.hiring_manager_name || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setForm({
      company_name: "",
      years_in_japan: "",
      japan_team_size: "",
      hiring_manager_name: "",
    });
    onCreated(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Field label="Company name" required>
            <Input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="e.g. TechCorp Japan"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Years in Japan">
              <Input
                type="number"
                value={form.years_in_japan}
                onChange={(e) => setForm({ ...form, years_in_japan: e.target.value })}
                placeholder="e.g. 18"
              />
            </Field>
            <Field label="Japan team size">
              <Input
                type="number"
                value={form.japan_team_size}
                onChange={(e) => setForm({ ...form, japan_team_size: e.target.value })}
                placeholder="e.g. 120"
              />
            </Field>
          </div>
          <Field label="Hiring manager name">
            <Input
              value={form.hiring_manager_name}
              onChange={(e) => setForm({ ...form, hiring_manager_name: e.target.value })}
              placeholder="e.g. Yamada Taro"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy || !form.company_name.trim()}
          >
            Save client
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
