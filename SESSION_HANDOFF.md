# Kanri — Session Handoff Document

> Generated: 30 May 2026
> Last commit: `26e4770` — Steps 1–9 of KANRI_HANDOVER.md complete
> Build status: **passing** (TypeScript clean, all 9 steps implemented)

---

## Project Overview

Kanri is an AI-native recruiter intelligence platform and CRM for boutique agency recruiters in the Japan bilingual talent market. It is a full CRM replacement — not an ATS overlay — for recruiters placing bilingual professionals at foreign firms in Japan.

**Core thesis:** Recruiters lose hours rebuilding context before every call and making prioritisation decisions with incomplete information. Kanri eliminates that tax.

**Target users:** Boutique and mid-sized agency recruiting firms. Initial focus: Japan bilingual and gaishikei recruitment. Reference companies: Torch (Vincere ATS, 4 consultants), Robert Walters Japan, Hays.

**Current implementation status:** All 9 steps of KANRI_HANDOVER.md are complete. The application is fully functional end-to-end. No planned handover steps remain — further work is enhancement and polish.

---

## What Was Completed This Session (Steps 6–9)

### Prerequisite fixes (before Step 6)
- **PDF JD text extraction** — added `api/extract-text.ts` (uses `pdf-parse`), wired into `RequisitionIntakeModal`; PDF JDs now produce real extracted text for `extract-conditions`
- **Competing interview toggle** — added `qc.invalidateQueries` after `is_active` update so the cache stays in sync
- **Dashboard rewired** — `dashboard.tsx` now calls `POST /api/ai/daily-agenda` and renders the real AI output shape

### Step 6 — `/jobs/$id` Requisition Detail Page
File: `src/routes/_authenticated/jobs.$id.tsx`

**Left panel:**
- JD viewer — signed URL iframe for PDF, plain text fallback for extracted text
- Strategic context — inline textarea, saves on blur
- Salary + interview summary card
- Conditions card — add/edit/delete; must-have (amber dots) vs nice-to-have (grey dots); client-sourced conditions labelled "(client)"

**Right panel:**
- Pipeline — processes grouped by stage, each card has candidate name, stage badge, last activity time; click navigates to candidate

**Match Candidates panel** (full-width toggle):
- Calls `match-candidates.ts`, renders AI-ranked list with score, role, match reason, salary stretch warning
- "Spec" creates a process at Specs Sent + navigates to the candidate
- "Skip" dismisses from session (local state, not persisted)

`jobs.tsx` updated: `JobRow` now navigates to `/jobs/$id` instead of `/clients/$id`.

### Step 7 — Dashboard Extensions
File: `src/routes/_authenticated/dashboard.tsx` (full rewrite)

- **AI daily agenda** — calls `daily-agenda.ts`, renders `reason` (amber), `suggested_action`, action button mapped to `action_type`
- **Drag to reorder** — HTML5 drag API, reorders local state (no persistence)
- **Done for today** — localStorage `kanri_done_today`, keyed by entity_id + date; re-evaluates daily
- **Snooze** — localStorage `kanri_snoozed`, keyed by entity_id; date picker; item hidden until snooze date passes
- **Pipeline Pulse** — stage count chips (Specs Sent / Buy-In / CV Sent / Interviewing / Offer), navigate to candidates
- **KPI strip** — CVs sent MTD, Specs active, In interviews, Offers MTD, Placed MTD
- **Recent activity** — own interactions last 10, newest first

### Step 8 — Candidate Search
File: `src/routes/_authenticated/candidates.tsx`

- 6 filters stored in TanStack Router URL search params (survive refresh): `name`, `company`, `status`, `japanese_level`, `source`, `last_touch`
- Server-side Supabase query replaces client-side filtering; all filters chain conditionally
- Last touch filter: active < 30d, cooling 30–60d, cold > 60d (handles null)
- Debounced text inputs (300ms) for name and company
- `FilterSelect` component — active filter highlights blue
- Count in header reflects filtered results
- Exported `BLANK_CANDIDATE_SEARCH` and `withCandidateDefaults()` used by all callers navigating to `/candidates/*`

