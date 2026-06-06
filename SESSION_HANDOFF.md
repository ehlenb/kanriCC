# Kanri — Session Handoff Document

> Generated: 6 June 2026
> Build status: **passing** (TypeScript clean, all migrations applied, pushed to main)
> Last session: 6th session — candidate notes tab overhaul + client page polish

---

## Project Overview

Kanri is an AI-native recruiter intelligence platform and CRM for boutique agency recruiters in the Japan bilingual talent market.

**Core thesis:** Recruiters lose hours rebuilding context before every call and making prioritisation decisions with incomplete information. Kanri eliminates that tax.

**Target users:** Boutique and mid-sized agency recruiting firms. Initial focus: Japan bilingual and gaishikei recruitment. Reference companies: Torch (Vincere ATS, 4 consultants), Robert Walters Japan, Hays.

**Current status:** Candidate page fully revised (sessions 3, 4, 6). Client page revised (sessions 5, 6).

---

## What Was Completed This Session (6th session, 6 June 2026)

### Candidate Notes Tab — Full Overhaul

**Source selector (new):**
- Six pill buttons at the top of the Notes tab: LinkedIn / BizReach / Doda / Referral / Inbound / Other
- Saves to `candidates.source`. Click active pill to deselect (clears to null).
- Intelligence tab profile panel now shows human label (BizReach, not bizreach).

**Interview notes — document upload + AI formatting:**
- Upload button added to Interview Notes card header. Accepts PDF and DOCX.
- Extracts text client-side (mammoth for DOCX, `/api/extract-text` for PDF).
- Sends raw text to new `/api/ai/format-interview-notes` endpoint.
- AI formats into BACKGROUND / CAREER HISTORY / MOTIVATIONS plain-text sections.
- Result shown in an editable blue preview box — recruiter can edit, then Accept (appends to existing notes) or dismiss.

**Save UX — checkmark button on all editable fields:**
- All `NoteField` components now show a dark "✓ Save" button (bottom-right of textarea) when in edit mode.
- Enter key also saves for single-line fields. Shift+Enter still inserts newlines.

**Urgency to move — redesigned:**
- Replaced High/Medium/Low select with Active/Passive toggle buttons → writes to `active_passive` column.
- `urgency_to_move` (High/Medium/Low) is a **legacy column** — do not write to it from the UI. Old data may still be there.
- New `urgency_notes` free-text field below the toggle for context (why active, when passive might look, etc.).
- Intelligence tab profile panel updated to display `active_passive` instead of `urgency_to_move`.

**Other languages — redesigned:**
- Step 1: type the language name into the input, press Enter or click "Set level".
- Step 2: pick proficiency from a grid dropdown (same scale as Japanese/English).
- Saves as "Korean — Business" format to `additional_languages`.
- Saved value shows with "Change level" link and ✕ to clear.

**Compensation — fixed:**
- ¥ symbol now always shows inline left of input — no more jumping to bottom-left.
- Removed "¥M — type 12 for ¥12M" helper text.
- `current_total` is now auto-calculated from `current_base + current_bonus` (read-only, labelled "Auto-calculated").
- `comp_notes` free-text field added at bottom for bonus structure, equity, base priority context.

### Client Page — Polish Pass

**Contacts tab — Log activity pre-fill:**
- "Log activity" button now passes contact name to `LogInteractionDialog`.
- Summary placeholder pre-fills as "e.g. Call with [Name] — topic discussed".
- `contact_id` was already saving correctly (no DB change needed).

**Jobs tab — closed jobs empty state:**
- Closed jobs section always renders. Shows "No closed jobs." when empty instead of nothing.

**Japan Market Context card — redesigned:**
- Replaced inline click-to-edit rows (which caused layout jump) with stacked label/value layout.
- Each field has a pencil icon button. Clicking it activates a full-width input with Save/Cancel.
- No more horizontal squeeze or input jumping off-screen.

**Contract tab — toggle fix:**
- `ContractFieldRow` now resets `draft` state via `useEffect` when `value` prop changes.
- "Contract signed" correctly updates to "Yes" after file upload without needing a page reload.

### Search Panel Fixes

- Enter key now triggers immediate search on the name and company text inputs.
- `LanguageFilter` now accepts a `levels` prop — English filter was previously hardcoded to render Japanese level options.

### Migration Applied

**018** — `candidates`: ADD `urgency_notes` text, ADD `comp_notes` text

### Types Regenerated

`src/integrations/supabase/types.ts` — regenerated with `urgency_notes` and `comp_notes` on candidates. Custom types block re-appended.

### New AI Endpoint

`api/ai/format-interview-notes.ts` — takes `raw_text` (string), returns `data` (formatted plain-text interview notes). Model: `claude-sonnet-4-5-20250929`. Max tokens: 1024.

---

## What Was Completed In Prior Sessions (3–5)

### Session 5 — Client Page Major Revision

New 5-tab client page: Timeline | Client info | Contacts | Jobs | Contract.

- **Jobs tab:** Inline `AddJobForm` replaces old `RequisitionIntakeModal`. JD upload → AI extracts fields.
- **Contacts tab:** `ContactsCard` moved here. Per-contact activity log button + inline interaction history.
- **Timeline cross-linking:** "re: [candidate]" and "with [contact]" chips on client timeline.
- **Japan Market Context:** click-to-edit inline (now replaced with pencil-icon stacked layout in session 6).
- **Contract tab:** upload + AI extract + inline editable fields.
- Migration 017: `requisitions` ADD is_backfill, hiring_manager_id, salary_range_text, location, urgency_date; `interactions` ADD contact_id, primary_party.

