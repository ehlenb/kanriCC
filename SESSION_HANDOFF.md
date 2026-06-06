# Kanri — Session Handoff Document

> Generated: 5 June 2026
> Build status: **passing** (TypeScript clean, all migrations applied)
> Last session: 5th session — client page revision

---

## Project Overview

Kanri is an AI-native recruiter intelligence platform and CRM for boutique agency recruiters in the Japan bilingual talent market.

**Core thesis:** Recruiters lose hours rebuilding context before every call and making prioritisation decisions with incomplete information. Kanri eliminates that tax.

**Target users:** Boutique and mid-sized agency recruiting firms. Initial focus: Japan bilingual and gaishikei recruitment. Reference companies: Torch (Vincere ATS, 4 consultants), Robert Walters Japan, Hays.

**Current status:** Candidate page fully revised (sessions 3 + 4). Client page revised (session 5).

---

## What Was Completed This Session (5th session, 5 June 2026)

### Client Page — Major Revision

**New tab structure:** Timeline | Client info | Contacts | Jobs | Contract (was 3 tabs, now 5)

**Jobs tab (new):**
- Inline `AddJobForm` replaces the old `RequisitionIntakeModal` dialog
- JD upload (PDF/DOCX) as primary entry point — AI extracts title, salary range, location via `/api/ai/extract-req-fields`
- Fields: title, salary range (free text), location, hiring manager (select from contacts), target close date, why role opened, strategic context (+ AI generate)
- Job list shows salary_range_text, location, close date alongside pipeline badges

**Contacts tab (new):**
- `ContactsCard` moved here from Client info
- Per-contact activity log button → opens `LogInteractionDialog` pre-seeded with contact
- Per-contact interaction history (last 3 interactions with that contact shown inline)

**Timeline cross-linking:**
- Client timeline: shows "re: [candidate name]" chip when `candidate_id` is set; "with [contact name]" chip when `contact_id` is set; "spoke with candidate" badge when `primary_party = candidate`
- Candidate timeline: shows "[client name]" chip when `clients` is set; "with [contact name]" chip when `client_contacts` is set; "spoke with client" badge when `primary_party = client`

**Primary party designation:**
- `LogActivityPanel` (candidate page): "Who did you speak with?" toggle (Candidate / Client contact) shown when a client is linked
- `LogInteractionDialog` (client page): "Who you spoke with" select (Client contact / Candidate) + optional contact selector

**Japan Market Context — now editable:**
- Click any field to edit inline (years in Japan, employees, % Japanese nationals, Japan role in group, KK entity)
- Was read-only display only before; data comes from `clients` table columns populated via enrich card or manually

**Contract tab — now editable + upload:**
- Upload contract PDF/DOCX → AI extracts fee % and start date via `/api/ai/extract-contract`
- All fields (fee %, client since, contract signed) inline-editable with click-to-edit

**Bug fix — Log new job was silently failing:**
- Root cause: `is_backfill` and `hiring_manager_id` columns did not exist on `requisitions` table
- Fixed by migration 017

### Migration Applied
- **017** — `requisitions`: ADD `is_backfill`, `hiring_manager_id`, `salary_range_text`, `location`, `urgency_date`; `interactions`: ADD `contact_id` (FK to client_contacts), `primary_party`

### New AI Endpoints
- `api/ai/extract-req-fields.ts` — extracts title, salary_range_text, location from JD text
- `api/ai/extract-contract.ts` — extracts fee_pct, started_at from contract text

### Types Updated
- `src/integrations/supabase/types.ts` — added `contact_id`, `primary_party` to interactions Row/Insert/Update; added `salary_range_text`, `location`, `urgency_date` to requisitions; added `interactions_contact_id_fkey` relationship

### Dead Code Removed
- `RequisitionIntakeModal` (630-line legacy form) — deleted; replaced by inline `JobsTab`/`AddJobForm`
- Removed `EMPTY_REQ`, `triState`, `TriSelect`, `IntakeSectionHeader` helpers that were only used by the modal

---

## What Was Completed In Prior Session (4th session, 5 June 2026)

### Candidate Page — Notes Tab Redesign

Replaced the TipTap HTML template editor with a structured inline form. Each section is a card with click-to-edit field boxes that save on blur.

**Sections (in order):**
- **Current employment** — Company (`current_company`), Title (`current_title`)
- **Interview notes** — Large textarea (10 rows) → new `notes_interview` column
- **Notice period & urgency** — Number input for months + urgency select (Low/Medium/High)
- **Language assessment** — Japanese select, English select, other languages text
- **Compensation** — Current base, current bonus, current total, expected min/max (all ¥M inline, saves raw yen)
- **Recruiter assessment** — Presentation & communication only (`notes_presentation`)

Removed from notes tab: Candidate Background section (name/age/address/email/phone/LinkedIn), Work History (renamed and converted to free-form Interview Notes), bonus preference, base priority flag, equity, pitch to clients, closing intelligence, personality & working style.

### Registration Tab — Contact Fields Added

Added Email, Phone, Address, LinkedIn below Date of birth in the "Candidate details" card. All inline-editable via existing `RegistrationField` component. Labelled as auto-populated from registration form.

### Compensation Card & Edit Dialog — Trimmed

`CompensationCard` (Intelligence tab): removed base priority warning row.
`EditCompensationDialog`: reduced to 5 fields only — current base, current bonus, current total, expected min, expected max. Removed: base minimum, base is priority checkbox, bonus preference, equity/RSU, notice period.

### Bug Fix — Log Activity Failing

