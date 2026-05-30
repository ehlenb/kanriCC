# Kanri — Session Handoff Document

> Generated: 30 May 2026
> Last commit: `02032e2` — Steps 1–5 of KANRI_HANDOVER.md complete
> Build status: **passing** (TypeScript clean, Vite production build succeeds)

---

## Project Overview

Kanri is an AI-native recruiter intelligence platform and CRM for boutique agency recruiters in the Japan bilingual talent market. It is a full CRM replacement — not an ATS overlay — for recruiters placing bilingual professionals at foreign firms in Japan.

**Core thesis:** Recruiters lose hours rebuilding context before every call and making prioritisation decisions with incomplete information. Kanri eliminates that tax.

**Target users:** Boutique and mid-sized agency recruiting firms. Initial focus: Japan bilingual and gaishikei recruitment. Reference companies: Torch (Vincere ATS, 4 consultants), Robert Walters Japan, Hays.

**Current implementation status:** Steps 1–5 of 9 complete. The application is functional — schema is migrated, all AI endpoints are built, and the candidate and client pages have been substantially extended. Steps 6–9 (requisition detail page, dashboard extensions, candidate search, and data integrity) remain.

---

## Completed Work This Session

### Step 1 — Schema & Types
- Created and applied `supabase/migrations/008_schema_extension.sql`
- **New tables:** `requisition_conditions`, `ai_context_log`
- **Extended tables:** `clients`, `requisitions`, `candidates`, `candidate_motivations`, `competing_interviews`, `processes`, `interactions`, `client_contacts`
- Regenerated Supabase TypeScript types
- Appended full custom types block: `CandidateStatus`, `CandidateSource`, `ClientStatus`, `ConditionType`, `ConditionSource`, `EntityType`, `Urgency`, `MotivationType`, `SnapshotContent`, `ProfileContent`, `SubmissionPackage`
- **Schema note:** The existing database uses `recruiter_id`-based RLS (no `teams` table). The handover spec assumed a `teams` table — all new tables use `recruiter_id` FK instead. This was adapted to match the actual schema.

### Step 2 — Dependencies & Environment
- Installed: `jspdf`, `html2canvas`, `jszip`, `pdf-parse`, `mammoth`, `@tavily/core`, `multer`
- Dev dependencies: `@types/pdf-parse`, `@types/multer`
- Added to `.env`: `TAVILY_API_KEY` (filled), `API_BASE_URL=http://localhost:3001`
- Note: `tavily` (deprecated) was replaced with `@tavily/core`

### Step 3 — CVFlow Port
- Copied `src/lib/pdf-utils.ts` from CVFlow verbatim (generates bilingual PDF)
- Copied `src/components/candidate/SubmissionPreview.tsx` from CVFlow's `ProfilePreview.tsx`
- Fixed both files' import paths from CVFlow's `generate-report` to Kanri's types
- Added Noto Sans JP Google Font import to `src/styles.css`

### Step 4 — AI Endpoints (13 total)

#### New endpoints (7)
| File | Purpose |
|---|---|
| `api/ai/refresh-context.ts` | Background job — regenerates `ai_context` on candidate/client/requisition after an interaction. Handles all 3 entity types with recency-weighted prompting. Writes to `ai_context_log`. |
| `api/ai/extract-conditions.ts` | Reads JD text, extracts must-have / nice-to-have conditions as structured JSON. |
| `api/ai/process-transcript.ts` | Takes a pasted call transcript, extracts structured field suggestions, motivations, blockers, competing interviews. Human reviews all before saving. |
| `api/ai/spec-email.ts` | Generates bespoke outreach email + 3 talking points to pitch a role to a candidate. Sequences on motivation rank 1. |
| `api/ai/interview-prep.ts` | Generates candidate-facing interview prep email + recruiter prep note per CCM round. Includes AI-generated practice prompt for ChatGPT/Claude. |
| `api/ai/closing-script.ts` | Generates closing call guide for Offer stage. Includes counteroffer defense statistics when risk is detected. |
| `api/ai/match-candidates.ts` | Ranks all eligible team candidates against a requisition by fit score (1–10). Flags salary stretch. Language level is treated as a hard filter. |
| `api/ai/daily-agenda.ts` | NEW (was missing from the project). 8-tier priority ranking, AI generates reason + suggested action per item. Fallback to rule-based output if AI parse fails. |