### Session 4 — Candidate Notes Tab Redesign

Replaced TipTap HTML editor with structured inline form (click-to-edit field boxes, save on blur).

Sections: Current employment, Interview notes, Notice period & urgency, Language assessment, Compensation, Recruiter assessment.

Migration 016: `notes_interview` column + expanded interactions type constraint.

### Sessions 3 — Candidate Page Revision

Registration tab contact fields. Compensation card trim. Log activity bug fix.

---

## Current Architecture

### Frontend Structure
```
src/
  routes/
    _authenticated/
      dashboard.tsx
      candidates.tsx          — list pane + filter panel (source/status/japanese/english/last_touch)
      candidates.$id.tsx      — 4-tab candidate detail (Timeline / Notes / Intelligence / Registration)
      clients.tsx
      clients.$id.tsx         — 5-tab client detail (Timeline / Client info / Contacts / Jobs / Contract)
      jobs.tsx
      jobs.$id.tsx
      advanced-search.tsx
  components/
    ui/                       — shadcn/ui primitives — never modify
    shared/                   — Card, SectionLabel, FieldRow, StageBadge
    candidate/
      TranscriptPanel.tsx
      SubmissionPackagePanel.tsx
```

### candidates.$id.tsx — Notes Tab Components
```
NotesTab
  source selector             — pill buttons → candidates.source
  InterviewNotesCard          — textarea + Upload doc button → /api/ai/format-interview-notes
  NoteField                   — reusable click-to-edit textarea with ✓ Save button
  NoticeUrgencyFields         — notice period (number input + ✓) + Active/Passive toggle + urgency_notes textarea
  LanguageFields              — Japanese select + English select + Other (type name → pick proficiency)
  NoteCompensationFields      — 5 yen fields (total read-only, auto-calc) + comp_notes textarea
```

### clients.$id.tsx — Key Components
```
5 tabs: Timeline | Client info | Contacts | Jobs | Contract

ClientDetail              — page shell, tab router
ClientTimelineTab         — cross-linked candidate/contact chips
LogInteractionDialog      — contact_id, primary_party, pre-fills contact name in summary placeholder
JapanMarketContextCard    — stacked label/value rows with pencil edit buttons
ContactsCard              — per-contact activity log (passes name to dialog), inline interaction history
JobsTab                   — inline AddJobForm + open reqs list + closed reqs section (always renders)
EditableContractTab       — upload + inline-editable fields, draft resets on value change
```

### Database — All Applied Migrations
```
001–017  (see prior sessions)
018_candidate_notes_extra.sql   — candidates: ADD urgency_notes text, comp_notes text
```

### Key Field Conventions
- `active_passive` — 'Active' | 'Passive'. Live urgency toggle. **Do not write to `urgency_to_move`.**
- `urgency_notes` — free text urgency context.
- `comp_notes` — free text compensation context.
- `source` — linkedin / bizreach / doda / referral / inbound / other. Display as human label.
- `additional_languages` — stored as "Korean — Business" (language + " — " + proficiency).
- Salaries: raw yen in DB. UI inputs in ¥M (× 1,000,000). Use `formatYen()` for display.
- `current_total` is auto-calculated from `current_base + current_bonus` in the UI. Do not make it editable again without adding an override pattern.

### Key Exported Symbols (candidates.tsx)
```typescript
BLANK_CANDIDATE_SEARCH   // { name: "", company: "", status: "", ... }
withCandidateDefaults()  // Required for all navigate() to /candidates/*
```
**IMPORTANT:** All navigation to `/candidates` or `/candidates/$id` must use `BLANK_CANDIDATE_SEARCH` or `withCandidateDefaults()`.

### Architecture Constraints
- Icons: `@tabler/icons-react` outline variants only
- Toast: `sonner` only
- Salary: always `¥XM` via `formatYen()` — raw yen in DB
- Stage badge: always `<StageBadge stage={...} />`
- TanStack Query: always `staleTime: 30_000, retry: 1`
- AI model: `claude-sonnet-4-5-20250929`
- No `as any` — use `as unknown as X` with a specific type and comment explaining why
- No `select("*")` — always explicit column lists

---

## Known Technical Debt (updated)

1. **`current_total` has no manual override** — it is locked to auto-calculate from base + bonus. If a recruiter needs to record a total that includes other comp (e.g. stock, allowances not captured separately), they cannot. Add an override pattern: show auto-calc by default, allow recruiter to click a "Override" button that unlocks the field for direct edit.

2. **`urgency_to_move` is a dead column** — still in DB with CHECK constraint (`High`/`Medium`/`Low`), still in `Candidate` type, but no longer written by the UI. Old candidate data may have values there. Options: (a) add a migration to DROP the column, or (b) run a one-time backfill converting High→Active, Low/Medium→Passive into `active_passive`. Do option (b) first if old data matters.

3. Team Activity Feed on dashboard shows only logged-in recruiter's own interactions.

4. Submission package "Accept All / Reject All" not implemented in TranscriptPanel.

5. `/jobs/$id` — no "Add condition" shortcut from within JD text.

6. Single-team bootstrap — second recruiter joining requires a manual SQL update.

7. Advanced Search location filter uses text search of notes; no dedicated `preferred_location` DB column.
