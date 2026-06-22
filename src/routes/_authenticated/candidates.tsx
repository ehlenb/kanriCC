import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { relativeTime } from "@/lib/candidate-utils";
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
import {
  IconSearch,
  IconPlus,
  IconChevronDown,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";

type CandidateSearch = { name: string; company: string; status: string; japanese_level: string; english_level: string; source: string; last_touch: string; };

export const BLANK_CANDIDATE_SEARCH: CandidateSearch = { name: "", company: "", status: "", japanese_level: "", english_level: "", source: "", last_touch: "" };

export function withCandidateDefaults(prev: Partial<CandidateSearch>): CandidateSearch {
  return {
    name: prev.name ?? "",
    company: prev.company ?? "",
    status: prev.status ?? "",
    japanese_level: prev.japanese_level ?? "",
    english_level: prev.english_level ?? "",
    source: prev.source ?? "",
    last_touch: prev.last_touch ?? "",
  };
}

export const Route = createFileRoute("/_authenticated/candidates")({
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search.name === "string" ? search.name : "",
    company: typeof search.company === "string" ? search.company : "",
    status: typeof search.status === "string" ? search.status : "",
    japanese_level: typeof search.japanese_level === "string" ? search.japanese_level : "",
    english_level: typeof search.english_level === "string" ? search.english_level : "",
    source: typeof search.source === "string" ? search.source : "",
    last_touch: typeof search.last_touch === "string" ? search.last_touch : "",
  }),
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
  candidate_status: string | null;
  status_source: string | null;
  placed_at: string | null;
  coin_icon_dismissed: boolean;
  source: string | null;
  last_interaction_at: string | null;
  updated_at: string;
};

const JAPANESE_LEVELS = [
  "Native", "Fluent", "High Business", "Business", "Low Business",
  "High Conversational", "Conversational", "Low Conversational", "Basic",
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "passive", label: "Passive" },
  { value: "placed", label: "Placed" },
];

const SOURCE_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "bizreach", label: "BizReach" },
  { value: "doda", label: "Doda" },
  { value: "referral", label: "Referral" },
  { value: "inbound", label: "Inbound" },
  { value: "other", label: "Other" },
];

const LAST_TOUCH_OPTIONS = [
  { value: "2w",      label: "Within 2 weeks" },
  { value: "1m",      label: "Within 1 month" },
  { value: "1_3m",    label: "1–3 months ago" },
  { value: "3m_plus", label: "3+ months ago" },
];

function CandidatesLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const loc = useLocation();
  const navigate = useNavigate();
  const [openNew, setOpenNew] = useState(false);

  const search = Route.useSearch();

  // Local text inputs — debounced before writing to URL
  const [nameInput, setNameInput] = useState(search.name);
  const [companyInput, setCompanyInput] = useState(search.company);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateSearch(patch: Partial<CandidateSearch>) {
    void navigate({
      to: "/candidates",
      search: () => withCandidateDefaults({ ...search, ...patch }),
    });
  }

  function handleTextInput(field: "name" | "company", value: string) {
    if (field === "name") setNameInput(value);
    else setCompanyInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateSearch({ [field]: value });
    }, 300);
  }

  // Date thresholds for last_touch filter
  const now = new Date();
  const twoWeeksAgo   = new Date(now.getTime() - 14 * 86400000).toISOString();
  const oneMonthAgo   = new Date(now.getTime() - 30 * 86400000).toISOString();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000).toISOString();

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["candidates", user?.id, search],
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      let q = supabase
        .from("candidates")
        .select(
          "id, full_name, full_name_japanese, current_title, current_company, japanese_level, english_level, candidate_status, status_source, placed_at, coin_icon_dismissed, source, last_interaction_at, updated_at",
        )
        .order("updated_at", { ascending: false, nullsFirst: false });

      if (search.name.trim()) q = q.ilike("full_name", `%${search.name.trim()}%`);
      if (search.company.trim()) q = q.ilike("current_company", `%${search.company.trim()}%`);
      if (search.status) q = q.eq("candidate_status", search.status);
      if (search.japanese_level) q = q.eq("japanese_level", search.japanese_level);
      if (search.english_level) q = q.eq("english_level", search.english_level);
      if (search.source) q = q.eq("source", search.source);

      if (search.last_touch === "2w") {
        q = q.gte("last_interaction_at", twoWeeksAgo);
      } else if (search.last_touch === "1m") {
        q = q.gte("last_interaction_at", oneMonthAgo);
      } else if (search.last_touch === "1_3m") {
        q = q.gte("last_interaction_at", threeMonthsAgo).lt("last_interaction_at", oneMonthAgo);
      } else if (search.last_touch === "3m_plus") {
        q = q.or(`last_interaction_at.is.null,last_interaction_at.lt.${threeMonthsAgo}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as CandidateListItem[];
    },
  });

  const translatedStatusOptions = STATUS_OPTIONS.map((o) => ({ ...o, label: t(`candidates.status.${o.value}`) }));
  const translatedSourceOptions = SOURCE_OPTIONS.map((o) => ({ ...o, label: t(`candidates.source.${o.value}`) }));
  const LAST_TOUCH_KEY: Record<string, string> = { "2w": "2w", "1m": "1m", "1_3m": "1_3m", "3m_plus": "3mPlus" };
  const translatedLastTouchOptions = LAST_TOUCH_OPTIONS.map((o) => ({
    ...o,
    label: t(`candidates.lastTouch.${LAST_TOUCH_KEY[o.value] ?? o.value}`, { defaultValue: o.label }),
  }));

  const hasFilters = search.name || search.company || search.status || search.japanese_level || search.english_level || search.source || search.last_touch;

  const activeId = loc.pathname.split("/candidates/")[1];

  useEffect(() => {
    if (loc.pathname === "/candidates" && candidates.length > 0) {
      navigate({
        to: "/candidates/$id",
        params: { id: candidates[0].id },
        search: withCandidateDefaults(search),
        replace: true,
      });
    }
  }, [loc.pathname, candidates, navigate]);

  return (
    <div className="flex h-screen">
      {/* List pane */}
      <div
        className="flex w-[340px] shrink-0 flex-col"
        style={{
          background: "var(--color-ink-10)",
          borderRight: "0.5px solid var(--color-ink-15)",
        }}
      >
        <div
          className="px-4 pt-5 pb-3"
          style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold font-display">{t('candidates.title')}</h1>
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
          <div className="relative mb-2">
            <IconSearch
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--color-ink-30)" }}
            />
            <Input
              value={nameInput}
              onChange={(e) => handleTextInput("name", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") updateSearch({ name: nameInput }); }}
              placeholder={t('candidates.searchPlaceholder')}
              className="h-9 pl-8 text-[13px]"
            />
          </div>

          {/* Filter row */}
          <div className="space-y-1.5">
            <Input
              value={companyInput}
              onChange={(e) => handleTextInput("company", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") updateSearch({ company: companyInput }); }}
              placeholder={t('candidates.companyPlaceholder')}
              className="h-8 text-[12px]"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <FilterSelect
                value={search.status}
                placeholder={t('candidates.filters.status')}
                options={translatedStatusOptions}
                onChange={(v) => updateSearch({ status: v })}
              />
              <FilterSelect
                value={search.source}
                placeholder={t('candidates.filters.source')}
                options={translatedSourceOptions}
                onChange={(v) => updateSearch({ source: v })}
              />
            </div>
            <LanguageFilter
              label={t('candidates.filters.japaneseLabel')}
              value={search.japanese_level}
              levels={JAPANESE_LEVELS}
              onChange={(v) => updateSearch({ japanese_level: v })}
            />
            <LanguageFilter
              label={t('candidates.filters.englishLabel')}
              value={search.english_level}
              levels={JAPANESE_LEVELS}
              onChange={(v) => updateSearch({ english_level: v })}
            />
            <FilterSelect
              value={search.last_touch}
              placeholder={t('candidates.filters.lastTouch')}
              options={translatedLastTouchOptions}
              onChange={(v) => updateSearch({ last_touch: v })}
            />
            {hasFilters && (
              <button
                className="text-[11px] underline underline-offset-2"
                style={{ color: "var(--color-ink-30)" }}
                onClick={() => {
                  setNameInput("");
                  setCompanyInput("");
                  updateSearch({ name: "", company: "", status: "", japanese_level: "", english_level: "", source: "", last_touch: "" });
                }}
              >
                {t('candidates.clearFilters')}
              </button>
            )}
          </div>

          {/* Advanced Search */}
          <button
            className="mt-2 flex w-full items-center justify-center gap-1.5  py-1.5 text-[12px] font-medium transition-colors"
            style={{ border: "0.5px solid rgba(26,26,24,0.2)", color: "var(--color-indigo)", background: "var(--color-indigo-light)" }}
            onClick={() => void navigate({ to: "/advanced-search" as never })}
          >
            <IconAdjustmentsHorizontal size={13} />
            {t('candidates.advancedSearch')}
          </button>

          <p
            className="mt-2 text-[11px] uppercase tracking-wider"
            style={{ color: "var(--color-ink-30)" }}
          >
            {t('candidates.count', { count: candidates.length })}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 text-sm" style={{ color: "var(--color-ink-30)" }}>
              {t('common.loading')}
            </div>
          ) : candidates.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>
                {hasFilters
                  ? t('candidates.noResults')
                  : t('candidates.noResultsEmpty')}
              </p>
              {hasFilters ? (
                <button
                  className="mt-3 text-[12px] underline underline-offset-2"
                  style={{ color: "var(--color-indigo)" }}
                  onClick={() => {
                    setNameInput("");
                    setCompanyInput("");
                    updateSearch(BLANK_CANDIDATE_SEARCH);
                  }}
                >
                  {t('candidates.clearFilters')}
                </button>
              ) : (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpenNew(true)}>
                  <IconPlus size={14} className="mr-1" />
                  {t('candidates.addCandidate')}
                </Button>
              )}
            </div>
          ) : (
            candidates.map((c) => {
              const showCoin = c.candidate_status === "placed"
                && !c.coin_icon_dismissed
                && c.placed_at !== null
                && Date.now() - new Date(c.placed_at).getTime() < 90 * 86400000;

              const accentColor =
                c.candidate_status === "active"  ? "var(--color-vermillion)" :
                c.candidate_status === "placed"  ? "var(--color-indigo)" :
                c.candidate_status === "passive" ? "var(--color-gold)" :
                "var(--color-ink-15)";

              const badgeStyle: React.CSSProperties =
                c.candidate_status === "active"  ? { background: "var(--color-ink-10)", color: "var(--color-ink)" } :
                c.candidate_status === "placed"  ? { background: "var(--color-indigo-light)", color: "var(--color-indigo)" } :
                c.candidate_status === "passive" ? { background: "var(--color-gold-light)", color: "var(--color-gold)" } :
                { background: "var(--color-ink-10)", color: "var(--color-ink-60)" };

              const badgeLabel =
                c.candidate_status === "active"  ? t('candidates.status.active') :
                c.candidate_status === "placed"  ? t('candidates.status.placed') :
                c.candidate_status === "passive" ? t('candidates.status.passive') :
                null;

              const metaParts = [
                c.japanese_level,
                c.english_level ? `EN ${c.english_level}` : null,
                c.last_interaction_at ? `Last: ${relativeTime(c.last_interaction_at)}` : null,
              ].filter(Boolean);

              return (
                <Link
                  key={c.id}
                  to="/candidates/$id"
                  params={{ id: c.id }}
                  search={withCandidateDefaults(search)}
                  className="block transition-colors"
                  style={{ borderBottom: "0.5px solid var(--color-border-subtle)" }}
                >
                  <div
                    className="flex items-stretch"
                    style={{ background: activeId === c.id ? "rgba(26,26,24,0.04)" : "transparent" }}
                  >
                    {/* Left accent bar */}
                    <div className="w-[3px] shrink-0" style={{ background: accentColor }} />

                    {/* Card body */}
                    <div className="min-w-0 flex-1 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium font-display leading-snug">
                            {c.full_name_japanese
                              ? <>{c.full_name_japanese} / {c.full_name}</>
                              : c.full_name}
                            {showCoin && <span className="ml-1">🪙</span>}
                          </p>
                          <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                            {[c.current_title, c.current_company].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        {badgeLabel && (
                          <span
                            className="shrink-0 font-mono text-[10px] font-normal tracking-[0.08em] uppercase px-2 py-0.5 border whitespace-nowrap"
                            style={{ ...badgeStyle, borderColor: accentColor }}
                          >
                            {badgeLabel}
                          </span>
                        )}
                      </div>
                      {metaParts.length > 0 && (
                        <p className="mt-1.5 font-mono text-[10px] tracking-[0.06em] uppercase truncate"
                           style={{ color: "var(--color-ink-30)" }}>
                          {metaParts.join("  ·  ")}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
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
          navigate({ to: "/candidates/$id", params: { id }, search: withCandidateDefaults(search) });
        }}
        recruiterId={user!.id}
      />
    </div>
  );
}

// ─── filter select ────────────────────────────────────────────────────────────

function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full  text-[12px] px-2 py-1.5 outline-none"
      style={{
        border: "0.5px solid rgba(26,26,24,0.16)",
        background: value ? "var(--color-indigo-light)" : "var(--color-white)",
        color: value ? "var(--color-indigo)" : "var(--color-ink-60)",
        height: 32,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── collapsible language filter ─────────────────────────────────────────────

function LanguageFilter({
  label,
  value,
  levels,
  onChange,
}: {
  label: string;
  value: string;
  levels: readonly string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between  px-2 py-1.5 text-[12px] outline-none"
        style={{
          border: "0.5px solid rgba(26,26,24,0.16)",
          background: value ? "var(--color-indigo-light)" : "var(--color-white)",
          color: value ? "var(--color-indigo)" : "var(--color-ink-60)",
          height: 32,
        }}
      >
        <span>{value ? `${label} — ${value}` : label}</span>
        {value ? (
          <span
            className="ml-1 text-[13px] leading-none"
            style={{ color: "var(--color-indigo)" }}
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            title="Clear"
          >
            ×
          </span>
        ) : (
          <IconChevronDown size={11} style={{ color: "var(--color-ink-30)" }} />
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-20 mt-0.5 overflow-hidden  "
          style={{ background: "var(--color-white)", border: "0.5px solid rgba(26,26,24,0.16)" }}
        >
          {levels.map((level) => (
            <button
              key={level}
              type="button"
              className="w-full px-3 py-1.5 text-left text-[12px] transition-colors"
              style={{
                color: value === level ? "var(--color-indigo)" : "var(--color-ink)",
                background: value === level ? "var(--color-indigo-light)" : "transparent",
              }}
              onMouseEnter={(e) => { if (value !== level) e.currentTarget.style.background = "var(--color-ink-10)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = value === level ? "var(--color-indigo-light)" : "transparent"; }}
              onClick={() => { onChange(level); setOpen(false); }}
            >
              {level}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const { t } = useTranslation();

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
          <DialogTitle>{t('candidates.addCandidate')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Field label={t('candidates.addForm.fullName')} required>
            <Input
              value={form.full_name}
              onChange={(e) => set("full_name")(e.target.value)}
              placeholder="e.g. Nakamura Kenji"
              autoFocus
            />
          </Field>
          <Field label={t('candidates.addForm.fullNameJapanese')}>
            <Input
              value={form.full_name_japanese}
              onChange={(e) => set("full_name_japanese")(e.target.value)}
              placeholder="e.g. 中村 健二"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('candidates.addForm.currentTitle')}>
              <Input
                value={form.current_title}
                onChange={(e) => set("current_title")(e.target.value)}
                placeholder="Robotics Engineer"
              />
            </Field>
            <Field label={t('candidates.addForm.currentCompany')}>
              <Input
                value={form.current_company}
                onChange={(e) => set("current_company")(e.target.value)}
                placeholder="Sony Corporation"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('candidates.addForm.japaneseLevel')}>
              <Select value={form.japanese_level} onValueChange={set("japanese_level")}>
                <SelectTrigger>
                  <SelectValue placeholder={t('candidates.addForm.selectLevel')} />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('candidates.addForm.englishLevel')}>
              <Select value={form.english_level} onValueChange={set("english_level")}>
                <SelectTrigger>
                  <SelectValue placeholder={t('candidates.addForm.selectLevel')} />
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
            {t('common.cancel')}
          </Button>
          <Button
            onClick={save}
            disabled={busy || !form.full_name.trim()}
          >
            {t('candidates.addCandidate')}
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
        {required && <span style={{ color: "var(--color-danger)" }}> *</span>}
      </Label>
      {children}
    </div>
  );
}
