# Kanri — Project Reference for Claude

## What this is

Kanri is an AI-powered recruiting OS built for a single boutique agency recruiter working in the Japan bilingual talent market. It is not a multi-tenant SaaS product — it is a personal productivity tool for one recruiter (one Supabase auth user). The goal is to eliminate admin work and surface AI-generated intelligence at the exact moment it is needed in a placement workflow.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Routing | TanStack Router v1 — file-based, `src/routes/` |
| Data fetching | TanStack Query v5 — `staleTime: 30_000`, `retry: 1` |
| Styling | Tailwind CSS v4 + CSS custom properties (design tokens in `src/styles.css`) |
| UI components | shadcn/ui + Radix UI primitives (`src/components/ui/`) |
| Icons | `@tabler/icons-react` — outline style only, never filled |
| Toast | `sonner` |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS + Storage) |
| AI | Anthropic SDK — all AI calls server-side only |
| API layer | Vercel serverless functions in `api/ai/*.ts` |
| Local dev | `npm run dev` (Vite, port 5173) + `npm run dev:api` (tsx, port 3001) |
| Deployment | Vercel |

---

## Local development

Two terminal tabs required:

```bash
# Tab 1 — frontend
npm run dev          # Vite at localhost:5173

# Tab 2 — AI API server
npm run dev:api      # tsx watch at localhost:3001
```

`vite.config.ts` proxies `/api/*` → `localhost:3001`. The dev API server (`scripts/dev-api.ts`) loads `.env` at startup, then dynamically imports the same handler files used in production.

**Never use `vercel dev` locally** — it hangs without printing "Ready" due to a network initialization issue with this setup.

### Environment variables (`.env`)

```
VITE_SUPABASE_URL=...        # browser-safe, also read by dev-api server
VITE_SUPABASE_ANON_KEY=...   # browser-safe
SUPABASE_SERVICE_ROLE_KEY=...  # server-side only — never expose to browser
ANTHROPIC_API_KEY=...          # server-side only — never expose to browser
```

`ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must **never** appear in any `VITE_`-prefixed variable or be imported in any `src/` file.

---

## AI model

All `api/ai/*.ts` handlers use: **`claude-sonnet-4-5-20250929`**

This specific API key only has access to Claude 4+ models. Claude 3 model IDs return 404. To check what models are available:

```bash
curl https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

---

## Supabase

- **Project ID:** `iqotqiqamytpjoafwgzb`
- **RLS:** All tables enforce `recruiter_id = auth.uid()`
- **Storage bucket:** `resumes` — private, PDF only, path: `{recruiter_id}/{candidate_id}/{timestamp}_{filename}`

### Regenerating TypeScript types

```bash
SUPABASE_ACCESS_TOKEN=sbp_... supabase gen types typescript \
  --project-id iqotqiqamytpjoafwgzb > src/integrations/supabase/types.ts
```

After regeneration, re-append the custom types block at the bottom of `types.ts`:

```typescript
// ─── custom app types (preserved across regenerations) ───────────────────────

export type ContactRole =
  | "hiring_manager" | "hr_gatekeeper" | "ta_coordinator" | "executive" | "other";

export type ProcessStage =
  | "Specs Sent" | "Buy-In" | "CV Sent" | `CCM${number}` | "Offer" | "Placed" | "Closed lost";

export type JapaneseLevel =
  | "Native" | "Business" | "Conversational" | "Basic" | "None";
```

---

## Data model (key tables)

### `candidates`
Core profile. Key fields: `full_name`, `full_name_japanese`, `age`, `current_company`, `current_title`, `japanese_level`, `english_level`, `notice_period_months`, `current_base`, `current_bonus`, `current_total`, `expected_total_min`, `expected_total_max`, `base_is_priority`, `base_minimum`, `cv_url` (storage path), `notes_presentation`, `notes_personality`, `notes_pitch`, `notes_closing`, `notes_internal`.

### `candidate_roles`
Work history. `company_name`, `title`, `start_date`, `end_date` (stored as `YYYY-MM-01`), `is_current`, `achievement_notes`, `reason_for_leaving_raw`.

### `candidate_motivations`
Top 3 motivations, ranked 1–3. Used by AI to sequence positioning points.

### `candidate_blockers`
Personal constraints. `theme`, `detail`, `is_risk` (bool — risk vs. context).

### `competing_interviews`
Other offers/processes at registration time. `company_name`, `source`, `stage`, `disclosed_at`.

### `clients`
Company accounts. `company_name`, `industry`, `hq_country`, `kk_entity` (string | null), `japan_team_size`, `japan_role_in_group`, `years_in_japan`, `strategy_notes`.

### `client_contacts`
People at client companies. `name`, `role` (ContactRole), `title`, `notes`, `relationship_score` (1–5), `bypass_hr_warning`, `is_primary`.

### `requisitions`
Open roles. `title`, `client_id`, `salary_min`, `salary_max`, `salary_stretch`, `fee_pct`, `is_open`, `coverage_type` (own/retained/contingency), `strategic_context`.

### `processes`
A candidate × requisition pairing. `candidate_id`, `requisition_id`, `owner_recruiter_id`, `stage` (ProcessStage), `coverage_type` (own/colleague/uncovered), `ai_snapshot` (JSON string of NFAR positioning points).

### `interactions`
Call/email/meeting log. `candidate_id` (nullable), `client_id` (nullable), `interaction_type` (call/email/meeting), `summary`, `full_notes`, `interacted_at`.

### `storage.buckets` — `resumes`
Private. Must be created manually via Supabase Dashboard (SQL editor cannot write to the `storage` schema).

---

## Pipeline stages

```
Specs Sent → Buy-In → CV Sent → CCM1 … CCMn → Offer → Placed
                                                      → Closed lost
```

- `isCcmStage(stage)`: `/^CCM\d+$/.test(stage)` — defined in `src/lib/candidate-utils.ts`
- CCM = Client Candidate Meeting (interview rounds)
- Stage badge colours and sort order: `src/lib/candidate-utils.ts` → `stageBadgeVariant()`, `stageOrder()`

---

## Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `routes/index.tsx` | Redirects to `/dashboard` |
| `/login` | `routes/login.tsx` | Supabase email auth |
| `/_authenticated` | `routes/_authenticated.tsx` | Layout + sidebar nav guard |
| `/dashboard` | `.../dashboard.tsx` | Today view, pipeline summary |
| `/candidates` | `.../candidates.tsx` | Candidate list |
| `/candidates/$id` | `.../candidates.$id.tsx` | Candidate detail (4 tabs) |
| `/clients` | `.../clients.tsx` | Client list |
| `/clients/$id` | `.../clients.$id.tsx` | Client detail (3 tabs) |
| `/jobs` | `.../jobs.tsx` | Open requisitions + forecast |

---

## Candidate detail tabs

1. **Registration** — CV upload zone, language, status, job history, motivations, compensation, blockers, competing interviews, presentation notes
2. **Timeline** — merged feed of interactions + process milestones
3. **Candidate notes** — autosaving note sections (personality, pitch, closing, internal)
4. **Candidate intelligence** — active process panels with AI actions

---

## Client detail tabs

1. **Timeline** — interaction log + quick-log actions
2. **Client info** — contacts, enrichment card, company details
3. **Contract** — fee structure, retainer status

---

## AI endpoints (`api/ai/`)

| File | Purpose |
|---|---|
| `extract-candidate.ts` | Download PDF from storage → Claude → structured candidate fields |
| `enrich-client.ts` | Paste company text → Claude → structured client profile fields |
| `positioning.ts` | Generate NFAR positioning talking points for a process |
| `pre-call-briefing.ts` | 60-second pre-call brief for a candidate |
| `submission-note.ts` | Full candidate submission note for client |
| `client-snapshot.ts` | Two-part client account snapshot |
| `client-meeting-prep.ts` | Pre-meeting brief for client meeting |
| `client-draft.ts` | Draft client-facing email |
| `req-strategic-context.ts` | Strategic framing paragraph for a requisition |

All handlers share the same pattern: validate request → fetch data from Supabase (service role) → build prompt → call Claude → return JSON.

---

## Shared components (`src/components/shared/`)

- **`Card`** — white rounded container, standard inner padding
- **`SectionLabel`** — small uppercase label above a data group
- **`FieldRow`** — label + value row inside a Card, optional `highlight="warning"`
- **`StageBadge`** — coloured pill for pipeline stages

---

## Design system

Tokens defined as CSS custom properties in `src/styles.css`:

| Token | Value | Use |
|---|---|---|
| `--background` | `#eeede8` | Page background |
| `--card` | `#ffffff` | Card background |
| `--surface` | `#f5f5f3` | Input backgrounds, secondary surfaces |
| `--foreground` | `#1a1a18` | Primary text |
| `--muted-foreground` | `#5f5e5a` | Secondary text |
| Info blue | `#185fa5` / `#e6f1fb` | Active states, links |
| Warning amber | `#633806` / `#fdf3e7` | Base priority flags |
| Success green | `#27500a` / `#eaf3de` | Placed, confirmed states |
| Danger red | `#a32d2d` / `#fcebeb` | Risks, internal-only notes |

Process tab colours: `tab-own` (green), `tab-colleague` (grey), `tab-uncovered` (red).

Typography: 13px body, 12px labels, 11px meta/helper text. No `em` units — always `px` or `rem` via Tailwind.

---

## Utility functions (`src/lib/candidate-utils.ts`)

```typescript
relativeTime(iso)      // "Today" | "3d ago" | "2mo ago"
daysSince(iso)         // number of days since ISO date
touchTone(iso)         // "fresh" | "warm" | "cool" | "cold" (14/45/120 day thresholds)
initials(name)         // "Kenji Nakamura" → "KN"
formatYen(amount)      // 12500000 → "¥12.5M"
stageOrder(stage)      // sort key for pipeline stages
isCcmStage(stage)      // /^CCM\d+$/.test(stage)
stageBadgeVariant(stage) // "info" | "warning" | "gold" | "success" | "gray"
greetingByHour()       // time-of-day greeting
todayFormatted()       // "Monday, 24 May 2026"
```

---

## Strict rules — always follow these

### AI prompt rules
- **NEVER** include these words in any AI prompt: `straightforward`, `genuinely`, `honestly`, `leverage` (as a verb), `utilize`
- **No em dashes** in any AI-generated or prompt text
- `candidates.notes_internal` — AI **never reads** this field
- `candidates.presentation_notes` / `notes_presentation` — AI **never reads, generates, or modifies** these fields
- `client_contacts.notes` — recruiter observation only, AI **never writes** here

### Security
- `ANTHROPIC_API_KEY` — server-side only, never in `VITE_` vars, never imported in `src/`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, same rule

### Code style
- No `as any` casts — fix the type properly or regenerate Supabase types
- TanStack Query: always `staleTime: 30_000`, `retry: 1`
- Icons: `@tabler/icons-react` outline only — never import filled variants
- Supabase queries: always explicit column lists, not `select("*")`, in production code

---

## Migrations (`supabase/migrations/`)

| File | Description |
|---|---|
| `001_full_schema.sql` | Base schema — all core tables |
| `002_client_contacts.sql` | Initial client_contacts table |
| `003_candidate_notes.sql` | Candidate notes fields |
| `004_requisition_intake.sql` | Requisitions + processes |
| `005_stage_rename.sql` | Pipeline stage naming |
| `006_cv_upload.sql` | `cv_url` column on candidates |
| `007_client_contacts_extend.sql` | role, notes, relationship_score, bypass_hr_warning, is_primary on client_contacts |

**Note:** `INSERT INTO storage.buckets` in SQL migrations is silently ignored by the Supabase SQL editor — buckets must be created via the Dashboard UI.

---

## Known deferred features

- Offer panel action buttons (Closing script, Counteroffer prep, Resignation prep, Accelerate processes, Negotiate offer) — UI shells exist, logic not wired
- Multi-recruiter / team collaboration
- Email integration (send directly from Kanri)
- Calendar sync for interactions
- Candidate-facing portal
- Reporting / analytics beyond the Jobs forecast chip
