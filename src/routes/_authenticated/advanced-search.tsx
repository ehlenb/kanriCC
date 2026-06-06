import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";
import {
  initials,
  relativeTime,
  daysSince,
} from "@/lib/candidate-utils";
import { StageBadge } from "@/components/shared/StageBadge";
import { toast } from "sonner";
import {
  IconX,
  IconChevronDown,
  IconInfoCircle,
  IconPlus,
  IconSparkles,
  IconDeviceFloppy,
  IconUsers,
  IconLock,
  IconWorld,
  IconFlag,
  IconLoader2,
} from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/advanced-search")({
  component: AdvancedSearch,
});

// ─── constants ────────────────────────────────────────────────────────────────

const LANGUAGE_LEVELS = [
  "Native", "Fluent", "High Business", "Business", "Low Business",
  "High Conversational", "Conversational", "Low Conversational", "Basic",
];

const JAPAN_PREFECTURES = [
  "Hokkaido", "Aomori", "Iwate", "Miyagi", "Akita", "Yamagata", "Fukushima",
  "Ibaraki", "Tochigi", "Gunma", "Saitama", "Chiba", "Tokyo", "Kanagawa",
  "Niigata", "Toyama", "Ishikawa", "Fukui", "Yamanashi", "Nagano",
  "Shizuoka", "Aichi", "Mie", "Shiga", "Kyoto", "Osaka", "Hyogo",
  "Nara", "Wakayama", "Tottori", "Shimane", "Okayama", "Hiroshima",
  "Yamaguchi", "Tokushima", "Kagawa", "Ehime", "Kochi", "Fukuoka",
  "Saga", "Nagasaki", "Kumamoto", "Oita", "Miyazaki", "Kagoshima", "Okinawa",
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "passive", label: "Passive" },
  { value: "placed", label: "Placed" },
];

const LAST_TOUCH_OPTIONS = [
  { value: "2w", label: "Within 2 weeks" },
  { value: "1m", label: "Within 1 month" },
  { value: "1_3m", label: "1–3 months ago" },
  { value: "3m_plus", label: "3+ months ago" },
];

// ─── types ────────────────────────────────────────────────────────────────────

type SearchFilters = {
  name: string;
  company: string;
  status: string;
  japanese_level: string;
  english_level: string;
  mandarin_level: string;
  cantonese_level: string;
  korean_level: string;
  other_language: string;
  last_touch: string;
  age_min: string;
  age_max: string;
  salary_min: string;
  salary_max: string;
  location: string;
  keywords: string[];
  keyword_mode: "AND" | "OR";
};

type CandidateRow = {
  id: string;
  full_name: string;
  full_name_japanese: string | null;
  current_title: string | null;
  current_company: string | null;
  japanese_level: string | null;
  english_level: string | null;
  candidate_status: string | null;
  placed_at: string | null;
  coin_icon_dismissed: boolean;
  age: number | null;
  current_base: number | null;
  base_minimum: number | null;
  notes_pitch: string | null;
  notes_personality: string | null;
  last_interaction_at: string | null;
  updated_at: string;
  // from joins
  activeStage: string | null;
  activeProcessClientId: string | null;
};

type AiResult = {
  candidate_id: string;
  score: number; // 0–100
  reason: string;
  is_salary_stretch: boolean;
  meets_must_haves: boolean;
  close_on_must_haves: boolean;
};

type ClientOption = { id: string; company_name: string };
type RequisitionOption = { id: string; title: string; client_id: string };

type SavedList = {
  id: string;
  name: string;
  created_by: string;
  visibility: string;
  candidate_ids: string[];
  source: string;
  created_at: string;
  updated_at: string;
  creator_name: string | null;
};

const BLANK_FILTERS: SearchFilters = {
  name: "", company: "", status: "", japanese_level: "", english_level: "",
  mandarin_level: "", cantonese_level: "", korean_level: "", other_language: "",
  last_touch: "", age_min: "", age_max: "", salary_min: "", salary_max: "",
  location: "", keywords: [], keyword_mode: "AND",
};

// ─── data hooks ───────────────────────────────────────────────────────────────

