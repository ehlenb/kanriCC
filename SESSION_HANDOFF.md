# Kanri — Session Handoff Document

> Generated: 1 June 2026
> Build status: **passing** (TypeScript clean, all migrations applied)

---

## Project Overview

Kanri is an AI-native recruiter intelligence platform and CRM for boutique agency recruiters in the Japan bilingual talent market.

**Core thesis:** Recruiters lose hours rebuilding context before every call and making prioritisation decisions with incomplete information. Kanri eliminates that tax.

**Target users:** Boutique and mid-sized agency recruiting firms. Initial focus: Japan bilingual and gaishikei recruitment. Reference companies: Torch (Vincere ATS, 4 consultants), Robert Walters Japan, Hays.

**Current status:** Candidate page fully revised. Next session is the client page revision.

---

## What Was Completed This Session (3rd session, 1 June 2026)

### Candidate Page — Full Revision

#### Tab reorder
- Default tab changed to Timeline
- Order: **Timeline → Candidate notes → Candidate intelligence → Registration**

#### Timeline tab
- "Log activity" inline form: type (call/email/meeting/job spec sent/linkedin message/other), date, summary, notes, optional linked client
- Linked client makes the activity appear on the client's timeline too (`client_id` set on the interaction)
- All 6 interaction types have distinct icons and colours
- "Paste transcript" still available alongside Log activity

#### Candidate notes tab
- Removed the 5 autosave NoteSection cards (Presentation, Personality, Pitch, Closing, Internal)
- Now renders `notes_template` HTML inline as a readable document (click to edit)
- Empty state guides recruiter to template or upload
- **Note template** button: full TipTap rich-text editor, pre-populates from all candidate DB data, 2s debounce autosave, Export to Word (.docx)
- **Upload notes** button: accepts PDF (Claude reads natively), Word (.docx via mammoth), plain text/paste — AI distributes content into the correct template sections

#### Candidate intelligence tab
- Compensation card: Edit button opens dialog (inputs in ¥M, stores raw yen ×1,000,000); "Sync from notes" button calls `/api/ai/extract-compensation` to parse salary from `notes_template`
- Collapsible "Candidate profile data" section: status/source, language, job history, motivations, blockers, competing interviews — all editable

#### Registration tab
- Stripped to: Registration form upload (PDF), CV upload (PDF + AI extraction), Candidate details card
- Candidate details: Full name (English), Full name (Japanese), Date of birth (date picker → auto-calculates and saves `age`)
- Removed: address, email, phone, LinkedIn (these live in the note template document instead)

#### Candidate profile header
- Third line added: current salary + expected salary range (only renders when values are non-null)

### Migrations Applied
- **014** — `candidates.address`, `candidates.notes_template`
- **015** — `candidates.date_of_birth`

### Packages Installed
- `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-underline` — rich text editor
- `docx` — browser-side Word export
- `mammoth` — server-side Word (.docx) text extraction

### New AI Endpoints
- `api/ai/apply-candidate-notes.ts` — distributes raw notes into template sections (text/PDF/Word)
- `api/ai/extract-compensation.ts` — reads `notes_template`, extracts salary in ¥M, saves raw yen to DB

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
NotesTab                  — rendered notes_template + NoteTemplateModal + UploadNotesDialog
  NoteTemplateModal       — TipTap editor, autosave, docx export
  UploadNotesDialog       — PDF/Word/text upload → AI distributes to template
ProcessesPage             — process binder tabs + CompensationCard + CandidateProfileSection
  CompensationCard        — read-only + Edit + Sync from notes
  EditCompensationDialog  — all salary fields, inputs in ¥M
  CandidateProfileSection — collapsible profile data cards
RegistrationPage          — form upload + CV upload + DobField
  DobField                — date picker, auto-calculates age on save
  RegistrationField       — inline-editable text field (supports numeric coercion)
```

### Backend Structure
```
api/
  ai/
    apply-candidate-notes.ts   # Distributes raw notes into template sections
    extract-compensation.ts    # Parses salary from notes_template → saves raw yen
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

---

## Next Session — Client Page Revision

Read `CLAUDE.md` and this file completely before writing any code.
Read `src/routes/_authenticated/clients.$id.tsx` in full before touching anything (~3,225 lines).

### What to know about the current client page
- Three tabs: Timeline, Client Info, Contract
- Client contacts: `name`, `role` (ContactRole), `title`, `notes` (recruiter only — AI never writes), `relationship_score` (1–5), `bypass_hr_warning`, `is_primary`
- `ContactRole` type: `"hiring_manager" | "hr_gatekeeper" | "ta_coordinator" | "executive" | "other"`
- AI endpoints: `client-snapshot.ts`, `client-meeting-prep.ts`, `client-draft.ts`, `enrich-client.ts`

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