`interactions` table CHECK constraint only allowed `'call','email','meeting','note'` but the UI offered `'job spec sent'`, `'linkedin message'`, `'other'`. Any of those three caused a silent DB error. Migration 016 expands the constraint.

### Migration Applied
- **016** — `candidates.notes_interview` column + expanded `interactions.interaction_type` CHECK constraint

### Dead Code Removed
- `NoteTemplateModal` (TipTap editor modal) — deleted
- `UploadNotesDialog` (AI-distribute notes modal) — deleted
- All associated TipTap/docx imports cleaned up

---

## Current Architecture

### Frontend Structure
```
src/
  routes/
    __root.tsx
    index.tsx
    login.tsx
    _authenticated.tsx
    _authenticated/
      dashboard.tsx
      candidates.tsx
      candidates.$id.tsx        # Fully revised — see tab structure below
      clients.tsx
      clients.$id.tsx
      jobs.tsx
      jobs.$id.tsx
      advanced-search.tsx
  components/
    ui/                         # shadcn/ui primitives — never modify
    shared/                     # Card, SectionLabel, FieldRow, StageBadge
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
      types.ts
```

### candidates.$id.tsx — Key Components
```
CandidateProfile          — page shell, tab router
CandidateTimelineTab      — feed + LogActivityPanel + TranscriptPanel
NotesTab                  — inline form (no modal)
  NoteField               — reusable click-to-edit textarea component
  NoticeUrgencyFields     — notice period number + urgency select
  LanguageFields          — Japanese/English selects + other text
  NoteCompensationFields  — ¥M inline fields for all 5 salary columns
ProcessesPage             — process binder tabs + CompensationCard + CandidateProfileSection
  CompensationCard        — read-only (5 fields) + Edit + Sync from notes
  EditCompensationDialog  — 5 salary fields, inputs in ¥M
  CandidateProfileSection — collapsible profile data cards
RegistrationPage          — form upload + CV upload + DobField + contact fields
  DobField                — date picker, auto-calculates age on save
  RegistrationField       — inline-editable text field
```

### Backend Structure
```
api/
  ai/
    apply-candidate-notes.ts
    extract-compensation.ts
    advanced-search.ts
    infer-status.ts
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
013_candidate_lists.sql
014_candidate_registration_fields.sql   # address, notes_template
015_candidate_dob.sql                   # date_of_birth
016_candidate_notes_interview.sql       # notes_interview + expanded interactions constraint
```

### Key Salary Convention
Salaries stored as **raw yen** in DB (e.g. 12000000 for ¥12M).
`formatYen(12000000)` → `¥12.0M`.
All UI inputs that accept salary figures use ¥M notation and multiply by 1,000,000 before saving.

### Key Exported Symbols (candidates.tsx)
```typescript
BLANK_CANDIDATE_SEARCH   // { name: "", company: "", status: "", ... }
withCandidateDefaults()  // Required for all navigate() to /candidates/*
```
**IMPORTANT:** All navigation to `/candidates` or `/candidates/$id` must use `BLANK_CANDIDATE_SEARCH` or `withCandidateDefaults()`.

### clients.$id.tsx — Current Structure (after session 5)
```
5 tabs: Timeline | Client info | Contacts | Jobs | Contract

ClientDetail              — page shell, tab router
ClientTimelineTab         — shows cross-linked candidate/contact chips
LogInteractionDialog      — includes contact_id, primary_party, who-you-spoke-with
ClientIntelligenceCard    — collapsible AI account summary
ClientEnrichCard          — web search enrichment
CompanyHeaderCard         — inline strategy notes + completeness bar
JapanMarketContextCard    — all fields inline-editable
ContactsCard              — contacts list, per-contact activity log, inline history
JobsTab                   — inline AddJobForm + OpenRequisitionsCard
  AddJobForm              — JD upload + key fields
EditableContractTab       — inline-editable fields + contract file upload
```

### Key DB Columns Added (session 5)
- `requisitions`: `is_backfill` bool, `hiring_manager_id` uuid FK, `salary_range_text` text, `location` text, `urgency_date` date
- `interactions`: `contact_id` uuid FK to client_contacts, `primary_party` text ('candidate'|'client')

### Architecture Constraints
- Icons: `@tabler/icons-react` outline variants only
- Toast: `sonner` only
- Salary: always `¥XM` format via `formatYen()` — raw yen in DB
- Stage badge: always `<StageBadge stage={...} />`
- TanStack Query: always `staleTime: 30_000, retry: 1`
- **Forbidden words in all prompts:** `straightforward`, `genuinely`, `honestly`, `leverage` (as verb), `utilize`, em dashes
- **AI model:** `claude-sonnet-4-20250514`
- No `as any` — fix the type properly
- No `select("*")` — always explicit column lists

### Known Technical Debt
1. Team Activity Feed on dashboard still shows only logged-in recruiter's own interactions
2. Submission package "Accept All / Reject All" not implemented in TranscriptPanel
3. `/jobs/$id` — no "Add condition" shortcut from within JD text
4. Single-team bootstrap — second recruiter joining requires a manual SQL update
5. Advanced Search location filter uses text search of notes; no dedicated `preferred_location` DB column
6. `clients` table still has a `select("*")` — fix when next touching the client data hook (columns are known: id, company_name, logo_url, is_active, status, fee_pct, started_at, years_in_japan, japan_team_size, japan_team_japanese_pct, employee_japanese_pct, japan_role_in_group, kk_entity, strategy_notes, contract_signed, contract_url, ai_context, ai_context_updated_at)