function useAllCandidates() {
  return useQuery({
    queryKey: ["advanced-search-candidates"],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<CandidateRow[]> => {
      const { data, error } = await supabase
        .from("candidates")
        .select(
          "id, full_name, full_name_japanese, current_title, current_company, japanese_level, english_level, candidate_status, placed_at, coin_icon_dismissed, age, current_base, base_minimum, notes_pitch, notes_personality, last_interaction_at, updated_at, processes ( stage, requisition_id, requisitions ( client_id ) )",
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((c) => {
        const procs = Array.isArray(c.processes) ? c.processes : [];
        const activeProc = procs.find(
          (p: { stage: string }) => p.stage !== "Placed" && p.stage !== "Closed lost",
        ) as { stage: string; requisition_id: string; requisitions: { client_id: string } | null } | undefined;

        return {
          id: c.id,
          full_name: c.full_name,
          full_name_japanese: c.full_name_japanese,
          current_title: c.current_title,
          current_company: c.current_company,
          japanese_level: c.japanese_level,
          english_level: c.english_level,
          candidate_status: c.candidate_status,
          placed_at: c.placed_at,
          coin_icon_dismissed: c.coin_icon_dismissed ?? false,
          age: c.age,
          current_base: c.current_base,
          base_minimum: c.base_minimum,
          notes_pitch: c.notes_pitch,
          notes_personality: c.notes_personality,
          last_interaction_at: c.last_interaction_at,
          updated_at: c.updated_at,
          activeStage: activeProc?.stage ?? null,
          activeProcessClientId: activeProc?.requisitions?.client_id ?? null,
        };
      });
    },
  });
}

function useClients() {
  return useQuery({
    queryKey: ["clients-simple"],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<ClientOption[]> => {
      const { data } = await supabase
        .from("clients")
        .select("id, company_name")
        .order("company_name");
      return (data ?? []) as ClientOption[];
    },
  });
}

function useRequisitions(clientId: string) {
  return useQuery({
    queryKey: ["requisitions-for-client", clientId],
    staleTime: 30_000,
    retry: 1,
    enabled: !!clientId,
    queryFn: async (): Promise<RequisitionOption[]> => {
      const { data } = await supabase
        .from("requisitions")
        .select("id, title, client_id")
        .eq("client_id", clientId)
        .eq("is_open", true)
        .order("title");
      return (data ?? []) as RequisitionOption[];
    },
  });
}

function useSavedLists() {
  return useQuery({
    queryKey: ["candidate-lists"],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<SavedList[]> => {
      const { data, error } = await supabase
        .from("candidate_lists")
        .select("id, name, created_by, visibility, candidate_ids, source, created_at, updated_at, recruiters ( full_name )")
        .order("updated_at", { ascending: false });
      if (error) {
        // table may not exist yet (pre-migration); return empty gracefully
        console.warn("candidate_lists not available:", error.message);
        return [];
      }
      return (data ?? []).map((row: {
        id: string; name: string; created_by: string; visibility: string;
        candidate_ids: string[]; source: string; created_at: string; updated_at: string;
        recruiters: { full_name: string | null } | null;
      }) => ({
        ...row,
        creator_name: row.recruiters?.full_name ?? null,
      }));
    },
  });
}

// ─── filter logic ─────────────────────────────────────────────────────────────

function isPlacedWithin90Days(c: CandidateRow): boolean {
  if (c.candidate_status !== "placed" || !c.placed_at) return false;
  return daysSince(c.placed_at) <= 90;
}

function locationMatch(c: CandidateRow, location: string): boolean {
  if (!location) return true;
  const searchIn = `${c.notes_pitch ?? ""} ${c.notes_personality ?? ""}`.toLowerCase();
  return searchIn.includes(location.toLowerCase());
}

function lastTouchMatch(c: CandidateRow, lastTouch: string): boolean {
  if (!lastTouch) return true;
  const ref = c.last_interaction_at ?? c.updated_at;
  const days = daysSince(ref);
  switch (lastTouch) {
    case "2w": return days <= 14;
    case "1m": return days <= 30;
    case "1_3m": return days > 14 && days <= 90;
    case "3m_plus": return days > 90;
    default: return true;
  }
}

function keywordMatch(c: CandidateRow, keywords: string[], mode: "AND" | "OR"): boolean {
  if (!keywords.length) return true;
  const haystack = [
    c.full_name, c.current_title, c.current_company,
    c.notes_pitch, c.notes_personality,
  ].filter(Boolean).join(" ").toLowerCase();
  if (mode === "AND") return keywords.every((kw) => haystack.includes(kw.toLowerCase()));
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

function applyFilters(candidates: CandidateRow[], filters: SearchFilters): CandidateRow[] {
  return candidates.filter((c) => {
    if (filters.name && !c.full_name.toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.company && !(c.current_company ?? "").toLowerCase().includes(filters.company.toLowerCase())) return false;
    if (filters.status && c.candidate_status !== filters.status) return false;
    if (filters.japanese_level && c.japanese_level !== filters.japanese_level) return false;
    if (filters.english_level && c.english_level !== filters.english_level) return false;
    if (filters.age_min && (c.age ?? 0) < parseInt(filters.age_min)) return false;
    if (filters.age_max && (c.age ?? 999) > parseInt(filters.age_max)) return false;
    const salMin = filters.salary_min ? parseFloat(filters.salary_min) * 1_000_000 : null;
    const salMax = filters.salary_max ? parseFloat(filters.salary_max) * 1_000_000 : null;
    const base = c.base_minimum ?? c.current_base ?? 0;
    if (salMin && base < salMin) return false;
    if (salMax && base > salMax) return false;
    if (!lastTouchMatch(c, filters.last_touch)) return false;
    if (!locationMatch(c, filters.location)) return false;
    if (!keywordMatch(c, filters.keywords, filters.keyword_mode)) return false;
    return true;
  });
}

// ─── main page ────────────────────────────────────────────────────────────────

function AdvancedSearch() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const candidates = useAllCandidates();
  const clients = useClients();

  const [filters, setFilters] = useState<SearchFilters>(BLANK_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerCandidate, setDrawerCandidate] = useState<CandidateRow | null>(null);

  // AI panel state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedReqId, setSelectedReqId] = useState("");
  const [threshold, setThreshold] = useState(45);
  const [useKeyCriteria, setUseKeyCriteria] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResults, setAiResults] = useState<AiResult[] | null>(null);

  // Save list state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [mergeStep, setMergeStep] = useState<string[]>([]);

  const requisitions = useRequisitions(selectedClientId);
  const savedLists = useSavedLists();

  // derive displayed candidates
  const allCandidates = candidates.data ?? [];
  const filtered = applyFilters(allCandidates, filters);

  // if AI results exist, overlay scores and re-sort; apply threshold
  const displayed: (CandidateRow & { aiScore?: number; aiReason?: string; meetsMustHaves?: boolean; closeOnMustHaves?: boolean })[] = aiResults
    ? filtered
        .map((c) => {
          const ai = aiResults.find((r) => r.candidate_id === c.id);
          return { ...c, aiScore: ai?.score, aiReason: ai?.reason, meetsMustHaves: ai?.meets_must_haves, closeOnMustHaves: ai?.close_on_must_haves };
        })
        .filter((c) => (c.aiScore ?? 0) >= threshold)
        .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))
    : filtered;

  // select all (only non-dimmed)
  const selectableIds = displayed
    .filter((c) => !(isPlacedWithin90Days(c) && !c.coin_icon_dismissed))
    .map((c) => c.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  async function runAiSearch() {
    if (!selectedReqId) {
      toast.error("Select a job to run AI search.");
      return;
    }
    setAiRunning(true);
    setAiResults(null);
    try {
      const resp = await fetch("/api/ai/advanced-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisition_id: selectedReqId,
          client_id: selectedClientId,
          threshold,
          use_key_criteria: useKeyCriteria,
          recruiter_id: user?.id,
        }),
      });
      const data = (await resp.json()) as { matches?: AiResult[]; error?: string };
      if (data.error) throw new Error(data.error);
      setAiResults(data.matches ?? []);
    } catch (e) {
      toast.error("Could not run AI search. Try again.");
    } finally {
      setAiRunning(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#eeede8" }}>
      {/* Left filter panel */}
      <div
        className="flex-shrink-0 overflow-y-auto"
        style={{ width: 220, borderRight: "0.5px solid rgba(26,26,24,0.12)", background: "#f5f5f3", padding: "16px 12px" }}
      >
        <LeftFilterPanel filters={filters} onChange={setFilters} />
      </div>

      {/* Centre results */}
      <div className="flex-1 min-w-0 overflow-y-auto px-4 py-4">
        <CenterPanel
          candidates={displayed}
          selectedIds={selectedIds}
          allSelected={allSelected}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelect={(id) => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            });
          }}
          onRowClick={setDrawerCandidate}
          onSaveList={() => setSaveModalOpen(true)}
          showKeyCriteriaLegend={useKeyCriteria && !!aiResults}
          selectedClientId={selectedClientId}
          isLoading={candidates.isLoading}
        />
      </div>

      {/* Right AI panel */}
      <div
        className="flex-shrink-0 overflow-y-auto"
        style={{ width: 200, borderLeft: "0.5px solid rgba(26,26,24,0.12)", background: "#f5f5f3", padding: "16px 12px" }}
      >
        <RightPanel
          clients={clients.data ?? []}
          selectedClientId={selectedClientId}
          onClientChange={(id) => { setSelectedClientId(id); setSelectedReqId(""); setAiResults(null); }}
          requisitions={requisitions.data ?? []}
          selectedReqId={selectedReqId}
          onReqChange={(id) => { setSelectedReqId(id); setAiResults(null); }}
          threshold={threshold}
          onThresholdChange={setThreshold}
          useKeyCriteria={useKeyCriteria}
          onKeyCriteriaChange={setUseKeyCriteria}
          onRunSearch={runAiSearch}
          aiRunning={aiRunning}
          savedLists={savedLists.data ?? []}
          mergeStep={mergeStep}
          onMergeSelect={(id) => {
            setMergeStep((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev,
            );
          }}
          onMergeLists={async () => {
            if (mergeStep.length !== 2) return;
            const [a, b] = mergeStep;
            const listA = savedLists.data?.find((l) => l.id === a);
            const listB = savedLists.data?.find((l) => l.id === b);
            if (!listA || !listB) return;
            // Merge: union, dedupe (prefer higher-score if AI)
            const merged = Array.from(new Set([...listA.candidate_ids, ...listB.candidate_ids]));
            const removed = listA.candidate_ids.length + listB.candidate_ids.length - merged.length;
            // Load merged candidates into centre and open save modal
            setSelectedIds(new Set(merged));
            setSaveModalOpen(true);
            toast.success(`${removed} duplicate${removed !== 1 ? "s" : ""} removed. ${merged.length} candidates in merged list.`);
            setMergeStep([]);
          }}
          onLoadList={(list) => {
            setSelectedIds(new Set(list.candidate_ids));
            toast.success(`Loaded "${list.name}" — ${list.candidate_ids.length} candidates.`);
          }}
        />
      </div>

      {/* Side drawer */}
      {drawerCandidate && (
        <CandidateDrawer
          candidate={drawerCandidate}
          onClose={() => setDrawerCandidate(null)}
        />
      )}

      {/* Save list modal */}
      {saveModalOpen && (
        <SaveListModal
          selectedIds={selectedIds}
          recruiterId={user?.id ?? ""}
          onClose={() => setSaveModalOpen(false)}
          onSaved={() => {
            setSaveModalOpen(false);
            void qc.invalidateQueries({ queryKey: ["candidate-lists"] });
          }}
        />
      )}
    </div>
  );
}

