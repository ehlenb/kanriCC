# ARCHITECTURAL_STATE.md
# Kanri — Recruiter Operating System
# Last updated: 2026-05-23 | For fresh Claude instance handoff

---

## SECTION 1: PROJECT ESSENTIALS

### What This Is
Kanri is a single-recruiter CRM and AI operating system for boutique agency recruiters working in Japan. It manages candidates, clients, requisitions, and active hiring processes. The AI layer (Claude) generates meeting preps, outreach drafts, positioning, and closing scripts — all server-side, never from the browser.

### Tech Stack (exact versions from package.json)
- **React 19.2** + TypeScript 5.8, Vite 6.3, `@vitejs/plugin-react`
- **TanStack Router v1.168** (file-based, `src/routes/_authenticated/`), auto code-splitting
- **TanStack Query v5.83** — `useQuery`, `useMutation`, `useQueryClient`; standard: `staleTime: 30_000`, `retry: 1`
- **Tailwind CSS v4.2** via `@tailwindcss/vite` plugin; tokens as CSS custom properties in `src/styles.css`
- **shadcn/ui** components + **Radix UI** primitives (direct deps in package.json)
- **`@tabler/icons-react` v3.34** — OUTLINE icons only, never filled variants
- **Supabase JS v2.106** — PostgreSQL + Auth + Row Level Security
- **`@anthropic-ai/sdk` v0.55** — Claude API, all calls server-side only
- **`sonner` v2** — toast notifications
- **`date-fns` v4** — date utilities
- **`zod` v3.24** — validation
- **Vercel** — serverless functions in `/api/**/*.ts` (nodejs20.x runtime)

### Project Layout
```
kanri/
├── api/ai/                    # Vercel serverless API routes
│   ├── client-draft.ts        # 6 draft types for client-facing emails/scripts
│   ├── client-meeting-prep.ts # Pre-meeting brief generation
│   ├── client-snapshot.ts     # Client intelligence snapshot
│   ├── positioning.ts         # NFAR-structured positioning, saves to processes.ai_snapshot
│   ├── pre-call-briefing.ts   # Candidate pre-call brief
│   ├── req-strategic-context.ts # Req strategic framing (3-4 sentences)
│   └── submission-note.ts     # Candidate submission report for clients
├── src/
│   ├── routes/_authenticated/
│   │   ├── candidates.$id.tsx  # Candidate detail (~1600 lines)
│   │   ├── candidates.tsx      # Candidate list
│   │   ├── clients.$id.tsx     # Client detail (~2650 lines)
│   │   ├── clients.tsx         # Client list
│   │   └── dashboard.tsx       # Dashboard
│   ├── components/
│   │   ├── candidate/          # processes/, registration/, Card.tsx, FieldRow.tsx, SectionLabel.tsx, StageBadge.tsx
│   │   ├── layout/
│   │   ├── shared/
│   │   └── ui/                 # shadcn/ui generated components
│   ├── integrations/supabase/
│   │   └── types.ts            # Full DB type definitions (hand-maintained)
│   ├── styles.css              # Design tokens + global utility classes
│   └── main.tsx, router.tsx, routeTree.gen.ts
├── supabase/migrations/
│   ├── 001_full_schema.sql     # Full schema (APPLIED)
│   ├── 002_client_contacts.sql # client_contacts + clients/req extensions (APPLIED)
│   ├── 003_candidate_notes.sql # 5 structured note fields on candidates (APPLIED)
│   └── 004_requisition_intake.sql # 20 new req columns for intake form (APPLIED)
├── vercel.json                 # SPA rewrite + nodejs20.x for api/**
├── vite.config.ts
└── package.json
```

### Environment Variables
| Variable | Side | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser + Server | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser | Public anon key for Supabase JS client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server ONLY | Service role key — bypasses RLS, NEVER in VITE_ vars |
| `ANTHROPIC_API_KEY` | Server ONLY | Claude API key — NEVER in VITE_ vars, NEVER in browser |

---

## SECTION 2: COMPLETED MILESTONES