#### Replaced endpoints (2)
| File | What changed |
|---|---|
| `api/ai/enrich-client.ts` | Replaced text-paste approach with Tavily web search. Now searches by company name + optional URL. Maps to new Kanri client fields including `employee_japanese_pct` and `japanRoleInGroup`. Triggers `refresh-context` after enrichment. |
| `api/ai/submission-note.ts` | Replaced single-note output with full CVFlow submission package: email + English profile + Japanese profile (parallel Claude calls + translation). Stores interaction, advances stage if at Buy-In, triggers context refresh. |

#### Extended endpoints (4)
| File | What changed |
|---|---|
| `api/ai/extract-candidate.ts` | Added: email, phone, linkedinUrl, additionalLanguages, noticePeriodMonths, reasonForLeaving per role. |
| `api/ai/pre-call-briefing.ts` | Now handles both `candidate` and `client` entity types. Reads `ai_context`, `competing_interviews` (active only), process context when `process_id` provided. Uses ALL CAPS section labels. |
| `api/ai/client-meeting-prep.ts` | Reads `ai_context`, `requisition_conditions`. Updated prompt structure with ALL CAPS section labels. |
| `api/ai/req-strategic-context.ts` | Reads `requisition_conditions` (must-have) to include in strategic framing. |

### Step 5 — UI Extensions

#### 5a — Candidate Registration Tab
- **Status + Source row:** `candidate_status` badge (Active/Passive/Placed/Off market) and `source` dropdown visible
- **Contact fields card:** email, phone, LinkedIn (with clickable link)
- **Language card:** updated to use `additional_languages` (new field, falls back to `other_languages`)
- **CV extraction review modal:** expanded to show email, phone, LinkedIn, additional languages, notice period, reasonForLeaving per role. Accept/reject per field with "Accept All" shortcut not yet implemented (just apply-all button)
- **Registration Form upload zone:** PDF upload stored to Supabase storage at `{recruiter_id}/{candidate_id}/regform_{ts}_{filename}`, URL stored in `registration_form_url`
- **Motivation rows:** show `motivation_type` chip alongside text
- **Competing interviews:** Active/Closed toggle per row (writes `is_active` to DB)
- **Candidate Intelligence card:** collapsible, shows `ai_context` text + relative `ai_context_updated_at`, Refresh button calls `refresh-context`

#### 5b — Candidate Timeline Tab
- "Paste transcript" toggle button at top of timeline
- `TranscriptPanel`: paste transcript → process → review suggested field updates, motivations, blockers, competing interviews with per-item checkboxes → save creates interaction + triggers context refresh

#### 5c — Candidate Intelligence Tab (Submission Package)
- "Generate Submission Package" button calls new `submission-note` endpoint
- `SubmissionPackagePanel`: three editable sections (email subject/body, English profile, Japanese profile)
- "Download PDF" calls `downloadSingleProfile` from `pdf-utils.ts`
- Automatically logs `cv_sent` interaction and advances stage on generation

#### 5d — Client Info Tab
- Status badge in header (Prospect=amber, Active=green, Inactive=grey)
- Contract signed badge when `contract_signed = true`
- `employee_japanese_pct` shown as meta pill
- **Account Intelligence card** (collapsible, Refresh button)
- **Enrich card** replaced with Tavily-powered search (company name auto-filled, optional URL input)

#### 5e — Client Contacts
- Email, phone, LinkedIn URL fields added to AddContactDialog
- Contact rows display email/phone/LinkedIn inline

