# Kanri — Session Handoff Document

> Generated: 1 June 2026
> Build status: **passing** (TypeScript clean, all migrations applied, types regenerated)

---

## Project Overview

Kanri is an AI-native recruiter intelligence platform and CRM for boutique agency recruiters in the Japan bilingual talent market.

**Core thesis:** Recruiters lose hours rebuilding context before every call and making prioritisation decisions with incomplete information. Kanri eliminates that tax.

**Target users:** Boutique and mid-sized agency recruiting firms. Initial focus: Japan bilingual and gaishikei recruitment. Reference companies: Torch (Vincere ATS, 4 consultants), Robert Walters Japan, Hays.

**Current status:** The full feature brief (Parts 1–4) is complete. The next session covers the client page revision.

---

## What Was Completed This Session

### Part 2 — Advanced Candidate Search (brief §2.1–2.8)

**Migration 013 (`supabase/migrations/013_candidate_lists.sql`) — applied to Supabase**
- `candidate_lists` table: `id, name, created_by, visibility ('private'|'team'), candidate_ids uuid[], source ('ai'|'manual'|'merged'), created_at, updated_at, team_id`
- RLS: team members see all team-visibility lists + their own private lists
- `DEFAULT current_team_id()` set on `team_id` column (required for Supabase Insert types to treat it as optional)
- `set_updated_at()` trigger auto-updates `updated_at`

**Types regenerated** — `src/integrations/supabase/types.ts` reflects the new table. Custom types block re-appended.

**Advanced Search page (`src/routes/_authenticated/advanced-search.tsx`)**
- Route: `/_authenticated/advanced-search`
- Three-panel layout: left filter panel (220px), centre results (flex), right AI panel (200px)
- Left panel: all base filters + Mandarin/Cantonese/Korean language dropdowns, age range, ¥M base salary range, 47-prefecture location dropdown, keyword tags with AND/OR toggle
- Centre panel: candidate rows with checkbox, avatar, match % bar (green 80%+, blue 60–79%, amber <60%), stage badge, ℹ info tooltip, coin icon with dimming for placed-within-90d, conflict badge for same-client active process
- Side drawer: quick profile (name, role, languages, top 2 motivations, stage, last touch) with "Open full profile" link
- Key Criteria tiering: green row tint (all criteria met) + amber row tint (close match) when AI search + "Narrow by Key Criteria" both active
- Save list modal: name input, team/private visibility toggle with explanatory note
- Saved lists panel: load, merge-select, merge & dedupe with inline count summary
- Sidebar: italic "Advanced Search" entry with × close when on that route

**AI search endpoint (`api/ai/advanced-search.ts`)**
- Model: `claude-sonnet-4-20250514`
- Input: `requisition_id`, `client_id`, `threshold` (30–80, default 45), `use_key_criteria`
- Excludes: placed-within-90d (unless coin dismissed), candidates in active process with same client
- Returns: `{ candidate_id, score, reason, is_salary_stretch, meets_must_haves, close_on_must_haves }[]`

**Key Criteria card redesign (`src/routes/_authenticated/jobs.$id.tsx`)**
- Renamed from "Key conditions" → "Key criteria"
- Two-column tag layout: Must-haves (green left border) + Flexible on (amber left border)
- Per-column text input with + button; Enter to add; × on each tag to remove
- Hint under Flexible on: "Flex criteria factor into match scoring but a gap here will not drop a candidate from results."
- DB unchanged — still uses `requisition_conditions` with `must_have` / `nice_to_have` types

