import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { IconUsers } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime, initials } from "@/lib/candidate-utils";
import { interactionTypeLabel } from "@/components/shared/LogActivityModal";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";

// The team-visibility half of the multi-user promise (CLAUDE.md §5): what
// teammates logged, visible without entering the logged-in recruiter's own
// priority queue. Read-only — no done/snooze/reorder, on purpose. That
// behavior belongs to PrioritySection alone; this is a feed, not a to-do list.

type TeamActivityItem = {
  id: string;
  interaction_type: string;
  summary: string | null;
  interacted_at: string;
  primary_party: string | null;
  candidate_id: string | null;
  client_id: string | null;
  candidates: { full_name: string } | null;
  clients: { company_name: string } | null;
  recruiters: { full_name: string | null } | null;
};

const INITIAL_VISIBLE = 8;
const MAX_FETCHED = 30;

function useTeamActivity(recruiterId: string) {
  return useQuery({
    queryKey: ["team-activity", recruiterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select(
          "id, interaction_type, summary, interacted_at, primary_party, candidate_id, client_id, candidates ( full_name ), clients ( company_name ), recruiters ( full_name )",
        )
        .neq("recruiter_id", recruiterId)
        .eq("is_future", false)
        .order("interacted_at", { ascending: false })
        .limit(MAX_FETCHED);
      if (error) throw error;
      return (data ?? []) as unknown as TeamActivityItem[];
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function TeamActivityFeed({ recruiterId }: { recruiterId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useTeamActivity(recruiterId);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - visible.length;

  function handleNavigate(item: TeamActivityItem) {
    if (item.candidate_id) {
      void navigate({ to: "/candidates/$id", params: { id: item.candidate_id }, search: BLANK_CANDIDATE_SEARCH });
    } else if (item.client_id) {
      void navigate({ to: "/clients/$id", params: { id: item.client_id } });
    }
  }

  return (
    <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        <IconUsers size={14} style={{ color: "var(--color-ink-60)" }} />
        <span className="text-[12px] font-medium">{t("dashboard.teamActivity.title")}</span>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          {t("dashboard.teamActivity.loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          {t("dashboard.teamActivity.empty")}
        </div>
      ) : (
        <>
          <div>
            {visible.map((item) => {
              const who = item.recruiters?.full_name ?? t("dashboard.teamActivity.unknownRecruiter");
              const target = item.candidates?.full_name ?? item.clients?.company_name ?? null;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item)}
                  disabled={!item.candidate_id && !item.client_id}
                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--color-ink-10)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    className="flex items-center justify-center shrink-0 text-[10px] font-medium"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 9999,
                      background: "var(--color-ink-15)",
                      color: "var(--color-ink-60)",
                    }}
                  >
                    {initials(who)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">
                      <span className="font-medium">{who}</span>
                      <span style={{ color: "var(--color-ink-30)" }}> · </span>
                      <span>{interactionTypeLabel(item.interaction_type, item.primary_party)}</span>
                      {target && (
                        <>
                          <span style={{ color: "var(--color-ink-30)" }}> — </span>
                          <span>{target}</span>
                        </>
                      )}
                    </p>
                    {item.summary && (
                      <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--color-ink-30)" }}>
                        {item.summary}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] shrink-0 mt-0.5" style={{ color: "var(--color-ink-30)" }}>
                    {relativeTime(item.interacted_at)}
                  </span>
                </button>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-2 text-[12px] text-center"
              style={{ color: "var(--color-indigo)" }}
            >
              {t("dashboard.detail.showMore", { count: hiddenCount })}
            </button>
          )}
        </>
      )}
    </div>
  );
}