// ─── left filter panel ────────────────────────────────────────────────────────

function LanguageDropdown({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[12px] transition-colors"
        style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{value ? `${label} — ${value}` : label}</span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="rounded hover:bg-black/10 p-0.5"
            >
              <IconX size={10} />
            </span>
          )}
          <IconChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
        </div>
      </button>
      {open && (
        <div className="mt-1 rounded border overflow-hidden" style={{ borderColor: "rgba(26,26,24,0.12)", background: "#fff" }}>
          {LANGUAGE_LEVELS.map((lvl) => (
            <button
              key={lvl}
              className="block w-full px-2 py-1 text-left text-[12px] transition-colors hover:bg-surface"
              style={{ color: value === lvl ? "#185fa5" : "#1a1a18", fontWeight: value === lvl ? 500 : 400 }}
              onClick={() => { onChange(lvl); setOpen(false); }}
            >
              {lvl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-1 mt-3" style={{ color: "#5f5e5a" }}>
      {children}
    </p>
  );
}

function FilterInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className="w-full rounded px-2 py-1.5 text-[12px] outline-none"
      style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function LeftFilterPanel({
  filters,
  onChange,
}: {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
}) {
  const [keywordInput, setKeywordInput] = useState("");
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });

  function addKeyword() {
    const kw = keywordInput.trim();
    if (!kw || filters.keywords.includes(kw)) return;
    set({ keywords: [...filters.keywords, kw] });
    setKeywordInput("");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold" style={{ color: "#1a1a18" }}>Filters</p>
        <button
          className="text-[11px] transition-colors"
          style={{ color: "#5f5e5a" }}
          onClick={() => onChange(BLANK_FILTERS)}
        >
          Clear all
        </button>
      </div>

      {/* Basic filters */}
      <FilterLabel>Candidate</FilterLabel>
      <FilterInput placeholder="Name" value={filters.name} onChange={(v) => set({ name: v })} />
      <div className="mt-1.5">
        <FilterInput placeholder="Company" value={filters.company} onChange={(v) => set({ company: v })} />
      </div>

      <FilterLabel>Status</FilterLabel>
      <select
        className="w-full rounded px-2 py-1.5 text-[12px]"
        style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
        value={filters.status}
        onChange={(e) => set({ status: e.target.value })}
      >
        <option value="">Any status</option>
        {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <FilterLabel>Last touch</FilterLabel>
      <select
        className="w-full rounded px-2 py-1.5 text-[12px]"
        style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
        value={filters.last_touch}
        onChange={(e) => set({ last_touch: e.target.value })}
      >
        <option value="">Any time</option>
        {LAST_TOUCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Language filters */}
      <FilterLabel>Languages</FilterLabel>
      <LanguageDropdown label="Japanese" value={filters.japanese_level} onChange={(v) => set({ japanese_level: v })} />
      <LanguageDropdown label="English" value={filters.english_level} onChange={(v) => set({ english_level: v })} />
      <LanguageDropdown label="Mandarin (ZH)" value={filters.mandarin_level} onChange={(v) => set({ mandarin_level: v })} />
      <LanguageDropdown label="Cantonese (ZH)" value={filters.cantonese_level} onChange={(v) => set({ cantonese_level: v })} />
      <LanguageDropdown label="Korean (KO)" value={filters.korean_level} onChange={(v) => set({ korean_level: v })} />
      <div className="mt-1">
        <FilterInput placeholder="Other language" value={filters.other_language} onChange={(v) => set({ other_language: v })} />
      </div>

      {/* Age */}
      <FilterLabel>Age range</FilterLabel>
      <div className="flex gap-1.5">
        <input
          type="number"
          className="w-full rounded px-2 py-1.5 text-[12px]"
          style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
          placeholder="Min"
          min={18}
          max={70}
          value={filters.age_min}
          onChange={(e) => set({ age_min: e.target.value })}
        />
        <input
          type="number"
          className="w-full rounded px-2 py-1.5 text-[12px]"
          style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
          placeholder="Max"
          min={18}
          max={70}
          value={filters.age_max}
          onChange={(e) => set({ age_max: e.target.value })}
        />
      </div>

      {/* Salary */}
      <FilterLabel>Base salary (¥M)</FilterLabel>
      <div className="flex gap-1.5">
        <input
          type="number"
          className="w-full rounded px-2 py-1.5 text-[12px]"
          style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
          placeholder="Min ¥M"
          min={0}
          value={filters.salary_min}
          onChange={(e) => set({ salary_min: e.target.value })}
        />
        <input
          type="number"
          className="w-full rounded px-2 py-1.5 text-[12px]"
          style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
          placeholder="Max ¥M"
          min={0}
          value={filters.salary_max}
          onChange={(e) => set({ salary_max: e.target.value })}
        />
      </div>

      {/* Location */}
      <FilterLabel>Preferred location</FilterLabel>
      <select
        className="w-full rounded px-2 py-1.5 text-[12px]"
        style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
        value={filters.location}
        onChange={(e) => set({ location: e.target.value })}
      >
        <option value="">Any prefecture</option>
        {JAPAN_PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      {/* Keywords */}
      <FilterLabel>Keywords</FilterLabel>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[11px]" style={{ color: "#5f5e5a" }}>Match:</span>
        {(["AND", "OR"] as const).map((mode) => (
          <button
            key={mode}
            className="rounded px-1.5 py-0.5 text-[11px] transition-colors"
            style={{
              background: filters.keyword_mode === mode ? "#1a1a18" : "rgba(26,26,24,0.08)",
              color: filters.keyword_mode === mode ? "#fff" : "#5f5e5a",
            }}
            onClick={() => set({ keyword_mode: mode })}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          className="flex-1 min-w-0 rounded px-2 py-1.5 text-[12px]"
          style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
          placeholder="Add keyword…"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
        />
        <button
          className="rounded px-2 py-1.5 text-[12px] transition-colors"
          style={{ background: "rgba(26,26,24,0.08)", color: "#1a1a18" }}
          onClick={addKeyword}
        >
          <IconPlus size={12} />
        </button>
      </div>
      {filters.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {filters.keywords.map((kw) => (
            <span
              key={kw}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px]"
              style={{ background: "#e6f1fb", color: "#185fa5" }}
            >
              {kw}
              <button onClick={() => set({ keywords: filters.keywords.filter((k) => k !== kw) })}>
                <IconX size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── centre panel ─────────────────────────────────────────────────────────────

function MatchBar({ score }: { score: number }) {
  const color = score >= 80 ? "#27500a" : score >= 60 ? "#185fa5" : "#633806";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(26,26,24,0.1)" }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[11px] font-medium" style={{ color }}>{score}%</span>
    </div>
  );
}

type DisplayedCandidate = CandidateRow & {
  aiScore?: number;
  aiReason?: string;
  meetsMustHaves?: boolean;
  closeOnMustHaves?: boolean;
};

function CandidateResultRow({
  candidate,
  selected,
  onToggle,
  onRowClick,
  showAiScore,
  showKeyCriteria,
  selectedClientId,
}: {
  candidate: DisplayedCandidate;
  selected: boolean;
  onToggle: () => void;
  onRowClick: () => void;
  showAiScore: boolean;
  showKeyCriteria: boolean;
  selectedClientId: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const dimmed = isPlacedWithin90Days(candidate) && !candidate.coin_icon_dismissed;
  const locationUnknown = !candidate.notes_pitch?.match(/\b(?:Tokyo|Osaka|Kyoto|Kanagawa|Aichi|Fukuoka|Saitama|Chiba|Hokkaido|Hyogo)\b/i);

  // Key criteria row tinting
  let rowBg = "transparent";
  if (showKeyCriteria && showAiScore && candidate.aiScore !== undefined) {
    if (candidate.meetsMustHaves) rowBg = "rgba(39,80,10,0.04)";
    else if (candidate.closeOnMustHaves) rowBg = "rgba(99,56,6,0.04)";
  }

  const conflictWithClient =
    selectedClientId && candidate.activeProcessClientId === selectedClientId;

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5  transition-colors"
      style={{
        background: rowBg,
        opacity: dimmed ? 0.5 : 1,
        cursor: "default",
        borderBottom: "0.5px solid rgba(26,26,24,0.07)",
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        disabled={dimmed}
        onChange={onToggle}
        className="flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Avatar */}
      <div
        className="flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-medium"
        style={{ background: "#eeede8", color: "#1a1a18" }}
      >
        {initials(candidate.full_name)}
      </div>

      {/* Name + summary — clickable to open drawer */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onRowClick}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium truncate" style={{ color: "#1a1a18" }}>
            {candidate.full_name}
          </span>
          {dimmed && (
            <span title="Placed within 90 days — remove placement flag on profile to include">🪙</span>
          )}
          {locationUnknown && (
            <span title="Location preference unknown — defaulted to Tokyo">
              <IconFlag size={12} style={{ color: "#633806" }} />
            </span>
          )}
          {conflictWithClient && (
            <span
              className="rounded px-1 py-0.5 text-[10px]"
              style={{ background: "#fcebeb", color: "#a32d2d" }}
            >
              Active process
            </span>
          )}
        </div>
        <p className="text-[12px] truncate" style={{ color: "#5f5e5a" }}>
          {[candidate.current_title, candidate.current_company].filter(Boolean).join(" · ")}
          {candidate.japanese_level ? ` · JA: ${candidate.japanese_level}` : ""}
          {candidate.english_level ? ` · EN: ${candidate.english_level}` : ""}
        </p>
      </div>

      {/* Key criteria chip */}
      {showKeyCriteria && showAiScore && candidate.aiScore !== undefined && (
        <div className="flex-shrink-0">
          {candidate.meetsMustHaves ? (
            <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#eaf3de", color: "#27500a" }}>
              All criteria met
            </span>
          ) : candidate.closeOnMustHaves ? (
            <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#fdf3e7", color: "#633806" }}>
              Close match
            </span>
          ) : null}
        </div>
      )}

      {/* Match bar (AI only) */}
      {showAiScore && candidate.aiScore !== undefined && (
        <div className="flex-shrink-0">
          <MatchBar score={candidate.aiScore} />
        </div>
      )}

      {/* Stage badge */}
      {candidate.activeStage && (
        <div className="flex-shrink-0">
          <StageBadge stage={candidate.activeStage} />
        </div>
      )}

      {/* Info tooltip */}
      <div className="flex-shrink-0 relative">
        <button
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => setShowTooltip((v) => !v)}
          className="transition-colors"
          style={{ color: "#888780" }}
        >
          <IconInfoCircle size={14} />
        </button>
        {showTooltip && (
          <div
            className="absolute right-0 bottom-6 z-20 w-52  p-2.5  text-[12px]"
            style={{ background: "#1a1a18", color: "#fff" }}
          >
            {candidate.aiReason
              ? candidate.aiReason
              : "Matched by manual filters. Run AI Search to see fit score and reasoning."}
          </div>
        )}
      </div>
    </div>
  );
}

function CenterPanel({
  candidates,
  selectedIds,
  allSelected,
  onToggleSelectAll,
  onToggleSelect,
  onRowClick,
  onSaveList,
  showKeyCriteriaLegend,
  selectedClientId,
  isLoading,
}: {
  candidates: DisplayedCandidate[];
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onRowClick: (c: CandidateRow) => void;
  onSaveList: () => void;
  showKeyCriteriaLegend: boolean;
  selectedClientId: string;
  isLoading: boolean;
}) {
  const showAiScore = candidates.some((c) => c.aiScore !== undefined);

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
        <span className="text-[12px] flex-1" style={{ color: "#5f5e5a" }}>
          {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
          {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
        </span>
        {selectedIds.size > 0 && (
          <button
            className="flex items-center gap-1.5  px-3 py-1.5 text-[12px] transition-colors"
            style={{ background: "#1a1a18", color: "#fff" }}
            onClick={onSaveList}
          >
            <IconDeviceFloppy size={13} />
            Save list
          </button>
        )}
      </div>

      {/* Key criteria legend */}
      {showKeyCriteriaLegend && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2  text-[12px]" style={{ background: "#f5f5f3" }}>
          <span style={{ color: "#5f5e5a" }}>Row tinting:</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(39,80,10,0.15)" }} />
            <span style={{ color: "#27500a" }}>All criteria met</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(99,56,6,0.15)" }} />
            <span style={{ color: "#633806" }}>Close match</span>
          </span>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12  animate-pulse" style={{ background: "rgba(26,26,24,0.06)" }} />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <IconUsers size={32} style={{ color: "#888780", marginBottom: 8 }} />
          <p className="text-[13px]" style={{ color: "#5f5e5a" }}>No candidates match your filters.</p>
          <p className="text-[12px] mt-1" style={{ color: "#888780" }}>Try adjusting the filters or run an AI search.</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {candidates.map((c) => (
            <CandidateResultRow
              key={c.id}
              candidate={c}
              selected={selectedIds.has(c.id)}
              onToggle={() => onToggleSelect(c.id)}
              onRowClick={() => onRowClick(c)}
              showAiScore={showAiScore}
              showKeyCriteria={showKeyCriteriaLegend}
              selectedClientId={selectedClientId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── side drawer ──────────────────────────────────────────────────────────────

function CandidateDrawer({
  candidate,
  onClose,
}: {
  candidate: CandidateRow;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  // Motivations query for this candidate
  const motivations = useQuery({
    queryKey: ["candidates", candidate.id, "motivations"],
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data } = await supabase
        .from("candidate_motivations")
        .select("motivation_type, rank")
        .eq("candidate_id", candidate.id)
        .order("rank")
        .limit(2);
      return data ?? [];
    },
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-20"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed top-0 right-0 z-30 h-full overflow-y-auto "
        style={{ width: 320, background: "#fff", borderLeft: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "rgba(26,26,24,0.12)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "#1a1a18" }}>Quick view</p>
          <button onClick={onClose} className="rounded p-1 transition-colors hover:bg-surface">
            <IconX size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center text-[13px] font-medium"
                style={{ background: "#eeede8", color: "#1a1a18" }}
              >
                {initials(candidate.full_name)}
              </div>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: "#1a1a18" }}>{candidate.full_name}</p>
                {candidate.full_name_japanese && (
                  <p className="text-[12px]" style={{ color: "#5f5e5a" }}>{candidate.full_name_japanese}</p>
                )}
              </div>
            </div>
          </div>

          {/* Current role */}
          {(candidate.current_title || candidate.current_company) && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-1" style={{ color: "#5f5e5a" }}>Current role</p>
              <p className="text-[13px]" style={{ color: "#1a1a18" }}>
                {[candidate.current_title, candidate.current_company].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}

          {/* Languages */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-1" style={{ color: "#5f5e5a" }}>Languages</p>
            <div className="flex gap-2 flex-wrap">
              {candidate.japanese_level && (
                <span className="text-[12px] rounded px-2 py-0.5" style={{ background: "#f5f5f3" }}>
                  JA: {candidate.japanese_level}
                </span>
              )}
              {candidate.english_level && (
                <span className="text-[12px] rounded px-2 py-0.5" style={{ background: "#f5f5f3" }}>
                  EN: {candidate.english_level}
                </span>
              )}
            </div>
          </div>

          {/* Motivations */}
          {(motivations.data ?? []).length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-1" style={{ color: "#5f5e5a" }}>Top motivations</p>
              <div className="space-y-1">
                {(motivations.data ?? []).map((m: { motivation_type: string | null; rank: number }) => (
                  <p key={m.rank} className="text-[12px]" style={{ color: "#1a1a18" }}>
                    {m.rank}. {(m.motivation_type ?? "").replace(/_/g, " ")}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Stage + last touch */}
          <div className="flex gap-4">
            {candidate.activeStage && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-1" style={{ color: "#5f5e5a" }}>Stage</p>
                <StageBadge stage={candidate.activeStage} />
              </div>
            )}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-1" style={{ color: "#5f5e5a" }}>Last touch</p>
              <p className="text-[12px]" style={{ color: "#1a1a18" }}>
                {relativeTime(candidate.last_interaction_at ?? candidate.updated_at)}
              </p>
            </div>
          </div>

          {/* Open full profile */}
          <button
            className="w-full  py-2 text-[13px] font-medium transition-colors"
            style={{ background: "#1a1a18", color: "#fff" }}
            onClick={() =>
              navigate({
                to: "/candidates/$id",
                params: { id: candidate.id },
                search: BLANK_CANDIDATE_SEARCH,
              })
            }
          >
            Open full profile
          </button>
        </div>
      </div>
    </>
  );
}

// ─── right panel ──────────────────────────────────────────────────────────────

function RightPanel({
  clients,
  selectedClientId,
  onClientChange,
  requisitions,
  selectedReqId,
  onReqChange,
  threshold,
  onThresholdChange,
  useKeyCriteria,
  onKeyCriteriaChange,
  onRunSearch,
  aiRunning,
  savedLists,
  mergeStep,
  onMergeSelect,
  onMergeLists,
  onLoadList,
}: {
  clients: ClientOption[];
  selectedClientId: string;
  onClientChange: (id: string) => void;
  requisitions: RequisitionOption[];
  selectedReqId: string;
  onReqChange: (id: string) => void;
  threshold: number;
  onThresholdChange: (v: number) => void;
  useKeyCriteria: boolean;
  onKeyCriteriaChange: (v: boolean) => void;
  onRunSearch: () => void;
  aiRunning: boolean;
  savedLists: SavedList[];
  mergeStep: string[];
  onMergeSelect: (id: string) => void;
  onMergeLists: () => void;
  onLoadList: (list: SavedList) => void;
}) {
  return (
    <div className="space-y-4">
      {/* AI Search section */}
      <div>
        <p className="text-[13px] font-semibold mb-3" style={{ color: "#1a1a18" }}>AI Search</p>

        <div className="space-y-2">
          <select
            className="w-full rounded px-2 py-1.5 text-[12px]"
            style={{ background: "rgba(26,26,24,0.06)", color: "#1a1a18", border: "none" }}
            value={selectedClientId}
            onChange={(e) => onClientChange(e.target.value)}
          >
            <option value="">Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>

          <select
            className="w-full rounded px-2 py-1.5 text-[12px]"
            style={{ background: "rgba(26,26,24,0.06)", color: selectedReqId ? "#1a1a18" : "#888780", border: "none" }}
            value={selectedReqId}
            onChange={(e) => onReqChange(e.target.value)}
            disabled={!selectedClientId}
          >
            <option value="">Select job…</option>
            {requisitions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px]" style={{ color: "#5f5e5a" }}>Match threshold</span>
              <span className="text-[11px] font-medium" style={{ color: "#1a1a18" }}>{threshold}%</span>
            </div>
            <input
              type="range"
              min={30}
              max={80}
              value={threshold}
              onChange={(e) => onThresholdChange(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useKeyCriteria}
              onChange={(e) => onKeyCriteriaChange(e.target.checked)}
            />
            <span className="text-[12px]" style={{ color: "#1a1a18" }}>Narrow by Key Criteria</span>
          </label>

          <button
            className="flex w-full items-center justify-center gap-1.5  py-2 text-[12px] font-medium transition-colors"
            style={{
              background: selectedReqId ? "#1a1a18" : "rgba(26,26,24,0.12)",
              color: selectedReqId ? "#fff" : "#888780",
            }}
            onClick={onRunSearch}
            disabled={aiRunning || !selectedReqId}
          >
            {aiRunning ? (
              <><IconLoader2 size={13} className="animate-spin" /> Searching…</>
            ) : (
              <><IconSparkles size={13} /> Run AI Search</>
            )}
          </button>
        </div>
      </div>

      {/* Saved lists section */}
      <div style={{ borderTop: "0.5px solid rgba(26,26,24,0.12)", paddingTop: 12 }}>
        <p className="text-[13px] font-semibold mb-2" style={{ color: "#1a1a18" }}>Saved lists</p>

        {savedLists.length === 0 ? (
          <p className="text-[12px]" style={{ color: "#888780" }}>No saved lists yet.</p>
        ) : (
          <div className="space-y-1.5">
            {savedLists.map((list) => (
              <div
                key={list.id}
                className=" px-2 py-2"
                style={{
                  background: mergeStep.includes(list.id) ? "#e6f1fb" : "rgba(26,26,24,0.04)",
                  border: mergeStep.includes(list.id) ? "1px solid #185fa5" : "1px solid transparent",
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate" style={{ color: "#1a1a18" }}>{list.name}</p>
                    <p className="text-[11px]" style={{ color: "#5f5e5a" }}>
                      {list.candidate_ids.length} candidates
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {list.visibility === "private" ? (
                        <IconLock size={10} style={{ color: "#888780" }} />
                      ) : (
                        <IconWorld size={10} style={{ color: "#888780" }} />
                      )}
                      <span className="text-[10px]" style={{ color: "#888780" }}>
                        {list.creator_name ?? ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      className="rounded px-1.5 py-0.5 text-[10px] transition-colors"
                      style={{ background: "rgba(26,26,24,0.08)", color: "#1a1a18" }}
                      onClick={() => onLoadList(list)}
                    >
                      Load
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 text-[10px] transition-colors"
                      style={{
                        background: mergeStep.includes(list.id) ? "#185fa5" : "rgba(26,26,24,0.06)",
                        color: mergeStep.includes(list.id) ? "#fff" : "#5f5e5a",
                      }}
                      onClick={() => onMergeSelect(list.id)}
                    >
                      {mergeStep.includes(list.id) ? "✓" : "Merge"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {mergeStep.length === 2 && (
          <button
            className="mt-2 w-full  py-1.5 text-[12px] font-medium"
            style={{ background: "#185fa5", color: "#fff" }}
            onClick={onMergeLists}
          >
            Merge & dedupe
          </button>
        )}
        {mergeStep.length === 1 && (
          <p className="mt-1.5 text-[11px] text-center" style={{ color: "#888780" }}>
            Select one more list to merge.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── save list modal ──────────────────────────────────────────────────────────

function SaveListModal({
  selectedIds,
  recruiterId,
  onClose,
  onSaved,
}: {
  selectedIds: Set<string>;
  recruiterId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { toast.error("Enter a list name."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("candidate_lists").insert({
        name: name.trim(),
        created_by: recruiterId,
        visibility,
        candidate_ids: Array.from(selectedIds),
        source: "manual",
      });
      if (error) throw error;
      toast.success(`"${name.trim()}" saved — ${selectedIds.size} candidates.`);
      onSaved();
    } catch {
      toast.error("Could not save list. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-80  p-5 " style={{ background: "#fff" }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[14px] font-semibold" style={{ color: "#1a1a18" }}>Save list</p>
          <button onClick={onClose}><IconX size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium block mb-1" style={{ color: "#5f5e5a" }}>List name</label>
            <input
              autoFocus
              className="w-full rounded px-3 py-2 text-[13px] outline-none"
              style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.2)", color: "#1a1a18" }}
              placeholder="e.g. Senior Java — Tokyo Q3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#5f5e5a" }}>Visibility</label>
            <div className="flex gap-2">
              {(["team", "private"] as const).map((v) => (
                <button
                  key={v}
                  className="flex-1 flex items-center justify-center gap-1.5  py-1.5 text-[12px] transition-colors"
                  style={{
                    background: visibility === v ? "#1a1a18" : "rgba(26,26,24,0.06)",
                    color: visibility === v ? "#fff" : "#5f5e5a",
                  }}
                  onClick={() => setVisibility(v)}
                >
                  {v === "team" ? <IconWorld size={12} /> : <IconLock size={12} />}
                  {v === "team" ? "My team" : "Just me"}
                </button>
              ))}
            </div>
            {visibility === "team" && (
              <p className="mt-1.5 text-[11px]" style={{ color: "#888780" }}>
                Team lists are read-only for others. Teammates can load and build on this list, but any changes save as a new list — your original stays intact.
              </p>
            )}
          </div>

          <p className="text-[12px]" style={{ color: "#5f5e5a" }}>{selectedIds.size} candidates selected</p>

          <button
            className="w-full  py-2 text-[13px] font-medium"
            style={{ background: "#1a1a18", color: "#fff" }}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save list"}
          </button>
        </div>
      </div>
    </div>
  );
}