### Step 9 — Data Integrity
Files: `candidates.$id.tsx`, `clients.$id.tsx`

**Stage change:**
- `PIPELINE_STAGES` constant and `useStageChange` mutation hook in candidates.$id.tsx
- Stage dropdown in `ProcessPanel` header (replaces static StageBadge)
- On stage change: always sets `processes.last_activity_at = now()`
- → Buy-In: sets `buy_in_confirmed_at = now()` if null
- → CV Sent: sets `cv_sent_at = now()` if null
- → Placed: sets `placed_date = today`, sets `candidates.candidate_status = 'placed'`, sets `candidates.placement_guarantee_until = today + 90 days`

**Interaction side effects:**
- `TranscriptPanel` now sets `processes.last_activity_at` on all active processes for the candidate when saving a transcript interaction

**Client status:**
- `ClientStatusSelect` component replaces static status badge in client header
- Inline dropdown (Prospect / Active / Inactive) with live mutation
- Warning toast (`toast.warning`) fires when status → Active but `contract_signed = false`

---

## Current Architecture

### Frontend Structure
```
src/
  routes/
    __root.tsx                    # Root layout
    index.tsx                     # Redirects to /dashboard
    login.tsx                     # Supabase email auth
    _authenticated.tsx            # Auth guard + sidebar layout
    _authenticated/
      dashboard.tsx               # Daily agenda + KPI strip + pipeline pulse
      candidates.tsx              # Candidate list — 6 server-side filters, URL search params
      candidates.$id.tsx          # Candidate detail — 4 tabs (~3,500+ lines)
      clients.tsx                 # Client list
      clients.$id.tsx             # Client detail — 3 tabs (~3,300+ lines)
      jobs.tsx                    # Jobs list + revenue forecast → links to /jobs/$id
      jobs.$id.tsx                # NEW — Requisition detail page
  components/
    ui/                           # shadcn/ui primitives — never modify
    shared/                       # Card, SectionLabel, FieldRow, StageBadge
    candidate/
      SubmissionPreview.tsx       # Ported from CVFlow — available for future use
    dashboard/
    layout/
  lib/
    candidate-utils.ts            # All domain utility functions
    pdf-utils.ts                  # Bilingual PDF generation (ported from CVFlow)
    supabase.ts                   # Browser Supabase client
    supabase-server.ts            # Service role client (server-side only)
    auth-context.tsx              # Auth context provider
  integrations/
    supabase/
      types.ts                    # Generated types + custom app types appended at bottom
  styles.css                      # Design tokens + Noto Sans JP import
```

### Backend Structure
```
api/
  extract-text.ts                 # NEW — PDF text extraction via pdf-parse (base64 → text)
  ai/
    client-draft.ts
    client-meeting-prep.ts
    client-snapshot.ts
    closing-script.ts
    daily-agenda.ts
    enrich-client.ts              # Tavily-powered company enrichment
    extract-candidate.ts
    extract-conditions.ts         # JD → must-have/nice-to-have conditions
    interview-prep.ts
    match-candidates.ts           # AI candidate ranking against a requisition
    positioning.ts
    pre-call-briefing.ts          # Supports candidate + client entity types
    process-transcript.ts
    refresh-context.ts            # Background ai_context regeneration
    req-strategic-context.ts
    spec-email.ts
    submission-note.ts            # Full bilingual submission package
scripts/
  dev-api.ts                      # Local dev API server (tsx watch at :3001)
```

### Database Structure (Supabase PostgreSQL)

All tables use `recruiter_id`-based RLS (`auth.uid() = recruiter_id`). There is **no `teams` table** — this is currently a single-recruiter schema. Multi-user requires a future migration.