### Migration 001 — Full Schema (APPLIED)
Core tables: `recruiters`, `candidates`, `candidate_motivations`, `candidate_blockers`, `candidate_roles`, `competing_interviews`, `clients`, `requisitions`, `processes`, `interactions`, `client_package_intelligence`. All tables have RLS with `recruiter_id = auth.uid()` policies. `touch_updated_at()` trigger on `candidates` and `processes`. Auto-create recruiter row on auth signup via `handle_new_user()`.

### Migration 002 — Client Contacts (APPLIED)
- New table: `client_contacts` (id, client_id, recruiter_id, name, role CHECK IN ('hiring_manager','hr_gatekeeper','ta_coordinator','executive','other'), title, notes, relationship_score INTEGER 1-5, bypass_hr_warning, is_primary_contact)
- `clients` additions: logo_url, is_active, fee_pct, started_at, japan_role_in_group CHECK IN ('Core market','Growth market','Satellite office'), kk_entity
- `requisitions` additions: hiring_manager_id (FK → client_contacts), is_backfill
- `interactions` type extended: adds cv_submitted, interview, risk_flag

### Migration 003 — Candidate Notes (APPLIED)
Five structured note fields on `candidates`:
- `notes_presentation TEXT` — AI CAN read (submission-note, client-draft/report/prep)
- `notes_personality TEXT` — AI CAN read (pre-call-briefing, client-draft)
- `notes_pitch TEXT` — AI CAN read (submission-note)
- `notes_closing TEXT` — AI CAN read (client-draft/closing, pre-call-briefing)
- `notes_internal TEXT` — **AI NEVER reads this** (recruiter's private risk/concern notes)

### Migration 004 — Requisition Intake (APPLIED)
20 new columns on `requisitions`:
```sql
urgency TEXT CHECK IN ('critical','high','normal','low') DEFAULT 'normal'
ideal_candidate_notes TEXT
age_min INTEGER, age_max INTEGER
japanese_level_required TEXT, english_level_required TEXT
industry_must_haves TEXT, flexibility_notes TEXT
interview_structure JSONB  -- Array<{round: number, interviewer: string, focus: string}>
has_skills_test BOOLEAN DEFAULT false, skills_test_notes TEXT
hm_can_meet_in_person BOOLEAN
hm_communication_style TEXT, hm_rejection_patterns TEXT, hm_priority_beyond_jd TEXT
other_agencies BOOLEAN, other_agency_names TEXT
open_to_foreign_candidates BOOLEAN, internal_candidate BOOLEAN
target_start_date DATE
```

### AI API Routes (all in /api/ai/, all POST)

#### `/api/ai/positioning.ts`
- Input: `{ processId, recruiterId }`
- Fetches: process → candidate (motivations×3, blockers, roles, competing_interviews) + requisition → client
- Output: `{ points: [{label: string, body: string}] }` — structured JSON saved to `processes.ai_snapshot`
- System: NFAR framework; returns JSON only, no prose wrapper
- Model: `claude-sonnet-4-20250514`, max_tokens: 600

#### `/api/ai/pre-call-briefing.ts`
- Input: `{ processId, recruiterId }`
- Fetches: process → candidate (motivations, blockers, notes_personality, notes_presentation, notes_closing) + requisition
- Output: `{ content: string }` — 4-section brief: WHO THEY ARE / WHAT THEY CARE ABOUT / WATCH OUT FOR / SUGGESTED TALKING POINTS
- Model: `claude-sonnet-4-20250514`, max_tokens: 500

#### `/api/ai/submission-note.ts`
- Input: `{ processId, recruiterId }`
- Fetches: candidate (motivations, notes_presentation, notes_personality, notes_pitch) + requisition → client
- Output: `{ content: string }` — 7-section submission report
- **NEVER reads `presentation_notes`** (old field, permanently excluded)
- Model: `claude-sonnet-4-20250514`, max_tokens: 800

#### `/api/ai/req-strategic-context.ts`
- Input: `{ clientId, title, whyRoleOpened, isBackfill }`
- Fetches: clients (company_name, strategy_notes, japan_role_in_group, years_in_japan)
- Output: `{ content: string }` — 3-4 sentence strategic framing paragraph
- Model: `claude-sonnet-4-20250514`, max_tokens: 300

#### `/api/ai/client-draft.ts`
- Input: `{ draftType, processId?, clientId, recruiterId }`
- `draftType`: `"follow_up" | "prep" | "closing" | "scheduling" | "report" | "hr_intro"`
- Always fetches: client_contacts + interactions (last 3)
- Process-specific (all except hr_intro): processes → candidates + requisitions → clients, then candidate_motivations + candidate_blockers (is_risk=true)
- Tone: derived from hiring manager's relationship_score (≥4=warm, ≤2=formal, else professional-friendly)
- Scheduling contact priority: ta_coordinator → hr_gatekeeper → hiring_manager
- `follow_up`: detects post-CV vs post-interview from stage; starts with `Subject:` line
- `scheduling`: auto-determines next round from current stage
- `hr_intro`: no processId needed; uses hr_gatekeeper contact
- Output: `{ content: string }`, max_tokens varies (600–900)
- Model: `claude-sonnet-4-20250514`

#### `/api/ai/client-meeting-prep.ts`
- Input: `{ clientId, recruiterId }`
- Fetches: clients + client_contacts + requisitions (processes → candidates) + interactions (last 5)
- Computes server-side: `activePipeline`, `feedbackOverdue` (screening ≥3 days, interview stages ≥2 days)
- Output: `{ content: string }` — 5-section brief: SITUATION / ACTIVE PIPELINE / WHAT CLIENT OWES YOU / TALKING POINTS / WATCH OUT FOR
- Model: `claude-sonnet-4-20250514`, max_tokens: 800

#### `/api/ai/client-snapshot.ts`
- Client intelligence snapshot (built in earlier session, exact signature not captured but exists)

### Client Panel (`clients.$id.tsx`) — Full Phase 1+2+3

**Phase 1 Fixes:**
1. **Amber open-reqs pill** — `CompanyHeaderCard` shows `{count} open req(s)` with `background: #faeeda, color: #633806`
2. **RelationshipDots modal** — clicking dots opens Dialog with 5-option selector; each shows dot preview + label; `dotStyle()` helper; `DOT_LABELS` record
3. **Contact note inline editing** — `editingNote` state; click note → textarea (autofocus, onBlur saves); ghost "Add a note..." text when empty
4. **4 new decision tree triggers** in `computeActions()`:
   - `prep-{processId}`: WARNING, "Draft prep ↗" — d<2 days before screening/interview
   - `sched-{processId}`: INFO, "Draft scheduling message ↗" — d≥4, 1st/2nd interview only
   - `preclose-{processId}`: INFO, "Closing script ↗" — Offer stage, d<2
   - `hr-never-met`: NUDGE, "Schedule intro" — hrContact exists && !hasMetHrInPerson
5. **All process-linked triggers carry** `processId, candidateId, reqId` on ActionItem

**Phase 2 — RequisitionIntakeModal:**
- 5-section modal (A: basics, B: candidate profile, C: interview process, D: hiring manager intelligence, E: competitive context)
- `EMPTY_REQ` object with all 20+ fields; `triState()` helper for `"" | "true" | "false"` → `boolean | null`
- `handleRoundsChange()` resizes interview_structure array preserving entries
- "Generate strategic context" button → calls `/api/ai/req-strategic-context`
- `other_agency_names` input renders only when `other_agencies === "true"`
- Dialog style: `maxWidth: 680`, `overflow-y-auto max-h-[72vh]`

**Phase 3 — AI CTA wiring:**
- `draftModal` state: `{ title: string; content: string } | null`
- `draftLoading` boolean disables AI CTAs during generation
- `DRAFT_TYPE_MAP`: maps CTA string → draftType
- `handleCtaClick(item: ActionItem)`: routes by CTA string; "Log call" → dialog; source/view → toast; "Prep meeting ↗" → `generateMeetingPrep()`; hr_intro → no processId; others → fetch with processId guard
- `DraftModal`: textarea editing; copy button (`navigator.clipboard.writeText`); disclaimer text; content displayed in `#f5f5f3` preformatted div or editable textarea
- `NON_DRAFT_CTAS = new Set(["Source more ↗", "View req ↗"])` — not disabled during loading

### Candidate Panel (`candidates.$id.tsx`)

**AddToProcessModal** (at end of file):
```typescript
// Query: ["open-reqs-for-process", recruiterId] — fetches open reqs grouped by client
// handleAdd: inserts { candidate_id, requisition_id, owner_recruiter_id, stage: "Buy-in targeting", coverage_type: "own" }
//            → returns new process id → onAdded?.(id)
// Invalidates: ["candidate-profile", candidateId] + ["open-reqs-for-process", recruiterId]
// Existing req entries shown at opacity 0.6 with "Added" green badge (disabled)
// Salary: ¥X.XM format
```
ProcessesPage: empty state shows "Add to process" button; non-empty state has "+ Add to process" in legend row top-right. `existingReqIds` computed from current processes.

---

## SECTION 3: CURRENT STATE OF THE ART

### Design System (src/styles.css)

**Color Tokens:**
```
--background: #eeede8    (page bg)
--card: #ffffff           (panel bg)
--surface: #f5f5f3        (secondary surface)
--foreground: #1a1a18     (primary text)
--muted-foreground: #5f5e5a
--primary: #1a1a18
--info: #185fa5 / --info-bg: #e6f1fb / --info-border: rgba(24,95,165,0.3)
--warning: #633806 / --warning-bg: #faeeda / --warning-border: rgba(99,56,6,0.25)
--danger: #a32d2d / --danger-bg: #fcebeb
--success: #27500a / --success-bg: #eaf3de
--process-own: #c0dd97   (green tab)
--process-colleague: #d3d1c7  (grey tab)
--process-uncovered: #f7c1c1  (red tab)
```

**Global Classes:**
- `.sl` — section label: 11px, #888780, uppercase, letter-spacing 0.05em
- `.ab` — ghost action button: 11px, 4px 10px padding, 0.5px border rgba(26,26,24,0.22), hover #f5f5f3
- `.process-tab` — binder tab: 8px 8px 0 0 border-radius, no bottom border; `.tab-own`, `.tab-colleague`, `.tab-uncovered`; `.inactive` at opacity 0.5
- `.nfar` — NFAR card: border-left 2px solid info-border, #f5f5f3 bg, 8px 12px padding
- `.nfar-obj` — 11px, #185fa5, uppercase, 500 weight
- `.nfar-txt` — 13px, #1a1a18, line-height 1.5

**Layout Pattern:** Two-pane for candidates and clients (list + detail). Detail panels use binder tab system for processes — `overflow-x: auto` on tab strip, NEVER wrapping tabs.

### ActionItem Type (clients.$id.tsx)
```typescript
type ActionPriority = "WARNING" | "INFO" | "NUDGE";
type ActionItem = {
  id: string;
  priority: ActionPriority;
  title: string;
  body: string;
  cta: string;
  processId?: string;   // for all process-linked triggers
  candidateId?: string; // for all process-linked triggers
  reqId?: string;       // for process-linked triggers + req-level triggers
};
```

### Decision Tree (`computeActions()` in clients.$id.tsx)
All 9 triggers currently implemented:
1. `no-open-reqs` — NUDGE: no open requisitions
2. `stalled-{reqId}` — WARNING: open req with zero candidates in pipeline
3. `cv-overdue-{processId}` — WARNING: Screening ≥3 days, feedback overdue
4. `int-overdue-{processId}` — WARNING: Interview stage ≥2 days, feedback overdue
5. `offer-{processId}` — WARNING: Offer stage, needs attention
6. `prep-{processId}` — WARNING: upcoming interview (d<2), cta "Draft prep ↗"
7. `sched-{processId}` — INFO: 1st/2nd interview stage ≥4 days, cta "Draft scheduling message ↗"
8. `preclose-{processId}` — INFO: Offer stage d<2, cta "Closing script ↗"
9. `hr-never-met` — NUDGE: hrContact exists && no in-person meeting logged

### ProcessStage Values (exact strings, CHECK constraint)
```
'Buy-in targeting' → 'Screening' → '1st interview' → '2nd interview'
→ 'Final interview' → 'Offer' → 'Closed won' | 'Closed lost'
```

### Helpers / Patterns
```typescript
// triState: form field "" | "true" | "false" → DB boolean | null
function triState(v: "" | "true" | "false"): boolean | null
// dotStyle: relationship score visualization
function dotStyle(dotIndex: number, score: number | null): React.CSSProperties
  // score absent or dotIndex > score: { background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)" }
  // score 1-3: { background: "#b5d4f4" }  (light blue = partial)
  // score 4-5: { background: "#185fa5" }   (full blue = strong)
// parsePositioningPoints: JSON.parse with plain-text fallback for legacy ai_snapshot
function parsePositioningPoints(raw: string | null): Array<{label: string; body: string}>
// formatYen: number → "¥X.XM" string (in client-draft.ts server side)
const formatYen = (n: number | null) => n ? `¥${(n / 1_000_000).toFixed(1)}M` : null
```

### Supabase Query Patterns
```typescript
// Standard client init (browser)
import { createClient } from "@supabase/supabase-js"
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

// Server-side (API routes) — uses service role to bypass RLS
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Autosave pattern (NoteSection / contact notes)
async function saveNote() {
  await supabase.from("table").update({ field: value }).eq("id", id);
  void qc.invalidateQueries({ queryKey: [...] });
}
// Triggered onBlur, not on change
```

---

## SECTION 4: ARCHITECTURAL DRIFT & GUARDRAILS

### RULE 1 — AI Field Access (NEVER VIOLATE)
| Field | AI Access |
|---|---|
| `candidates.presentation_notes` | **NEVER** — old field, permanently excluded from all AI prompts |
| `candidates.notes_internal` | **NEVER** — private recruiter risk notes |
| `client_contacts.notes` | **NEVER written by AI** — recruiter observation only |
| `candidate_roles.reason_for_leaving_raw` | **NEVER exposed** to clients, never quoted directly |
| `candidates.notes_presentation` | ✓ OK for submission-note, client-draft/report/prep |
| `candidates.notes_personality` | ✓ OK for pre-call-briefing, client-draft |
| `candidates.notes_pitch` | ✓ OK for submission-note |
| `candidates.notes_closing` | ✓ OK for client-draft/closing, pre-call-briefing |

### RULE 2 — Forbidden Words in ALL AI Prompts
**Every** system prompt must include (or equivalent of) the FORBIDDEN constant:
```
"NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Write in clear English suitable for non-native speakers."
```
This is enforced via the `FORBIDDEN` constant in `client-draft.ts` and inline in other API routes.

### RULE 3 — API Key Security
- `ANTHROPIC_API_KEY` — server-side ONLY, `process.env.ANTHROPIC_API_KEY`, never `VITE_` prefixed
- `SUPABASE_SERVICE_ROLE_KEY` — server-side ONLY, same rule
- All Claude API calls go through `/api/ai/` Vercel functions — never from the browser

### RULE 4 — No AI Auto-Send
Every draft shown to the user must include disclaimer: "AI-generated draft — review and edit before sending. Never send automatically."

### RULE 5 — Icon Consistency
Always use `@tabler/icons-react` outline variants only. Examples: `IconSparkles`, `IconPlus`, `IconCopy`, `IconCheck`. NEVER use filled variants.

### RULE 6 — Edit Tool Pitfall
Unicode box-drawing characters (`─`, U+2500) in section comment headers CANNOT be used as `old_string` in Edit tool calls — character count variation causes match failures. Always match from the function signature line below, never from the separator comment.

### RULE 7 — Tailwind v4 Note
Tailwind v4 does not use `tailwind.config.js`. All theme tokens are CSS custom properties in `src/styles.css` under `@theme inline`. Do not create a config file.

### RULE 8 — No Wrap on Process Tabs
The binder tab strip uses `overflow-x: auto` and `flex-shrink: 0` on each tab. Never use flex-wrap. Adding many processes should scroll, not wrap.

### Known Fragile Points
- `types.ts` is hand-maintained — any new migration must be reflected manually in `src/integrations/supabase/types.ts`
- `routeTree.gen.ts` is auto-generated by `@tanstack/router-plugin` — never edit manually
- `processes.ai_snapshot` stores JSON string from positioning API; `parsePositioningPoints()` must handle both JSON and legacy plain text fallback

---

## SECTION 5: THE ROADMAP (NEXT STEPS)

### P0 — Requisition Intelligence View (CRITICAL, UNBUILT)
Multiple CTAs already point to this screen: "View req ↗" and "View full requisition intelligence ↗". This is the most strategically important missing screen.

**Route:** `/requisitions/$id` (or nested under clients)
**Should display:**
- Req header: title, client, urgency, salary range, target start date
- Strategic context (from `strategic_context` field)
- Full intake intel: candidate profile, language requirements, interview structure, HM intelligence
- Active pipeline for this req (all processes in non-closed stages)
- AI-generated candidate fit analysis (future)
- Fee calculation: `fee_pct` × `salary_stretch` or `salary_max`

**Files to create:**
- `src/routes/_authenticated/requisitions.$id.tsx`
- No new migration needed — all data exists in migration 004

### P1 — Candidate Panel AI Stubs (UI exists, no API)
These buttons render in `candidates.$id.tsx` but have no backend:
- Closing script
- Counteroffer defense
- Resignation prep script
- Email pitch draft
- Call pitch draft

**Solution:** Extend `/api/ai/client-draft.ts` with new draftTypes OR create `/api/ai/candidate-draft.ts`.

Suggested new types for candidate-facing drafts:
```typescript
type CandidateDraftType = "pitch_email" | "pitch_call" | "closing_script" | "counteroffer" | "resignation_prep"
```

### P2 — Candidate List Enhancements
Current `candidates.tsx` shows minimal data. Needed:
- Urgency-to-move coloring (High = danger, Medium = warning, Low = neutral)
- Active process count badge per candidate
- Language level badges (Japanese + English)
- Filter by: active_passive, urgency_to_move, stage in pipeline
- Sort by: updated_at (default), created_at, full_name

### P3 — Client List Enhancements
Current `clients.tsx` is minimal. Needed:
- Open req count badge per client
- Active candidate count (across all open reqs)
- is_active filter (hide inactive by default)
- japan_role_in_group badge
- Fee percentage display

### P4 — Interaction Log (currently write-only)
Interactions are logged via `LogCallDialog` in clients.$id.tsx but never displayed in the UI beyond AI context.
- Build interaction timeline component (shared between candidates and clients)
- Display in both `candidates.$id.tsx` and `clients.$id.tsx`
- Filter by interaction_type

### P5 — Dashboard (`dashboard.tsx`)
Currently a stub. Should show:
- Open requisitions across all clients (sorted by urgency)
- Overdue feedback requests (same logic as `feedbackOverdue` in client-meeting-prep.ts)
- Candidates in Offer stage
- Recent interactions (last 7 days)
- Pipeline health: count by stage across all processes

### P6 — Package Intelligence Card
`client_package_intelligence` table exists (migration 001) but no UI to enter or display it. This data is valuable for candidate compensation positioning.

### P7 — Candidate Registration Flow
`src/components/candidate/registration/` directory exists. Full registration UI may be partially built — audit before rebuilding.

---

## QUICK REFERENCE: API CALL SHAPES

```typescript
// All API routes: POST to /api/ai/<route>

// positioning
{ processId: string, recruiterId: string }
→ { points: Array<{label: string, body: string}> }

// pre-call-briefing
{ processId: string, recruiterId: string }
→ { content: string }

// submission-note
{ processId: string, recruiterId: string }
→ { content: string }

// req-strategic-context
{ clientId: string, title: string, whyRoleOpened: string, isBackfill: boolean }
→ { content: string }

// client-draft
{ draftType: "follow_up"|"prep"|"closing"|"scheduling"|"report"|"hr_intro",
  processId?: string, clientId: string, recruiterId: string }
→ { content: string }

// client-meeting-prep
{ clientId: string, recruiterId: string }
→ { content: string }
```

## QUICK REFERENCE: SUPABASE TABLE KEYS

```
recruiters:           id (= auth.users.id)
candidates:           id, recruiter_id
candidate_motivations: id, candidate_id, rank (1|2|3) UNIQUE
candidate_blockers:   id, candidate_id, is_risk boolean
candidate_roles:      id, candidate_id, is_current, reason_for_leaving_raw (INTERNAL)
competing_interviews: id, candidate_id
clients:              id, recruiter_id
client_contacts:      id, client_id, recruiter_id, role CHECK (5 values)
client_package_intelligence: id, client_id UNIQUE
requisitions:         id, client_id, recruiter_id, is_open, urgency, interview_structure JSONB
processes:            id, candidate_id, requisition_id, owner_recruiter_id, stage, coverage_type, ai_snapshot
interactions:         id, candidate_id?, client_id?, process_id?, recruiter_id, interaction_type
```