#### 5f — Client Requisition Intake
- JD upload zone (PDF or DOCX) in RequisitionIntakeModal
- DOCX text extracted client-side via mammoth
- PDF upload stored to Supabase storage
- `extract-conditions` called automatically on upload
- Conditions shown in editable list (type toggle, text edit, delete, add manual)
- Conditions saved to `requisition_conditions` table on submit with the new requisition ID

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
      dashboard.tsx               # Daily agenda (partially wired to new endpoint)
      candidates.tsx              # Candidate list (no search yet — Step 8)
      candidates.$id.tsx          # Candidate detail — 4 tabs (3,100+ lines)
      clients.tsx                 # Client list
      clients.$id.tsx             # Client detail — 3 tabs (3,200+ lines)
      jobs.tsx                    # Jobs list + revenue forecast
  components/
    ui/                           # shadcn/ui primitives — never modify
    shared/                       # Card, SectionLabel, FieldRow, StageBadge
    candidate/
      SubmissionPreview.tsx       # Ported from CVFlow ProfilePreview
      processes/                  # (empty — process components inline in candidates.$id.tsx)
      registration/               # (empty — registration components inline)
    dashboard/                    # Dashboard-specific components
    layout/                       # Sidebar, layout shell
  lib/
    candidate-utils.ts            # All domain utility functions
    pdf-utils.ts                  # Ported from CVFlow — bilingual PDF generation
    supabase.ts                   # Browser Supabase client
    supabase-server.ts            # Service role client (server-side only)
    auth-context.tsx              # Auth context provider
  hooks/                          # Custom React hooks
  integrations/
    supabase/
      types.ts                    # Generated types + custom app types appended at bottom
  styles.css                      # Design tokens + Noto Sans JP import
```

### Backend Structure
```
api/
  ai/
    client-draft.ts               # Draft client-facing email
    client-meeting-prep.ts        # Pre-meeting brief (extended)
    client-snapshot.ts            # Two-part client account snapshot
    closing-script.ts             # NEW — Offer stage closing guide
    daily-agenda.ts               # NEW — 8-tier priority agenda
    enrich-client.ts              # REPLACED — Tavily web search
    extract-candidate.ts          # EXTENDED — more fields including email/phone/linkedin
    extract-conditions.ts         # NEW — JD to must-have/nice-to-have conditions
    interview-prep.ts             # NEW — candidate prep email + recruiter prep note
    match-candidates.ts           # NEW — ranks candidates against a requisition
    positioning.ts                # Existing — NFAR positioning points
    pre-call-briefing.ts          # EXTENDED — supports candidate + client entity types
    process-transcript.ts         # NEW — transcript to structured field suggestions
    refresh-context.ts            # NEW — background ai_context regeneration
    req-strategic-context.ts      # EXTENDED — reads conditions
    spec-email.ts                 # NEW — bespoke role pitch email + talking points
    submission-note.ts            # REPLACED — full bilingual submission package
scripts/
  dev-api.ts                      # Local dev API server (tsx watch at :3001)