**Key tables:**
- `candidates` — core profile with `candidate_status`, `source`, `last_interaction_at`, `placement_guarantee_until`, `ai_context`
- `processes` — stage + `buy_in_confirmed_at`, `cv_sent_at`, `placed_date`, `last_activity_at` (all now wired)
- `requisitions` — with `jd_url`, `jd_text`, `urgency`, `strategic_context`, `interview_steps`
- `requisition_conditions` — must-have/nice-to-have per requisition
- `interactions` — activity log for candidates and clients
- `ai_context_log` — audit log of ai_context regenerations
- `clients` — with `status`, `contract_signed`, `ai_context`

### Key Exported Symbols (candidates.tsx)
```typescript
BLANK_CANDIDATE_SEARCH   // { name: "", company: "", status: "", japanese_level: "", source: "", last_touch: "" }
withCandidateDefaults()  // Fills in default empty strings — required for all navigate() to /candidates/*
```

Any code navigating to `/candidates` or `/candidates/$id` must pass `search: BLANK_CANDIDATE_SEARCH` or `search: withCandidateDefaults(prev)`. Failure to do so causes TypeScript errors due to `validateSearch` making all params required.

---

## Known Issues / Technical Debt

### Remaining Bugs

1. **`daily-agenda.ts` client interaction query** loops per open client in the handler (N+1). On large pipelines this could be slow. **Fix:** Batch the last-interaction lookup into a single join.

2. **Pre-call briefing legacy params** — `InterviewPanel` calls the endpoint with `{ candidateId, recruiterId }`. The endpoint accepts both legacy and new `{ entity_type, entity_id }` format, so it works, but the legacy path should be cleaned up.

3. **Registration form URL display** — `registration_form_url` is stored as a Supabase storage path, not a public URL. No signed URL fetch or download link is shown for the registration form.

4. **`multer` installed but unused** — safe to remove from `package.json` if desired.

5. **`vercel.json.save`** is committed — should be gitignored or deleted.

### Incomplete UX

6. **Submission package "Accept All / Reject All"** shortcuts in TranscriptPanel are not implemented. Only per-field checkboxes exist.

7. **`SubmissionPreview.tsx`** (ported from CVFlow) is not used in `SubmissionPackagePanel`. The panel renders profiles inline. Available for future use.

8. **Team Activity Feed** on dashboard shows the logged-in recruiter's own interactions instead of team activity. Correct implementation requires a `team_id` on the `recruiters` table (multi-user migration needed).

9. **OfferPanel action buttons** (`Closing script`, `Counteroffer prep`, etc.) have no onClick handlers — they are UI shells. Logic not yet wired.

10. **`/jobs/$id` — no "Add condition" shortcut from within the JD text.** Conditions must be added manually or come from the initial JD upload.

### Technical Debt

11. **Single-recruiter RLS** — `recruiter_id = auth.uid()` on all tables. Multi-user architecture described in CLAUDE.md requires a future migration to add `team_id` and update RLS policies.

12. **`api_base_url` in production** — `API_BASE_URL` must be set to the Vercel deployment URL in Vercel environment settings for `refresh-context` fire-and-forget calls to work in production.

13. **`candidates.$id.tsx` and `clients.$id.tsx` are very large** (~3,500 and ~3,300 lines). As features grow, the largest panels (TranscriptPanel, SubmissionPackagePanel) should be extracted to `src/components/candidate/`.

---

## Architecture Decisions & Constraints

### Design Patterns

**Component architecture:**
- `src/components/ui/` — shadcn primitives, never modify
- `src/components/shared/` — `Card`, `SectionLabel`, `FieldRow`, `StageBadge` — check here first
- Feature components live inline in route files (intentional — not technical debt)

**Data fetching:**
- TanStack Query exclusively. Always `staleTime: 30_000, retry: 1`
- Query keys: `['entity', id?, subresource?]`
- All mutations use optimistic updates with `onMutate`/`onError`/`onSettled` where applicable

**API handler contract:**
```
1. Validate method + required fields
2. Init Supabase service role client
3. Fetch data with explicit column lists (never select("*"))
4. Build prompt with all AI rules applied
5. Call Claude: model claude-sonnet-4-5-20250929, max_tokens varies
6. Parse + validate response
7. Return HTTP 200 always — errors go in body, not status code
```