**Dashboard Saved Lists widget (`src/routes/_authenticated/dashboard.tsx`)**
- Recent Activity + Saved Lists now sit side-by-side in a two-column grid
- Shows 3–5 most recently updated lists
- Filters: own private + all team-visible lists (hides other recruiters' private lists)
- "View all" link navigates to `/advanced-search`

---

## Current Architecture

### Frontend Structure
```
src/
  routes/
    __root.tsx
    index.tsx
    login.tsx
    _authenticated.tsx              # Sidebar now includes conditional italic Advanced Search entry
    _authenticated/
      dashboard.tsx                 # Pipeline KPIs + agenda + activity + Saved Lists widget
      candidates.tsx                # 7 filters, Advanced Search button
      candidates.$id.tsx            # StatusToggle, coin icon, placed_at
      clients.tsx
      clients.$id.tsx
      jobs.tsx
      jobs.$id.tsx                  # Key Criteria redesigned — two-column tag layout
      advanced-search.tsx           # NEW — three-panel advanced search
  components/
    ui/                             # shadcn/ui primitives — never modify
    shared/                         # Card, SectionLabel, FieldRow, StageBadge
    candidate/
      TranscriptPanel.tsx
      SubmissionPackagePanel.tsx
  lib/
    candidate-utils.ts
    supabase.ts
    supabase-server.ts
    auth-context.tsx
  integrations/
    supabase/
      types.ts                      # Regenerated post-013 migration
```

### Backend Structure
```
api/
  ai/
    advanced-search.ts              # NEW — AI candidate ranking for Advanced Search
    infer-status.ts                 # Daily cron — AI status inference + 90-day placed revert
    daily-agenda.ts
    positioning.ts
    pre-call-briefing.ts
    submission-note.ts
    client-snapshot.ts
    client-meeting-prep.ts
    client-draft.ts
    req-strategic-context.ts
    match-candidates.ts
    extract-candidate.ts
    enrich-client.ts
    closing-script.ts
    interview-prep.ts
    process-transcript.ts
    refresh-context.ts
    spec-email.ts
    extract-conditions.ts
```

### Database — Applied Migrations
```
001_full_schema.sql
002_client_contacts.sql
003_candidate_notes.sql
004_requisition_intake.sql
005_stage_rename.sql
006_cv_upload.sql
007_client_contacts_extend.sql
008_schema_extension.sql
009_multi_user.sql
010_ccm_feedback.sql
011_team_id_defaults.sql
012_candidate_status.sql
013_candidate_lists.sql             # candidate_lists — saved search lists
```

### Key Exported Symbols (candidates.tsx)
```typescript
BLANK_CANDIDATE_SEARCH   // { name: "", company: "", status: "", japanese_level: "", english_level: "", source: "", last_touch: "" }
withCandidateDefaults()  // Fills in default empty strings — required for all navigate() to /candidates/*
```

**IMPORTANT:** All navigation to `/candidates` or `/candidates/$id` must use `BLANK_CANDIDATE_SEARCH` or `withCandidateDefaults()`. Do not construct the search object manually.

---

## Next Session — Client Page Revision

The next session will revise the client page (`clients.$id.tsx`). Before starting:

1. Read `CLAUDE.md` completely
2. Read this `SESSION_HANDOFF.md` completely
3. Read the client page revision brief (to be provided by user at session start)
4. Read the current `src/routes/_authenticated/clients.$id.tsx` in full before touching anything

### What to know about the current client page
- `clients.$id.tsx` is ~3,225 lines — read it fully before editing
- Three tabs: Timeline, Client Info, Contract
- Client contacts have: `name`, `role` (ContactRole), `title`, `notes` (recruiter only — AI never writes), `relationship_score` (1–5), `bypass_hr_warning`, `is_primary`
- AI endpoints available for clients: `client-snapshot.ts`, `client-meeting-prep.ts`, `client-draft.ts`, `enrich-client.ts`
- The `ContactRole` type lives in `src/integrations/supabase/types.ts`: `"hiring_manager" | "hr_gatekeeper" | "ta_coordinator" | "executive" | "other"`

### Architecture Decisions & Constraints
- Icons: `@tabler/icons-react` outline variants only
- Toast: `sonner` only
- Salary: always `¥XM` format via `formatYen()`
- Stage badge: always `<StageBadge stage={...} />`
- TanStack Query: always `staleTime: 30_000, retry: 1`
- **Forbidden words in all prompts:** `straightforward`, `genuinely`, `honestly`, `leverage` (as verb), `utilize`, em dashes
- **AI model for all endpoints:** `claude-sonnet-4-20250514`
- No `as any` casts — fix the type properly
- No `select("*")` in production queries — always explicit column lists

### Known Issues / Remaining Technical Debt
1. **Team Activity Feed on dashboard** — still shows logged-in recruiter's own interactions. Fix: query interactions by `team_id` via recruiters join.
2. **Submission package "Accept All / Reject All"** — not implemented in TranscriptPanel.
3. **`clients.$id.tsx` and `candidates.$id.tsx` are large** (~3,225 and ~3,400 lines).
4. **`/jobs/$id`** — no "Add condition" shortcut from within JD text.
5. **Single-team bootstrap** — second recruiter joining an agency requires a manual SQL update. No UI yet.
6. **Advanced Search location filter** — filters on text search of `notes_pitch`/`notes_personality`; no dedicated `preferred_location` DB column. Candidates without a match default to Tokyo and show a flag icon.