```

### Database Structure (Supabase PostgreSQL)

All tables use `recruiter_id`-based RLS (`auth.uid() = recruiter_id`). There is **no `teams` table** — this is currently a single-recruiter schema despite CLAUDE.md describing multi-user architecture. Multi-user requires a future migration.

**Core tables (existing):**
- `recruiters` — extends auth.users. Fields: `id`, `email`, `full_name`, `agency_name`
- `candidates` — core profile. ~40 fields including new: `email`, `phone`, `linkedin_url`, `additional_languages`, `availability_date`, `candidate_status`, `source`, `registration_form_url`, `base_minimum`, `ai_context`, `ai_context_updated_at`, `last_interaction_at`, `placement_guarantee_until`
- `candidate_motivations` — ranked 1–3. New field: `motivation_type`
- `candidate_blockers` — risks and context
- `candidate_roles` — work history
- `competing_interviews` — new field: `is_active`
- `clients` — company accounts. New fields: `status`, `employee_japanese_pct`, `contract_signed`, `contract_url`, `ai_context`, `ai_context_updated_at`
- `client_contacts` — new fields: `email`, `phone`, `linkedin_url`
- `requisitions` — new fields: `jd_url`, `jd_text`, `urgency`, `interview_steps`, `interview_notes`, `ai_context`, `ai_context_updated_at`
- `processes` — new fields: `buy_in_confirmed_at`, `cv_sent_at`, `offer_amount`, `offer_date`, `placed_date`, `closed_reason`, `ai_snapshot_updated_at`, `last_activity_at`
- `interactions` — new fields: `requisition_id`, `process_id`, `direction`, `summary`, `transcript_raw`, `triggers_context_refresh`

**New tables (this session):**
- `requisition_conditions` — must-have/nice-to-have per requisition with priority_rank
- `ai_context_log` — audit log of ai_context regenerations

### API Routes

All at `/api/ai/*`. Proxied from Vite dev server (port 5173) → local API server (port 3001) via `vite.config.ts`.

In production: Vercel serverless functions.

### Authentication

Supabase Auth — email/password only. Auth guard at `/_authenticated.tsx`. The `useAuth()` hook provides `user` (Supabase auth user). RLS policies enforce `recruiter_id = auth.uid()` on all tables.

### AI Functionality

- **Model:** `claude-sonnet-4-5-20250929` on all endpoints
- **Client:** `@anthropic-ai/sdk`, server-side only, never in `src/`
- **Key constraint:** `ANTHROPIC_API_KEY` never in VITE_ variables
- **Context refresh pattern:** Fire-and-forget `fetch` to `/api/ai/refresh-context` after interactions — silent fail (best-effort)
- **Forbidden words in all prompts:** `straightforward`, `genuinely`, `honestly`, `leverage` (as verb), `utilize`
- **Never read:** `candidates.notes_internal`, `candidates.notes_presentation`, `client_contacts.notes`

### Key Dependencies

| Package | Purpose | Side |
|---|---|---|
| `@anthropic-ai/sdk` | Claude API | Server |
| `@supabase/supabase-js` | Database + Auth + Storage | Both |
| `@tanstack/react-query` | Server state | Client |
| `@tanstack/react-router` | File-based routing | Client |
| `jspdf` + `html2canvas` | PDF generation | Client |
| `jszip` | Zip multiple PDFs | Client |
| `mammoth` | DOCX text extraction | Client (lazy) |
| `pdf-parse` | PDF text extraction | Server |
| `@tavily/core` | Web search for company enrichment | Server |
| `multer` | File upload middleware (dev server) | Server |
| `sonner` | Toast notifications | Client |
| `tailwindcss` v4 | Styling | Client |

---

## Important Context for Future Sessions

### Design Patterns

**Component architecture:**
- `src/components/ui/` — shadcn primitives, never modify
- `src/components/shared/` — `Card`, `SectionLabel`, `FieldRow`, `StageBadge` — always check here before creating new components
- Feature components live inline in route files (candidates.$id.tsx is ~3,200 lines — this is intentional, not technical debt)

**Data fetching:**
- TanStack Query exclusively. Always `staleTime: 30_000, retry: 1`
- Query keys follow pattern: `['entity', id?, subresource?]`
- All mutations use optimistic updates with `onMutate`/`onError`/`onSettled`

**API handler contract:**
```typescript
// 1. Validate method + required fields
// 2. Init Supabase service role client
// 3. Fetch data with explicit column lists (never select("*"))
// 4. Build prompt with all AI rules applied
// 5. Call Claude: model claude-sonnet-4-5-20250929, max_tokens varies
// 6. Parse + validate response
// 7. Return HTTP 200 always — errors go in body, not status code
```

**No `as any` casts** — except one deliberate exception in `TranscriptPanel` where a dynamic field patch requires it (documented inline).

### Coding Conventions

- Icons: `@tabler/icons-react` outline variants only — e.g. `IconSparkles`, never `IconSparklesFilled`
- Toast: `sonner` only — `toast.success()`, `toast.error()`
- Salary: always `¥XM` format via `formatYen()` in `candidate-utils.ts`
- Stage badge: always `<StageBadge stage={...} />` — never inline colour logic
- Dates: `relativeTime()` / `daysSince()` from `candidate-utils.ts`
- No `vercel dev` locally — use `npm run dev` + `npm run dev:api`

### Key Assumptions / Constraints

1. **Single-recruiter schema:** Despite CLAUDE.md describing multi-user teams, the actual DB has no `teams` table. All RLS is `recruiter_id = auth.uid()`. Future migration needed for multi-user.
2. **Supabase storage bucket:** The `resumes` bucket must exist and be private. CV, registration form, and JD files all go to this bucket under different path patterns.
3. **TAVILY_API_KEY:** Required for `enrich-client.ts`. Without it, enrichment returns an error message (does not crash).
4. **API_BASE_URL:** Required for `refresh-context` fire-and-forget calls. Set to `http://localhost:3001` locally.
5. **PDF extraction (JD upload):** Currently only DOCX files are text-extracted client-side. PDF JDs are uploaded to storage but their text is stored as `[PDF: filename]` placeholder. Server-side PDF text extraction via `pdf-parse` is **not yet wired** — needs a dedicated `/api/extract-text` endpoint or inline extraction.
6. **`SubmissionPreview.tsx`:** Ported from CVFlow but not yet used in the UI — the `SubmissionPackagePanel` renders profiles inline rather than using this component. It's available for future use.
7. **Competing interview `is_active` toggle:** Writes to DB immediately on click (optimistic, no query invalidation). The query cache is not invalidated — a page refresh is needed to see the change reflected in AI context. Low priority.

### Business Logic

- **Japan language levels scale:** Native / Fluent / High Business / Business / Low Business / High Conversational / Conversational / Low Conversational / Basic / None
- **Pipeline stages:** Specs Sent → Buy-In → CV Sent → CCM1…n → Offer → Placed / Closed lost
- **Buy-In** = candidate's explicit consent to CV submission. Distinct milestone.
- **Counteroffer stats:** 60–80% leave within 6 months; 90% within 12 months. Used in `closing-script.ts`.
- **Agency fees:** 30–35% of OTE in Japan. Higher than global average.
- **ai_context** = rolling 900-token internal briefing note, recency-weighted. Not shown to clients.

---

## Known Issues / Technical Debt

### Bugs

1. **PDF JD text extraction is incomplete.** When a recruiter uploads a PDF JD in the RequisitionIntakeModal, the text is stored as `[PDF: filename]` rather than extracted content. `extract-conditions` will not produce useful output. **Fix:** Add a `/api/extract-text` endpoint using `pdf-parse` and call it server-side after PDF upload. DOCX works correctly via mammoth.

2. **Competing interview `is_active` toggle** does not invalidate the TanStack Query cache after the Supabase update, so the UI state from `useCandidateProfile` remains stale. The toggle visually works (state comes from the initial fetch) but a page refresh is needed for the change to propagate to AI context. **Fix:** Add `useQueryClient` invalidation to the toggle handler.

3. **`daily-agenda.ts` client interaction query** issues one additional Supabase query per open client inside the handler loop. On large pipelines this could be slow. **Fix:** Batch the last-interaction lookup into a single query with a subquery or join.

4. **`TranscriptPanel` candidate blocker insert** does not include `recruiter_id` in the insert row. The `candidate_blockers` table RLS checks via the parent `candidates.recruiter_id`, so this may work via policy — but should be verified against the actual RLS policy.

### Incomplete Functionality

5. **Submission package "Accept All / Reject All"** shortcuts mentioned in the handover spec are not implemented. The UI only has per-field checkboxes. Low complexity to add.

6. **`SubmissionPreview.tsx`** (ported from CVFlow) is not used in the current `SubmissionPackagePanel`. The panel renders profiles inline. The component exists and is importable for future use.

7. **Dashboard** is still wired to the old (non-existent) `daily-agenda.ts` endpoint output format. The new endpoint exists and matches the handover spec, but `dashboard.tsx` has not been updated to use the new output shape with `reason`, `suggested_action`, `action_type`. This is Step 7 work.

8. **Pre-call briefing** in `InterviewPanel` still calls the endpoint with legacy `{ candidateId, recruiterId }` body. The new endpoint accepts `{ entity_type, entity_id, process_id }`. The endpoint supports both — the legacy `candidateId` fallback is in the handler — so it works, but should be cleaned up.

9. **`candidates.$id.tsx` — registration form URL display.** The `registration_form_url` is stored as a Supabase storage path, not a public URL. There is no inline viewer or download link for the registration form yet. CV viewing has the same pattern — the path is stored but display requires a signed URL fetch.

10. **No `/jobs/$id` route yet.** The requisition detail page (Step 6) does not exist. The Jobs page lists requisitions but clicking through does nothing yet.

### Technical Debt

11. **`candidates.$id.tsx` and `clients.$id.tsx` are very large single-file route components** (~3,200 lines each). This is intentional per the project's component philosophy but makes future edits complex. As more features are added, consider extracting the largest panels (e.g., `TranscriptPanel`, `SubmissionPackagePanel`) into dedicated files under `src/components/candidate/`.

12. **Type `any` in `TranscriptPanel`.** One `eslint-disable` cast for the dynamic field patch object. This is acceptable given the dynamic nature of the operation (user-confirmed field updates from transcript extraction).

13. **`api_base_url` for production** — `API_BASE_URL` must be set to the Vercel deployment URL in Vercel's environment settings. Without it, `refresh-context` fire-and-forget calls will fail silently in production. This is best-effort by design, so it won't break anything, but context refresh won't work.

14. **`multer` is installed but not wired into `scripts/dev-api.ts`.** The handover spec mentioned adding multer middleware for file uploads. File uploads currently go directly from the browser to Supabase storage — multer is not needed for the current implementation. It can be removed or kept for potential future server-side file processing.

15. **`vercel.json.save`** is committed. This is a backup file that should be gitignored or removed.

---

## Remaining Implementation Plan

### Step 6 — New Requisition Detail Page (`/jobs/$id`)

**Route:** `src/routes/_authenticated/jobs.$id.tsx`

**Layout:** Two-column. Left: requisition details. Right: candidate pipeline.

**Left panel:**
- Req header: title, client name, urgency badge, stage counts
- JD viewer: if `jd_url` is set, fetch a signed URL and display as PDF iframe; otherwise show `jd_text` in a pre block
- Strategic context: `strategic_context` editable inline (textarea, saves on blur)
- Salary range: min / max / stretch formatted as ¥XM
- Interview process: `interview_steps` count + `interview_notes`
- Key conditions: list from `requisition_conditions` ordered by `priority_rank`. Must-have in amber, nice-to-have in grey. Recruiter can add, edit, delete at any time. Client-sourced conditions get a "(client)" label.

**Right panel:**
- All processes for this requisition, grouped by stage
- Each candidate card: name, stage badge, last activity relative time, owner recruiter
- Click → navigate to `candidates/$id` with intelligence tab pre-selected
- "Match Candidates" button → opens `MatchCandidatesPanel` calling `match-candidates.ts`

**MatchCandidatesPanel:**
- Ranked list: score, current role, match reason per candidate
- Amber flag if `is_salary_stretch`
- "Spec" button → creates a process at Specs Sent stage + opens spec-email flow
- "Skip" button → dismisses from this match session (local state only)

**Query keys to add:**
- `['requisition', id]`
- `['requisition_conditions', requisitionId]`
- `['match_candidates', requisitionId]`

### Step 7 — Dashboard Extensions

**Update `dashboard.tsx`** to use the new `daily-agenda.ts` output shape.

**Section 1 — Daily Agenda (existing, extend):**
- Wire to new `daily-agenda.ts` endpoint output: `{ agenda: [{ entity_type, entity_id, entity_name, process_id, stage, reason, suggested_action, action_type, priority_rank }] }`
- Each item: entity name, stage badge, reason (amber text, one sentence), suggested action, quick action button mapped to `action_type`
- Drag handle for manual reordering (local state only — no persistence needed)
- Snooze button: date picker, stores snoozed items in localStorage keyed by entity_id
- "Done for today" button: removes from today's view (localStorage)

**Section 2 — Active Pipeline Pulse (new):**
- Aggregate query: count processes by stage for the logged-in recruiter
- Chips: Specs Sent [N] / Buy-In [N] / CV Sent [N] / Interviewing [N] / Offer [N]
- Clicking a chip filters to that stage on the candidates page (URL search param)

**Section 3 — Team Activity Feed (new):**
- Query: `interactions` by other recruiters on same team in last 24 hours
- **Note:** This requires `team_id` on the `recruiters` table. Without multi-user migration, this section cannot be implemented correctly. In the interim, show "coming soon" or the logged-in recruiter's own recent interactions.
- Capped at 15 items. Relative timestamps.

**Section 4 — KPI Strip (new):**
- Aggregate counts for current calendar month, logged-in recruiter:
  - CVs Sent: count `processes` where `cv_sent_at >= first-of-month`
  - CCMs Scheduled: count `interactions` where `interaction_type like 'ccm%'`
  - Specs Out: count `processes` where `stage = 'Specs Sent'` created this month
  - Offers Made: count `processes` where `offer_date >= first-of-month`
  - Placements: count `processes` where `placed_date >= first-of-month`
- Display only. No drill-down.

**Query keys:**
- `['dashboard', recruiterId]` — agenda
- `['team_activity']` — team feed
- `['kpi', recruiterId]` — KPI strip

### Step 8 — Candidate Search

Add search and filter bar to `candidates.tsx` (the list page).

**Filters:**
- Name: text search (ilike `%query%` on `full_name`)
- Company: text search (ilike on `current_company`)
- `candidate_status`: dropdown (all / active / passive / placed / off_market)
- `japanese_level`: dropdown (all levels from the scale)
- `source`: dropdown (linkedin / bizreach / doda / referral / inbound / other)
- Last touch: select (all / active < 30d / cooling 30–60d / cold > 60d) — uses `last_interaction_at`

**Implementation:**
- Store filters in TanStack Router URL search params (survive refresh)
- Query: single Supabase query with `.ilike()`, `.eq()`, `.filter()` chained conditionally
- No AI. Pure database query.
- Show candidate count in header.

### Step 9 — Polish & Data Integrity

Wire timestamp auto-sets in mutation hooks (currently missing):

1. **When `processes.stage` → `Buy-In`** and `buy_in_confirmed_at` is null: set `buy_in_confirmed_at = now()`
2. **When `processes.stage` → `CV Sent`** and `cv_sent_at` is null: set `cv_sent_at = now()`
3. **When `processes.stage` → `Placed`**: set `placed_date = today`, set `candidates.candidate_status = 'placed'`, set `candidates.placement_guarantee_until = today + 90 days`
4. **On any interaction created for a candidate**: set `candidates.last_interaction_at = interacted_at`
5. **On any interaction created for a process**: set `processes.last_activity_at = interacted_at`
6. **When `clients.status` → `active`**: check `contract_signed` — if false, show a warning toast (do not block)

These rules should be enforced in the mutation functions that update process stages and create interactions — currently they are not wired.

Also: fix the known bug where PDF JD text extraction doesn't work (see Known Issues #1).

---

## Recommended Next Actions

The next Claude Code session should begin by reading:
1. `CLAUDE.md` — the full operating specification
2. `SESSION_HANDOFF.md` — this document
3. The `KANRI_HANDOVER.md` in `/Users/misako/Downloads/` — the full build specification

**Immediate tasks for the next session:**

1. **Fix PDF JD text extraction (Step 9 bug #1, prerequisite for Step 6 to work well):**
   - Add `api/extract-text.ts` endpoint that accepts a file upload, runs `pdf-parse`, and returns extracted text
   - Update the JD upload zone in `RequisitionIntakeModal` to call this for PDF files
   - Then call `extract-conditions` on the extracted text

2. **Build Step 6 — Requisition detail page:**
   - Create `src/routes/_authenticated/jobs.$id.tsx`
   - Add route to TanStack Router (check `src/routes/__root.tsx` for the router config pattern)
   - Left panel: JD viewer (signed URL for PDF iframe), strategic context (inline editable), salary, interview notes, conditions list
   - Right panel: processes grouped by stage, Match Candidates button
   - Wire `match-candidates.ts` endpoint

3. **Then Step 7 — Dashboard extensions** (update `dashboard.tsx`)

4. **Then Step 8 — Candidate search** (update `candidates.tsx`)

5. **Finally Step 9 — Data integrity** (wire timestamp auto-sets in all stage-change mutations)

---

## Modified Files

### New files created this session

**API endpoints:**
- `api/ai/refresh-context.ts`
- `api/ai/extract-conditions.ts`
- `api/ai/process-transcript.ts`
- `api/ai/spec-email.ts`
- `api/ai/interview-prep.ts`
- `api/ai/closing-script.ts`
- `api/ai/match-candidates.ts`
- `api/ai/daily-agenda.ts`

**Frontend:**
- `src/lib/pdf-utils.ts` (ported from CVFlow)
- `src/components/candidate/SubmissionPreview.tsx` (ported from CVFlow)

**Database:**
- `supabase/migrations/008_schema_extension.sql`

**Documentation:**
- `SESSION_HANDOFF.md` (this file)

### Files substantially modified this session

**API endpoints (replaced or significantly extended):**
- `api/ai/enrich-client.ts` — replaced with Tavily-powered version
- `api/ai/submission-note.ts` — replaced with full bilingual submission package
- `api/ai/extract-candidate.ts` — extended with new fields
- `api/ai/pre-call-briefing.ts` — supports both candidate and client entity types
- `api/ai/client-meeting-prep.ts` — reads ai_context and conditions
- `api/ai/req-strategic-context.ts` — reads conditions

**Frontend (major changes):**
- `src/routes/_authenticated/candidates.$id.tsx` — ~750 lines added; new types, registration tab overhaul, transcript flow, submission package, competing interview toggle, AI context card
- `src/routes/_authenticated/clients.$id.tsx` — ~430 lines added; client status badges, account intelligence card, Tavily enrich card, contact email/phone/linkedin, JD upload in req intake
- `src/integrations/supabase/types.ts` — regenerated + extended custom types
- `src/styles.css` — Noto Sans JP Google Font import

**Configuration:**
- `.env` — added `TAVILY_API_KEY`, `API_BASE_URL`
- `package.json` / `package-lock.json` — new dependencies

### Files not modified (existing, working as-is)
- `api/ai/client-draft.ts`
- `api/ai/client-snapshot.ts`
- `api/ai/positioning.ts`
- `src/routes/_authenticated/candidates.tsx` (list page — Step 8)
- `src/routes/_authenticated/clients.tsx`
- `src/routes/_authenticated/dashboard.tsx` (Step 7)
- `src/routes/_authenticated/jobs.tsx` (Step 6 adds `jobs.$id.tsx`)
- All `supabase/migrations/001–007_*.sql`
- `scripts/dev-api.ts`
- `src/lib/candidate-utils.ts`
- All `src/components/shared/`
- All `src/components/ui/`