**Navigation to /candidates/***:
All `navigate()` and `<Link>` calls to `/candidates` or `/candidates/$id` must pass search params:
```typescript
// From outside candidates layout:
search: BLANK_CANDIDATE_SEARCH

// Within candidates layout (preserve current filters):
search: withCandidateDefaults(search)  // where search = Route.useSearch()
```

### Coding Conventions
- Icons: `@tabler/icons-react` outline variants only
- Toast: `sonner` only — `toast.success()`, `toast.error()`, `toast.warning()`
- Salary: always `¥XM` format via `formatYen()`
- Stage badge: always `<StageBadge stage={...} />` — never inline colour logic
- Dates: `relativeTime()` / `daysSince()` from `candidate-utils.ts`
- No `vercel dev` locally — use `npm run dev` + `npm run dev:api`
- **Forbidden words in all prompts:** `straightforward`, `genuinely`, `honestly`, `leverage` (as verb), `utilize`, em dashes

### Business Logic
- **Japan language levels:** Native / Fluent / High Business / Business / Low Business / High Conversational / Conversational / Low Conversational / Basic / None
- **Pipeline stages:** Specs Sent → Buy-In → CV Sent → CCM1…n → Offer → Placed / Closed lost
- **Buy-In** = candidate's explicit consent to CV submission. Distinct milestone.
- **Counteroffer stats:** 60–80% leave within 6 months; 90% within 12 months.
- **Agency fees:** 30–35% of OTE in Japan.
- **ai_context** = rolling 900-token internal briefing note, recency-weighted.

---

## Suggested Next Work

All 9 handover steps are complete. Possible next directions:

### High value / low complexity
1. **Wire OfferPanel action buttons** — "Closing script" calls `closing-script.ts`, "Interview prep" calls `interview-prep.ts`. Both endpoints exist.
2. **Spec email flow** — After creating a Specs Sent process, show the AI-generated spec email inline (calls `spec-email.ts`). Endpoint exists, UI not wired.
3. **Registration form signed URL** — Add a download/view button for `registration_form_url` using `supabase.storage.from("resumes").createSignedUrl()`.
4. **Fix daily-agenda N+1** — Batch the open client last-interaction query in `api/ai/daily-agenda.ts`.

### Medium complexity
5. **Multi-user migration** — Add `team_id` to `recruiters` table, update RLS policies. Enables Team Activity Feed and proper multi-recruiter visibility.
6. **Extract large panels** — Move `TranscriptPanel`, `SubmissionPackagePanel` into `src/components/candidate/` to reduce file sizes.
7. **Interview prep flow** — Add "Generate prep email" button to CCM-stage `InterviewPanel` (endpoint `interview-prep.ts` exists, UI not wired).

### Lower priority
8. **Submission package "Accept All"** shortcut in TranscriptPanel.
9. **Pre-call briefing cleanup** — Update `InterviewPanel` to use new `{ entity_type, entity_id, process_id }` params.
10. **Remove `multer`** — It's installed but not used anywhere (`npm uninstall multer @types/multer`).

---

## Modified Files This Session

### New files
- `api/extract-text.ts` — PDF text extraction endpoint
- `src/routes/_authenticated/jobs.$id.tsx` — Requisition detail page

### Substantially modified
- `src/routes/_authenticated/dashboard.tsx` — Full rewrite (AI agenda, KPIs, drag/snooze/done)
- `src/routes/_authenticated/candidates.tsx` — Server-side search with URL params
- `src/routes/_authenticated/candidates.$id.tsx` — Stage change mutation, process type extended, TranscriptPanel side effects
- `src/routes/_authenticated/clients.$id.tsx` — ClientStatusSelect with warning toast, JD PDF extraction wired
- `src/routes/_authenticated/jobs.tsx` — JobRow now links to /jobs/$id
- `src/routeTree.gen.ts` — Auto-regenerated by TanStack Router (new jobs.$id route)
