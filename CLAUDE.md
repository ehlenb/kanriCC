# Kanri — Operating Specification

> This document is the single source of truth for all development decisions on Kanri.
> Every AI agent, every session, every feature starts here.
> When in doubt, consult this file before writing a single line of code.

---

## 1. Product Identity

**Kanri is an AI-native recruiter intelligence layer and execution command center for boutique and mid-sized agency recruiting teams.**

It is not:
- A sourcing engine
- A generic AI assistant
- A full recruiting ERP

It is:
- A recruiter intelligence layer that sits above existing ATS systems
- A relationship memory and context reconstruction engine
- A daily execution command center that tells recruiters what to do and in what order
- A team visibility layer so recruiters can see what teammates are doing without switching tools
- Long term goal is to replace ATS systems

**The core thesis:** Recruiters lose hours every day to cognitive overhead — rebuilding context before every call, manually piecing together pipeline status, and making prioritization decisions with incomplete information. Kanri eliminates that tax without requiring them to abandon their existing ATS.

**The product promise:** A recruiter opens Kanri and within 30 seconds knows exactly what requires their attention today, what to say in their next conversation, and what their team has been doing.

**The positioning sentence:** ChatGPT gives answers. Kanri manages recruiting state.

**The MVP positioning:** Kanri is a recruiter intelligence layer and AI operating system that augments existing workflows rather than replacing them. Existing ATS platforms remain the initial source of truth. Kanri becomes the layer that makes recruiters more effective, organized, and informed. The MVP must prove that recruiters gain meaningful operational clarity before asking them to fully migrate systems.

**The target customer:** Boutique and mid-sized agency recruiting firms. Initial focus on Japan bilingual and gaishikei recruitment (placing bilingual candidates at foreign firms in Japan). Reference companies: Torch (Vincere ATS, 4 consultants), Robert Walters Japan, Hays, Michael Page, RGF.

---

## 2. Non-Negotiable Rules (Read First, Always)

These rules override everything else. No exceptions.

### AI Output Rules
- NEVER use these words in any AI prompt or generated output: `straightforward`, `genuinely`, `honestly`, `leverage` (as a verb), `utilize`
- NEVER use em dashes (`—`) in AI-generated text or prompts
- All AI output must be written in plain, clear English. Non-native English speakers are the primary audience. Short sentences. No jargon.
- `candidates.notes_internal` — AI **never reads this field under any circumstance**
- `candidates.notes_presentation` — AI **never reads, generates, or modifies this field**
- `client_contacts.notes` — recruiter observation only. AI **never writes here**
- AI never generates or modifies anything explicitly marked "recruiter judgment only"
- AI output is always a starting point for recruiter judgment, never a final answer
- Recruiters must be able to edit all AI-generated output inline before using it

### Security Rules
- `ANTHROPIC_API_KEY` — server-side only. Never in any `VITE_` variable. Never imported in `src/`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only. Same rule
- All AI calls go through `api/ai/*.ts` serverless functions. Never call the Anthropic API from the browser
- RLS enforces team-scoped access — every table includes both `recruiter_id` (owner) and `team_id` (org)

### Code Quality Rules
- No `as any` casts — fix the type properly or regenerate Supabase types
- No `select("*")` in Supabase queries in production code — always explicit column lists
- TanStack Query: always `staleTime: 30_000`, `retry: 1` — no exceptions
- Icons: `@tabler/icons-react` outline variants only — never import filled variants
- Never use `vercel dev` locally — it hangs. Use `npm run dev` + `npm run dev:api`

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 19, TypeScript, Vite 6 | Strict TypeScript — no `any` |
| Routing | TanStack Router v1 | File-based, `src/routes/` |
| Data fetching | TanStack Query v5 | `staleTime: 30_000`, `retry: 1` always |
| Styling | Tailwind CSS v4 + CSS custom properties | Tokens in `src/styles.css` |
| UI components | shadcn/ui + Radix UI primitives | `src/components/ui/` — never modify |
| Icons | `@tabler/icons-react` | Outline only, never filled |
| Toast | `sonner` | No other toast library |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS + Storage) | Multi-user, team-scoped RLS |
| AI | Anthropic SDK | Server-side only, all via `api/ai/` |
| API layer | Vercel serverless functions | `api/ai/*.ts` |
| Deployment | Vercel | Auto-deploys on push to main |

---

## 4. Local Development

```bash
# Tab 1 — frontend
npm run dev          # Vite at localhost:5173

# Tab 2 — AI API server
npm run dev:api      # tsx watch at localhost:3001
```

`vite.config.ts` proxies `/api/*` → `localhost:3001`. The dev API server (`scripts/dev-api.ts`) loads `.env` at startup, then dynamically imports the same handler files used in production.

**NEVER use `vercel dev` locally** — it hangs without printing "Ready."

### Environment Variables (`.env`)

```
VITE_SUPABASE_URL=...          # browser-safe
VITE_SUPABASE_ANON_KEY=...     # browser-safe
SUPABASE_SERVICE_ROLE_KEY=...  # server-side only
ANTHROPIC_API_KEY=...          # server-side only
```

---

## 5. Multi-User Architecture

Kanri is a team product. Multiple recruiters at the same agency share one workspace.

### Core Concepts

- **Team** — the agency. One team per agency account. All data is scoped to a team.
- **Recruiter** — an individual user within a team. Has their own login and their own activity.
- **Ownership** — candidates, clients, and requisitions have an `owner_recruiter_id` but belong to the team. All team members can view all records.
- **Visibility** — the primary multi-user value is seeing what teammates are logging. Not collaboration in real time, but shared context.

### What Multi-User Means in Practice

- A recruiter can see all candidates, clients, and requisitions owned by teammates
- A recruiter can see interactions logged by teammates on shared accounts
- Processes show which recruiter owns them
- The dashboard surfaces priority actions for the logged-in recruiter only — not the whole team's queue
- Teammates' activity appears in timelines with a clear "logged by [name]" attribution

### What Multi-User Does NOT Mean in MVP

- No real-time collaboration or live cursors
- No commenting or @mentions
- No permission tiers (everyone on a team has the same access level)
- No admin / manager roles
- No private records hidden from teammates

### RLS Pattern

Every table has both:
- `recruiter_id` — the user who created/owns the record
- `team_id` — the agency this record belongs to

RLS policies enforce: `team_id = auth.jwt() -> team_id`. All team members can read all records within their team. Write operations also check ownership where relevant.

---

## 6. Architecture

### Folder Structure

```
src/
  routes/           # TanStack Router file-based routes
  components/
    ui/             # shadcn/ui primitives — never modify directly
    shared/         # Reusable domain-aware components (Card, StageBadge, etc.)
    [feature]/      # Feature-specific components (candidates/, clients/, jobs/, dashboard/)
  lib/
    candidate-utils.ts   # All candidate domain utility functions
    supabase.ts          # Supabase client (browser)
    supabase-server.ts   # Supabase client (service role, server-side only)
  hooks/            # Custom React hooks — one concern per hook
  integrations/
    supabase/
      types.ts      # Generated types + custom app types appended below
  styles.css        # Design tokens as CSS custom properties
api/
  ai/               # Vercel serverless AI handlers
supabase/
  migrations/       # Sequential SQL migration files
scripts/
  dev-api.ts        # Local dev API server
```

### State Management

- **Server state:** TanStack Query exclusively. All Supabase data goes through query/mutation hooks.
- **Local UI state:** `useState` / `useReducer` inside components. Do not reach for a global store.
- **URL state:** Use TanStack Router search params for list filters, active tabs, and pagination. Do not put filter state in React state if it should survive a page refresh.
- **No global state library** — no Zustand, no Redux, no Context for data. The query cache is the store.
- **Optimistic updates:** Use TanStack Query's `onMutate` / `onError` / `onSettled` pattern for all mutations that change visible UI. Do not wait for server confirmation before updating the UI.
- **AI output state:** AI-generated content is fetched on demand, stored in component state, and editable inline before the recruiter copies or acts on it. It is not persisted unless explicitly saved (e.g. `ai_snapshot` on a process).

### Query Key Conventions

```typescript
// Pattern: [entity, id?, subresource?]
['candidates']                          // list
['candidates', id]                      // single
['candidates', id, 'motivations']       // related list
['candidates', id, 'roles']
['clients']
['clients', id]
['clients', id, 'contacts']
['requisitions']
['processes', candidateId]
['interactions', { candidateId }]
['interactions', { clientId }]
['dashboard', recruiterId]              // daily agenda — scoped to logged-in user
```

Always use these exact key shapes. Inconsistent query keys break cache invalidation.

### API Handler Contract

Every `api/ai/*.ts` handler must follow this exact pattern:

```typescript
// 1. Validate request method and required fields — return 400 if invalid
// 2. Initialize Supabase with service role key
// 3. Fetch all required data from Supabase (explicit column lists only)
// 4. Build prompt — apply all AI output rules from Section 2
// 5. Call Claude: model claude-sonnet-4-5-20250929, max_tokens: 1024
// 6. Parse and validate response
// 7. Return { data: ... } on success, { error: string } on failure
// Always return HTTP 200 — put error information in the response body, not HTTP status
```

### Error Handling Standard

- All errors surface via `sonner` toast — `toast.error()` for failures, `toast.success()` for confirmations
- Toast messages are short plain English. No technical error codes shown to the user.
- If an AI endpoint fails, show: "Could not generate [output name]. Try again." Never show the raw error.
- All mutations use `onError` to revert optimistic updates.

---

## 7. AI Model

All `api/ai/*.ts` handlers use: **`claude-sonnet-4-5-20250929`**

This API key only has access to Claude 4+ models. Claude 3 model IDs return 404.

```bash
# Check available models
curl https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

---

## 8. AI Behavior Standards

### What AI Generates

- Daily priority agenda (dashboard — scoped to logged-in recruiter)
- Pre-call briefings (candidate and client)
- Positioning talking points (context-driven, see below)
- Candidate submission notes for clients
- Email drafts — copy/paste only, no direct sending in MVP
- Call scripts and expectation management guides
- Resignation prep and counteroffer defense scripts
- Client meeting prep
- Risk flags and next-action suggestions

### What AI Never Generates or Modifies

- `candidates.notes_presentation` — recruiter observation, never touched by AI
- `candidates.notes_internal` — never read or written by AI under any circumstance
- `client_contacts.notes` — recruiter observation only
- Any field or section explicitly marked "recruiter judgment only"

### Positioning Framework (NFAR — never surface this label)

Every positioning talking point implicitly follows: Need → Feature → Action → Result.

Critical rule: **NFAR is not a template. It is a thinking framework.** Every candidate situation is unique. The AI must read all available context — candidate motivations ranked 1–3, job history, reasons for leaving, blocker notes, pitch notes, client strategy notes, hiring manager preferences, requisition strategic context — and generate talking points that are specific to this candidate for this role at this client. Generic points are a failure state.

Output rules:
- Max 2–3 sentences per talking point
- Sequenced in order of the candidate's ranked motivations (motivation rank 1 drives point 1)
- Sounds natural and conversational — not scripted, not bulleted sales copy
- Recruiter internalizes these; they do not read them verbatim on a call

### Prompt Quality Rules

- Write as if the reader has 30 seconds. Be direct.
- No preamble. No "Certainly!" No "Here's what I found."
- If data is missing, say so briefly and move on. Do not hallucinate.
- All monetary values in JPY formatted as ¥XM (e.g. ¥12.5M)
- Language levels use the Japan standard scale: Native / Fluent / High Business / Business / Low Business / High Conversational / Conversational / Low Conversational / Basic

### AI Output is Always Editable

All AI-generated text must render in an editable state (textarea or contenteditable) so the recruiter can modify before copying. Never render AI output as static read-only text.

---

## 9. Dashboard — Daily Agenda

The dashboard is the most important screen in Kanri. It is the first thing a recruiter sees every day.

**Purpose:** Give the recruiter a clear, prioritized agenda of what to do today. Not a summary of everything — a ranked action list.

**Scoped to:** The logged-in recruiter only. Their candidates, their processes, their follow-up obligations.

**Priority ranking logic (highest to lowest urgency):**
1. Candidates at Offer stage — any activity or risk
2. Candidates at CCM stage with feedback pending more than 48 hours
3. Candidates at CV Sent with no client response after 5 business days
4. Candidates at Buy-In with no follow-up in 7 days
5. Candidates with a last-touch date older than 30 days who are in an active process
6. Clients with an open requisition and no interaction logged in 14 days

**Each agenda item shows:**
- Who (candidate or client name)
- What stage they are at
- Why this is flagged (the specific reason for urgency)
- A suggested next action (AI-generated, one sentence)
- A quick-action button to begin that action (e.g. open pre-call brief, open draft email)

**The recruiter can:**
- Reorder items by drag and drop
- Mark an item done for today (removes from today's view, re-evaluates tomorrow)
- Snooze an item to a specific date

---

## 10. Japan Market Domain Knowledge

This context is essential for writing accurate AI prompts and building correct UI logic. Apply it whenever generating recruiter-facing content.

### The Market

- Japan is a candidate-driven market. Job-to-applicant ratio is above 1.2. Candidates have leverage.
- Bilingual talent (Japanese + English at business level or above) is extremely scarce — under 10% of the professional workforce has this combination.
- Agency fees are 30–35% of OTE, significantly higher than global averages. This reflects the difficulty of finding qualified bilingual talent.
- BizReach is the dominant sourcing platform in Japan for mid-career professionals — more commonly used than LinkedIn in this market.

### Candidate Psychology from Domestic Companies

- Strong cultural pressure to stay. Loyalty to employer is a social value.
- Identity is tied to company brand — Sony, Toyota, Mizuho, Nomura, trading houses carry real psychological weight.
- "Job hopping" (more than 2–3 moves before age 35) carries stigma. Always read job history with this in mind.
- Fear of instability is real. Foreign firms are perceived as less stable even when they are not.

### Standard Objection-Handling Framework (Domestic to Foreign Move)

1. The foreign firm has a longstanding Japan presence and a high percentage of Japanese employees
2. Japan is a core market for them, not a satellite office
3. Foreign firms offer higher base salary, flexible benefits, WFH options, and merit-based promotion
4. Domestic Japanese companies promote by seniority. Foreign firms promote by results.

### Compensation Context

- Candidates expect 10–20% salary increase when changing jobs
- Base salary stability matters more than total comp for most Japanese candidates
- Always capture base preference separately from total comp — `base_is_priority` and `base_minimum` are first-class fields, not optional

### Counteroffer Statistics (use in counteroffer defense prompts)

- 60–80% of employees who accept a counteroffer leave within 6 months
- 90% leave within 12 months
- The counteroffer buys the employer time. It does not solve the underlying reason the candidate wanted to leave.

---

## 11. Data Model

### `teams`
One row per agency. All data belongs to a team.
`id`, `name`, `created_at`

### `recruiters` (extends Supabase auth.users)
One row per user. Linked to a team.
`id` (= auth.uid()), `team_id`, `full_name`, `email`

### `candidates`
Core profile.

Key field conventions:
- `active_passive` — 'Active' or 'Passive'. This is the live urgency toggle shown in the Notes tab. `urgency_to_move` (High/Medium/Low) is a legacy column — do not write to it from the UI.
- `urgency_notes` — free text explaining why a candidate is active or when a passive one might start looking.
- `comp_notes` — free text compensation context (bonus structure, equity, base priority detail). Shown below the ¥ fields in Notes tab.
- `source` — one of: linkedin / bizreach / doda / referral / inbound / other. Display as human label (BizReach not bizreach).
- `additional_languages` — stored as "Korean — Business" format (language name + proficiency joined by " — ").

| Field | Type | AI Access | Notes |
|---|---|---|---|
| `full_name` | text | Read | Latin characters |
| `full_name_japanese` | text | Read | Kanji/kana |
| `age` | int | Read | Required for Japan submissions |
| `current_company` | text | Read | |
| `current_title` | text | Read | |
| `japanese_level` | JapaneseLevel | Read | |
| `english_level` | text | Read | Same scale |
| `notice_period_months` | int | Read | |
| `current_base` | int | Read | JPY |
| `current_bonus` | int | Read | JPY |
| `current_total` | int | Read | JPY |
| `expected_total_min` | int | Read | JPY |
| `expected_total_max` | int | Read | JPY |
| `base_is_priority` | bool | Read | Render warning amber if true |
| `base_minimum` | int | Read | JPY hard floor |
| `cv_url` | text | Read | Storage path, not public URL |
| `notes_presentation` | text | **NEVER** | Recruiter only. AI never reads or writes. |
| `notes_personality` | text | Read | Recruiter observation |
| `notes_pitch` | text | Read | Used for positioning |
| `notes_closing` | text | Read | Used for closing strategy |
| `notes_internal` | text | **NEVER** | AI never reads under any circumstance |
| `owner_recruiter_id` | uuid | — | FK to recruiters |
| `team_id` | uuid | — | FK to teams |

### `candidate_roles`
Work history — one row per role.

| Field | Notes |
|---|---|
| `start_date` / `end_date` | Stored as `YYYY-MM-01` |
| `is_current` | Boolean |
| `achievement_notes` | What they did and achieved |
| `reason_for_leaving_raw` | Raw recruiter notes. Render with red background. AI reads for submission notes only — never displayed as AI-reframed text on registration page. |

Display rule: oldest to current, told as a career story. For each role: what they did → why they left.

### `candidate_motivations`
Top 3 motivations ranked 1–3 by candidate. AI always sequences positioning points to match this rank order. Motivation rank 1 drives the first talking point.

### `candidate_blockers`
Personal constraints. `theme`, `detail`, `is_risk` (bool). `is_risk: true` = active risk, render as warning. `is_risk: false` = context only.

### `competing_interviews`
Other processes at time of registration. `company_name`, `source`, `stage`, `disclosed_at`.

### `clients`
Company accounts. `company_name`, `industry`, `hq_country`, `kk_entity` (KK = Japanese subsidiary entity, string | null), `japan_team_size`, `japan_role_in_group`, `years_in_japan`, `strategy_notes`, `owner_recruiter_id`, `team_id`.

### `client_contacts`
People at client companies. `name`, `role` (ContactRole), `title`, `notes` (recruiter only — AI never writes here), `relationship_score` (1–5), `bypass_hr_warning` (bool), `is_primary` (bool).

### `requisitions`
Open roles. `title`, `client_id`, `salary_min`, `salary_max`, `salary_stretch`, `salary_range_text` (free-text comp description), `location`, `urgency_date` (target close date), `is_open`, `is_backfill`, `hiring_manager_id` (FK to client_contacts), `strategic_context`, `owner_recruiter_id`, `team_id`.

### `processes`
Candidate × requisition pairing. The core object driving the pipeline.

| Field | Notes |
|---|---|
| `candidate_id` | FK |
| `requisition_id` | FK |
| `owner_recruiter_id` | FK — the recruiter managing this process |
| `stage` | ProcessStage |
| `coverage_type` | own / colleague / uncovered |
| `ai_snapshot` | JSON string — cached positioning points, regenerated on demand |
| `team_id` | FK |

Tab color by `coverage_type`:
- `own` → green (`tab-own`) — recruiter's own requisition
- `colleague` → grey (`tab-colleague`) — teammate's requisition
- `uncovered` → red (`tab-uncovered`) — competitor agency or no agency coverage

### `interactions`
Activity log — calls, emails, meetings. `candidate_id` (nullable), `client_id` (nullable), `contact_id` (nullable FK to client_contacts — which specific contact was involved), `primary_party` ('candidate' | 'client' — who you were speaking with), `interaction_type` (call/email/meeting/note/job spec sent/linkedin message/other), `summary`, `full_notes`, `interacted_at`, `recruiter_id` (who logged it), `team_id`.

Always display "logged by [recruiter name]" on teammate interactions in timelines.
Cross-linking: an interaction can link to both a `candidate_id` and a `client_id` — it will appear on both timelines. Use `contact_id` to link to a specific client contact, and `primary_party` to designate who you spoke with.

### Custom TypeScript Types (append after every `gen types` run)

```typescript
// ─── custom app types (preserved across regenerations) ───────────────────────

export type ContactRole =
  | "hiring_manager" | "hr_gatekeeper" | "ta_coordinator" | "executive" | "other";

export type ProcessStage =
  | "Specs Sent" | "Buy-In" | "CV Sent" | `CCM${number}` | "Offer" | "Placed" | "Closed lost";

export type JapaneseLevel =
  | "Native" | "Fluent" | "High Business" | "Business" | "Low Business"
  | "High Conversational" | "Conversational" | "Low Conversational" | "Basic" | "None";
```

---

## 12. Pipeline Stages

```
Specs Sent → Buy-In → CV Sent → CCM1 → CCM2 … CCMn → Offer → Placed
                                                             → Closed lost
```

- **Buy-In** = candidate has given explicit consent for their CV to be submitted. A distinct and important milestone — not a formality.
- **CCM** = Client Candidate Meeting (interview round). Dynamic — CCM1, CCM2, CCM3, etc.
- `isCcmStage(stage)`: `/^CCM\d+$/.test(stage)` — in `src/lib/candidate-utils.ts`

Stage badge colors:

| Stage | Color |
|---|---|
| All CCM stages | Blue (info) |
| Buy-In | Amber (warning) |
| Offer | Gold |
| Placed | Green (success) |
| Closed lost | Grey |
| Specs Sent, CV Sent | Default/neutral |

Stage badge logic lives exclusively in `stageBadgeVariant()` in `candidate-utils.ts`. Do not duplicate inline.

---

## 13. Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `routes/index.tsx` | Redirects to `/dashboard` |
| `/login` | `routes/login.tsx` | Supabase email auth |
| `/_authenticated` | `routes/_authenticated.tsx` | Layout + sidebar nav guard |
| `/dashboard` | `.../dashboard.tsx` | Daily agenda — priority actions for logged-in recruiter |
| `/candidates` | `.../candidates.tsx` | Candidate list with filters |
| `/candidates/$id` | `.../candidates.$id.tsx` | Candidate detail (4 tabs) |
| `/clients` | `.../clients.tsx` | Client list |
| `/clients/$id` | `.../clients.$id.tsx` | Client detail (3 tabs) |
| `/jobs` | `.../jobs.tsx` | Open requisitions + revenue forecast |
| `/advanced-search` | `.../advanced-search.tsx` | Three-panel AI candidate search — not a nav item, accessed via candidates page |

---

## 14. Page Structure

### Candidate Detail — 4 Tabs

Tab order (left to right): **Timeline → Candidate notes → Candidate intelligence → Registration**

1. **Timeline** — merged feed of manual activity logs + process milestones, newest first. "Log activity" button opens inline form: type (call/email/meeting/job spec sent/linkedin message/other), date, summary, notes, optional linked client (cross-posts to client timeline). "Paste transcript" opens TranscriptPanel for AI processing.
2. **Candidate notes** — structured inline form, one card per section. Click any field box to begin typing; saves on blur. Sections: Current employment (company, title), Interview notes (large textarea → `notes_interview`), Notice period & urgency, Language assessment (Japanese/English selects + other text), Compensation (current base/bonus/total + expected range, all ¥M inline), Recruiter assessment (presentation & communication only → `notes_presentation`).
3. **Candidate intelligence** — active process panels with AI action buttons (all output editable). Compensation card with Edit dialog (5 salary fields, amounts in ¥M, stored as raw yen) + "Sync from notes" button (calls `/api/ai/extract-compensation`). Collapsible "Candidate profile data" section: status/source, language, job history, motivations, blockers, competing interviews.
4. **Registration** — document uploads (registration form PDF + CV PDF, CV triggers AI field extraction). Candidate details card: full name (English), full name (Japanese), date of birth (auto-calculates and saves `age`), email, phone, address, LinkedIn (all auto-populated from registration form upload).

### Candidate Profile Header

Shows: name · Japanese name | title · company · age | current salary · expected salary range. All pulled from DB fields. Salary only renders if at least one value is non-null.

### Client Detail — 5 Tabs

1. **Timeline** — interaction log. Each entry shows: type badge, date, "with [contact]" chip if contact_id set, "re: [candidate]" chip if candidate_id set, "spoke with candidate/client" badge from primary_party. Log event button opens LogInteractionDialog (includes who-you-spoke-with + contact selector).
2. **Client info** — company header, completeness bar, strategy notes, AI enrich, account intelligence, recommended actions, quick actions, Japan Market Context (all fields inline-editable).
3. **Contacts** — ContactsCard with per-contact activity log button and inline interaction history per contact.
4. **Jobs** — inline AddJobForm: JD upload (AI extracts title/salary/location via `/api/ai/extract-req-fields`), free-text salary range, location, hiring manager select, target close date, strategic context. Job list with pipeline badges.
5. **Contract** — all fields inline-editable (fee %, client since, contract signed). Contract file upload → AI extracts fee % and start date via `/api/ai/extract-contract`.

---

## 15. Component Architecture

### Hierarchy

```
src/components/ui/          ← shadcn primitives. Never modify.
src/components/shared/      ← Reusable domain components. Check here first.
src/components/[feature]/   ← Feature-specific. e.g. candidates/CandidateCard.tsx
```

### Existing Shared Components — use these, do not recreate

| Component | Purpose |
|---|---|
| `Card` | White rounded container, standard inner padding |
| `SectionLabel` | Small uppercase label above a data group |
| `FieldRow` | Label + value row inside a Card. `highlight="warning"` for amber state |
| `StageBadge` | Colored pill for pipeline stages — always use, never inline |

### Rules for New Components

- Check `shared/` before creating anything new
- If used in more than one place → `shared/`
- If used in one place → its feature folder
- No business logic inside UI components — extract to a hook
- No nesting `Card` inside `Card`

### Naming Conventions

- Components: `PascalCase.tsx`
- Hooks: `use[Description].ts` — e.g. `useCandidate.ts`, `useDailyAgenda.ts`
- Utilities: `camelCase` functions in `src/lib/`
- API handlers: `kebab-case.ts` in `api/ai/`
- Query keys: lowercase arrays — see Section 6

---

## 16. Design System

### Color Tokens (`src/styles.css`)

| Token | Value | Use |
|---|---|---|
| `--background` | `#eeede8` | Page background |
| `--card` | `#ffffff` | Card background |
| `--surface` | `#f5f5f3` | Input backgrounds, secondary surfaces |
| `--foreground` | `#1a1a18` | Primary text |
| `--muted-foreground` | `#5f5e5a` | Secondary text |
| Info blue | `#185fa5` / `#e6f1fb` | Active states, links, CCM stages |
| Warning amber | `#633806` / `#fdf3e7` | Base priority flags, Buy-In stage |
| Success green | `#27500a` / `#eaf3de` | Placed, confirmed states |
| Danger red | `#a32d2d` / `#fcebeb` | Risks, internal-only notes, reason-for-leaving blocks |

Process tab colors: `tab-own` (green), `tab-colleague` (grey), `tab-uncovered` (red).

### Typography

- Body: 13px
- Labels: 12px
- Meta / helper text: 11px
- No `em` units — always `px` or `rem` via Tailwind

---

## 17. UX Philosophy

### What Kanri Should Feel Like

- **Fast and calm.** The UI does not panic the recruiter. It gives them clarity.
- **Dense but not cluttered.** Recruiters manage 50+ active candidates. Information must be compact and scannable.
- **Opinionated.** The product makes decisions and presents a recommended course of action. It does not list five options and ask the recruiter to choose.
- **Human-first.** AI output is always a starting point. The recruiter edits, approves, and acts. Never the other way around.
- **Additive, not disruptive.** Kanri works alongside an existing ATS. It does not demand the recruiter abandon their current tools to get value.

### What Should Never Happen in the UX

- Do not show a loading spinner for operations under 300ms — use optimistic UI
- Do not use modals for data that can be edited inline
- Do not paginate short lists — load all or use virtual scrolling
- Do not show empty states without a clear call to action
- Do not render AI output as static read-only text — it is always editable
- Do not auto-send anything — all AI drafts are copy/paste in MVP
- Do not add a section to a page without asking: does the recruiter need this in the next 60 seconds?
- Do not require double-entry — if the recruiter already does something in their ATS, Kanri should not demand they redo it in Kanri

---

## 18. AI Endpoints (`api/ai/`)

| File | Input | Output |
|---|---|---|
| `extract-candidate.ts` | `candidate_id` (fetches PDF from storage) | Structured candidate fields from CV |
| `enrich-client.ts` | Pasted company text | Structured client profile fields |
| `positioning.ts` | `process_id` | Context-driven positioning talking points |
| `pre-call-briefing.ts` | `candidate_id` | 60-second pre-call brief |
| `submission-note.ts` | `candidate_id` + `requisition_id` | Full client submission note |
| `client-snapshot.ts` | `client_id` | Two-part client account snapshot |
| `client-meeting-prep.ts` | `client_id` + `requisition_id?` | Pre-meeting brief |
| `client-draft.ts` | `client_id` + context | Draft client-facing email |
| `req-strategic-context.ts` | `requisition_id` | Strategic framing paragraph |
| `extract-req-fields.ts` | `jd_text` | Extract title, salary_range_text, location from JD — only returns fields it can identify |
| `extract-contract.ts` | `contract_text` | Extract fee_pct, started_at from contract text — only returns fields it can identify |
| `daily-agenda.ts` | `recruiter_id` | Ranked priority action list for dashboard |
| `advanced-search.ts` | `requisition_id`, `client_id`, `threshold`, `use_key_criteria` | Scored candidate list for advanced search |
| `apply-candidate-notes.ts` | `candidateId`, `existingTemplate`, `rawNotes?`, `fileBase64?`, `fileType?` | Distributes raw notes into the correct template sections; accepts text/PDF/Word |
| `extract-compensation.ts` | `candidateId` | Reads `notes_template`, extracts salary figures, saves raw yen to candidates table |
| `format-interview-notes.ts` | `raw_text` | Formats raw document text into clean structured interview notes (BACKGROUND / CAREER HISTORY / MOTIVATIONS sections) |
| `rejection-email.ts` | `process_id`, `candidate_id` | Soft candidate rejection email in recruiter voice, using notes_interview + ccm_feedback_notes |

---

## 19. Supabase

- **Project ID:** `iqotqiqamytpjoafwgzb`
- **RLS:** All tables enforce `team_id = auth.jwt() -> team_id` (team-scoped)
- **Storage bucket:** `resumes` — private, PDF only
- **Storage path pattern:** `{team_id}/{candidate_id}/{timestamp}_{filename}`
- **Buckets cannot be created via SQL migrations** — must use Supabase Dashboard UI

### Regenerating TypeScript Types

```bash
SUPABASE_ACCESS_TOKEN=sbp_... supabase gen types typescript \
  --project-id iqotqiqamytpjoafwgzb > src/integrations/supabase/types.ts
```

After regeneration, re-append the custom types block from Section 11.

---

## 20. Migrations (`supabase/migrations/`)

| File | Description |
|---|---|
| `001_full_schema.sql` | Base schema — all core tables |
| `002_client_contacts.sql` | client_contacts table |
| `003_candidate_notes.sql` | Candidate notes fields |
| `004_requisition_intake.sql` | Requisitions + processes |
| `005_stage_rename.sql` | Pipeline stage naming |
| `006_cv_upload.sql` | `cv_url` column on candidates |
| `007_client_contacts_extend.sql` | role, notes, relationship_score, bypass_hr_warning, is_primary |
| `008_schema_extension.sql` | Schema extensions |
| `009_multi_user.sql` | Team/recruiter RLS, `current_team_id()`, `set_team_id_from_recruiter()` trigger |
| `010_ccm_feedback.sql` | CCM feedback fields on processes |
| `011_team_id_defaults.sql` | Column-level `DEFAULT current_team_id()` on core tables |
| `012_candidate_status.sql` | `placed_at`, `status_source`, `coin_icon_dismissed`; 3-status constraint |
| `013_candidate_lists.sql` | `candidate_lists` table — saved search lists with RLS and triggers |
| `014_candidate_registration_fields.sql` | `address`, `notes_template` columns on candidates |
| `015_candidate_dob.sql` | `date_of_birth` (date) column on candidates |
| `016_candidate_notes_interview.sql` | `notes_interview` column + expanded interactions type constraint |
| `017_jobs_interactions_update.sql` | `requisitions`: ADD `is_backfill`, `hiring_manager_id`, `salary_range_text`, `location`, `urgency_date`; `interactions`: ADD `contact_id`, `primary_party` |
| `018_candidate_notes_extra.sql` | `candidates`: ADD `urgency_notes` text, `comp_notes` text |

New migrations increment sequentially. Never edit existing migration files.

---

## 21. Utility Functions (`src/lib/candidate-utils.ts`)

```typescript
relativeTime(iso)        // "Today" | "3d ago" | "2mo ago"
daysSince(iso)           // number of days since ISO date
touchTone(iso)           // "fresh" | "warm" | "cool" | "cold" (14/45/120 day thresholds)
initials(name)           // "Kenji Nakamura" → "KN"
formatYen(amount)        // 12500000 → "¥12.5M" — salary stored as raw yen in DB; UI inputs in ¥M (×1,000,000)
stageOrder(stage)        // sort key for pipeline stages
isCcmStage(stage)        // /^CCM\d+$/.test(stage)
stageBadgeVariant(stage) // "info" | "warning" | "gold" | "success" | "gray"
greetingByHour()         // time-of-day greeting
todayFormatted()         // "Monday, 24 May 2026"
```

Do not duplicate these functions elsewhere. New date/stage/formatting utilities go here.

---

## 22. Deferred Features — Do Not Build in MVP

Do not suggest, scaffold, or partially implement these unless explicitly instructed.

| Feature | Status |
|---|---|
| ATS integration (Bullhorn, Vincere, Greenhouse, etc.) | Deferred post-pilot |
| Email sending from Kanri (Gmail/Outlook) | **In progress** — Gmail/Outlook OAuth + send, Feature 1 of workflow sprint |
| Calendar sync for interviews | Deferred |
| LinkedIn / BizReach sourcing automation | Deferred |
| Autonomous AI follow-ups | Deferred — trust risk too high for MVP |
| SMS / LINE / WhatsApp integration | Deferred |
| Permission tiers / admin roles | Deferred — all team members have equal access in MVP |
| Candidate-facing portal | Deferred |
| Reporting and analytics (beyond Jobs forecast chip) | Deferred |
| AI podcast / audio briefing feature | Deferred — strong idea, post-MVP |
| Automated resume tailoring | Deferred |
| Offer panel action buttons | UI shells exist, logic not yet wired |
| Real-time collaboration (live cursors, comments, @mentions) | Deferred |

---

## 23. Session Discipline for AI Agents

- Read this entire document before every session.
- When making an architectural decision not covered here, apply the most conservative interpretation and flag it for review.
- When two implementations seem equally valid, prefer the simpler one.
- When unsure whether a feature is in MVP scope, check Section 22 before proceeding.
- Do not create new shared components without first checking Section 15.
- Do not introduce new libraries without a compelling reason — prefer what is already in the stack.
- Commit at logical stopping points. One feature or fix = one commit.
- Commit message format: `[area]: description` — e.g. `candidates: add motivation ranking UI`, `ai: add pre-call briefing endpoint`, `dashboard: wire daily agenda priority logic`


## Project Status

Active development resumed June 2026. All sessions below are committed and pushed to main.

### Session log (June 2026)

**Bug fixes (committed 2026-06-06)**
- `dashboard`: requisition agenda items now navigate to client page (not candidate page); client_id threaded through daily-agenda API
- `ai/competing-analysis`: candidate lookup changed from `recruiter_id` to `team_id` (teammates' candidates were invisible)
- `candidates.$id`: extraction review modal shows toast and blocks `onExtracted` when Claude returns unparseable JSON
- `clients.$id`: contract upload now runs extraction before marking `contract_signed = true`; extraction block has catch with toast

**daily-agenda fixes (committed 2026-06-06)**
- `ccmPriorityRank`: formula fixed — now strictly decreasing per CCM round (CCM1→25, CCM2→20, CCM3→15, CCM4→12, CCM5→9…)
- Priority 8 (stale clients): `openClients` query changed from `recruiter_id` to `team_id` so teammate-owned clients surface
- Priority 2 (feedback pending): now suppressed if ANY interaction (not just call/meeting) was logged after the last interview

**ExtractionReviewModal + upload zone fixes (committed 2026-06-06)**
- Null values in extraction now clear previously-set DB fields (shown as "will be cleared" in modal)
- Roles from CV and registration form are merged + deduped when both present
- Conflict resolution state resets when modal reopens
- CV and registration form storage paths changed to `{team_id}/{candidate_id}/…` (was `{recruiter_id}/…`)
- `noticePeriodMonths` duplicate removed from prompt schema and frontend type

**Features (committed 2026-06-06)**
- `candidates.$id` Timeline: "Upcoming" events — Past/Upcoming toggle in Log activity; upcoming items render above past feed with indigo left border; `is_future` + `scheduled_at` wired to migration 021
- `candidates.$id` Buy-In: "Not interested" button sets `not_interested_at` on process; panel mutes; removes from daily-agenda priority list
- `clients.$id` Jobs tab: "Find matches" button per open requisition — calls `/api/ai/advanced-search`, shows scored candidate list with AI reason and score bar; "Draft message" per candidate calls new `/api/ai/job-spec-message` endpoint, renders in editable textarea

**Activity logging refactor (committed 2026-06-12)**
- New shared `src/components/shared/ActivityTimeline.tsx` — unified feed for both candidate and client pages; handles upcoming events, milestones, cross-link badges, contact filtering
- New shared `src/components/shared/LogActivityModal.tsx` — unified log activity dialog replacing `LogActivityPanel` (candidates) and `LogInteractionDialog` (clients); single Notes field (summary auto-derived); client types exclude "job spec sent"
- `candidates.$id`: wired to ActivityTimeline + LogActivityModal; old LogActivityPanel removed
- `clients.$id`: wired to ActivityTimeline + LogActivityModal; old LogInteractionDialog removed; per-contact filtered timeline in ContactsCard; Log activity button at top of timeline feed
- `ActivityTimeline`: interaction type capitalized and bold as primary header; cross-link chips use -san suffix (Shimada-san, Watanabe-san); "re:" and "with" chips clearly labeled
- `api/ai/client-snapshot.ts`: markdown fences stripped before JSON.parse (fixes raw JSON rendering in snapshot panel)
- `clients.$id` contract tab: View/Remove buttons extracted from upload div into separate row; filename shown; "Replace contract" zone always visible

**Mock data (2026-06-12)**
- `scripts/seed-mock-data.sql`: full deal cycle — Salesforce Japan × Masahiko Tanaka (Sony); client, 2 contacts, requisition, candidate, 2 roles, 3 motivations, 2 blockers, 2 competing interviews, 1 process (CCM1), 4 interactions
- Contract PDF uploaded to storage: `SalesforceJapan_AgencyContract.pdf` (32% fee, April 2023)

**Module 1 + 2 simulation feedback — batch fixes (committed 2026-06-17)**
- `api/ai/advanced-search.ts`: fixed model ID `claude-sonnet-4-20250514` → `claude-sonnet-4-5-20250929` (was returning 404)
- `clients.$id` Contacts tab: redesigned as collapsible list; expanded view shows detail + editable notes + per-contact ActivityTimeline + Log activity button; removed RelationshipDots and primary contact badge; added inline edit form for contact name/title/role
- `clients.$id` Jobs tab: job title is clickable, opens `JobDetailPanel` (salary, location, HM, strategic context, interactions filtered by requisition_id); interaction logging gains "Linked job" selector in client context
- `supabase/migrations/023`: `requisition_id` FK on interactions (idempotent)
- `LogActivityModal`: removed "interview scheduled", added ccm1–ccm6 as candidate activity types; exported `interactionTypeLabel(type, primaryParty)` helper; "call" renders as "Candidate Call" / "Client Call" based on `primary_party`
- `ActivityTimeline`: removed milestone chips and `MilestoneEntry`; client-perspective candidate chip now reads "candidate: Tanaka-san" in moss green (was ambiguous "re:"); uses `interactionTypeLabel` for all type display
- `supabase/migrations/024`: constraint updated to allow ccm1–ccm6 interaction types
- `candidates.$id` header: `address` rendered inline in subtitle line
- `ExtractionReviewModal.shouldClear()`: CV extraction no longer clears DB fields that exist but weren't in the CV — registration form is source of truth
- `parsePositioningPoints`: strips markdown fences before JSON.parse (model occasionally wraps output in ```json blocks)
- `AIToolbox` dropdown: replaces scattered AI action buttons across IntelligencePanel and BuyInPanel
- `clients.$id` Contract tab: embedded PDF preview via 1-hour signed URL iframe

**AI intelligence pipeline (committed 2026-06-17)**
- `positioning.ts` + `pre-call-briefing.ts`: `notes_interview` is now the primary knowledge layer; recent interactions (last 5, ordered by date desc) are the fresher-data override layer; structured `candidate_motivations` / `candidate_blockers` tables are additive but no longer load-bearing
- `seed-mock-data.sql`: removed pre-seeded `candidate_motivations` and `candidate_blockers` rows; rich `notes_interview` added to Tanaka record in recruiter voice; going forward, mock data uses notes/documents as source of truth (no direct DB seeding of structured intelligence)
- `api/ai/rejection-email.ts`: new endpoint — reads `notes_interview` + `ccm_feedback_notes`, generates warm brief candidate rejection email
- `candidates.$id` IntelligencePanel: `SituationBanner` at top of every process panel — stage + `ccm_outcome` aware; shows opinionated one-line brief and contextual action buttons:
  - Specs Sent → prompt to get buy-in
  - CV Sent → amber, flags days since submission
  - CCM pending → blue, chase client for feedback
  - CCM pass → green banner + one-click interview prep for next round
  - CCM fail → red banner + rejection email button + close process button

**Phase 1 day-in-the-life audit — dashboard fixes (committed 2026-06-19)**
- `dashboard`: icon action strip — replaced native `title` attributes with custom inline hover tooltips (dark pill, white text, arrow pointer); unique `briefKey` per `action_type` so competing risk and CCM feedback items never share the same brief panel
- `dashboard`: priority Rule 3 (CCM feedback pending) — removed `daysSinceTouch > 2` guard; CCM with no `ccm_feedback_at` now always surfaces regardless of last touch date
- `dashboard`: done/snooze handlers now show a sonner toast with 6s Undo button; `handleRestore()` clears all localStorage and restores full list; "Restore N dismissed" link appears in empty state
- `dashboard`: only one brief open at a time; clicking sparkle on a new item closes any existing brief first
- `dashboard`: two-column layout — priority list left (~42%), AI brief panel right (~58%); active item highlights indigo; no more scrolling down to read brief
- `dashboard/BriefContent`: inline markdown renderer (bold + bullets, no library); click-to-edit textarea toggle; "Edit" button affordance
- `api/ai/competing-brief.ts`: new endpoint — candidate-specific positioning vs competing processes; reads motivations, interview notes, recent activity; output framed as call to candidate
- `api/ai/ccm-feedback-brief.ts`: new endpoint — framed as client-chase call (not candidate call); includes candidate strengths as reminder points, competing urgency, primary contact context
- `api/ai/ccm-next-step.ts`: new endpoint — three outcome scenarios after CCM feedback chase: pass (candidate call brief + reinforce + next CCM prep), reject (soft rejection script + email draft), no_response (candidate warm email + client nudge line)
- All AI endpoints: updated from ALL CAPS rigid sections to Claude-style formatting (`**bold headers**`, `•` bullets, natural prose)
- `dashboard`: `competing_interviews` query filtered to `is_active = true`

**Module 3 + 4 + 5 simulation feedback (committed 2026-06-19)**
- `candidates.$id` useStageChange: two-condition CCM advance guard — requires `ccm_outcome="pass"` AND a future `ccm{n+1}` interaction logged; clears `ccm_outcome/feedback_notes/feedback_at` on advance so new round starts clean
- `parsePositioningPoints`: strips bare `json\n` prefix (no backticks) that model occasionally emits
- `LogActivityModal`: "Call" split into "Candidate Call" / "Client Call" virtual UI types; both persist as `interaction_type="call"` with correct `primary_party`; old "call" rows still display correctly via `interactionTypeLabel`
- `dashboard.tsx`: replaced AI-generated daily agenda with rule-based `usePriorityActions` hook (6 priority rules applied directly via Supabase query); removed separate Competing Interviews section — folds into unified priority stream; added inline AI pre-call briefing per item via `/api/ai/pre-call-briefing`
- `src/styles.css`: excluded `input[type="checkbox"]`, `[type="radio"]`, `[type="range"]` from global `input { width: 100% }` rule — was causing advanced search candidate rows to render with 0px name column (checkbox expanded to fill entire flex row)

**Phase 1 day-in-the-life — 6 structural gaps fixed (committed 2026-06-19)**
- Gap 1 — Strategy notes feed-forward: "Add to strategy notes" link on client timeline entries for past client-perspective interactions; clicking triggers `POST /api/ai/update-client-strategy` which synthesizes meeting notes into a living client brief (consolidation prompt if notes exist, initial brief if not); inline editable preview panel on Client Info tab with Save/Discard
- Gap 2 — Job recruiter notes: `recruiter_notes text` column added to `requisitions` (migration 025); inline textarea in `JobDetailPanel` saves on blur via Supabase update
- Gap 3 — Persistent spec shortlist: `requisition_id uuid` FK added to `candidate_lists` (migration 026); AI match results (`JobMatchPanel`) show "Call first" vermillion badge on top 2 candidates + "Save as spec list" button; `SpecListPanel` renders saved spec list candidates with per-candidate "Draft spec message" and "Who to call first?" AI ranking via `/api/ai/call-priority`
- Gap 4 — Buy-in list per req: `JobDetailPanel` derives `buyInProcesses` from loaded pipeline data (no extra query); checkboxes per candidate + "Prepare CV send (N)" button; inline CV send draft panel with editable subject/body, copy, and regenerate via `/api/ai/batch-cv-send`
- Gap 5 — Call priority + batch CV send: `/api/ai/call-priority` ranks candidates by `"call"` vs `"email"` with one-line reason; `/api/ai/batch-cv-send` generates multi-candidate introduction email in flowing prose (no bullets); both endpoints read candidate pitch/personality notes and requisition context; never read `notes_internal` or `notes_presentation`
- Gap 6 — Pipeline UX: `PipelineProgressStrip` (6 nodes: Specs Sent · Buy-In · CV Sent · Interview · Offer · Placed) renders at top of every process panel; `stageMilestoneToast()` fires stage-specific coaching text (Buy-In through Placed, with 6s/10s hold for Offer/Placed); spring-physics `.stage-advance` CSS animation on active node when stage advances; `@keyframes stageAdvance` in `src/styles.css`

**Recall.ai call auto-logging — Feature 2 of workflow sprint (committed 2026-06-21)**
- `supabase/migrations/030_recall_bot_sessions.sql`: new table — `id`, `bot_id`, `candidate_id`, `recruiter_id`, `team_id`, `meeting_url`, `status` (invited/in_progress/done/failed), `created_at`; team-scoped RLS
- `api/ai/invite-recall-bot.ts`: creates a Recall.ai bot for a given meeting URL; requires `RECALL_API_KEY` + `APP_URL` in `.env`; stores session in `recall_bot_sessions`
- `api/webhooks/recall.ts`: receives Recall.ai transcript webhooks; maps `bot.joining_call` → `in_progress`, fatal errors → `failed`, `bot.transcription_complete` → formats via Claude haiku + inserts into `interactions` as `interaction_type="note"` + marks session `done`
- `candidates.$id` Timeline tab: "Invite note-taker" button opens `InviteRecallBotDialog` (meeting URL input); `ActiveBotBanner` shows indigo status strip when a session is `invited` or `in_progress`; "Paste transcript" stays as manual fallback
- Note: run `supabase gen types` after migration 030 is applied to remove the `@ts-expect-error` on the `recall_bot_sessions` query

**i18n — full EN/JP toggle (committed 2026-06-21)**
- `react-i18next` + `i18next` wired into `src/main.tsx`; language stored in localStorage
- `src/i18n.ts` singleton; `src/locales/en.json` + `src/locales/ja.json` for all UI strings
- `LanguageToggle` component in authenticated layout header
- All routes translated: dashboard priority rules + brief panel, candidate filters/count/add form, client pages, jobs pages, advanced search
- `ActivityTimeline`: chip strings, empty states, "Add to strategy notes" all via `t()`; auto-translates interaction notes to JP on language switch via `/api/ai/translate`; resets to original on switch back
- `LogActivityModal`: `interactionTypeLabel` uses `i18n` singleton for all type labels
- New `/api/ai/translate` endpoint for on-demand text translation (Claude-backed)
- `ja.json` terminology: 現状況 (status), 情報提供元 (source), 直近の連絡先 (last touch)

**Feature 1 — Email send from AI drafts — Gmail + Outlook OAuth (committed 2026-06-21)**
- Migration 029: `recruiter_oauth_tokens` table — `(recruiter_id, provider)` unique; AES-256-CBC encrypted refresh token; team-scoped RLS
- `api/oauth/gmail-connect.ts` — returns Google OAuth2 URL (client secret stays server-side)
- `api/oauth/gmail-exchange.ts` — exchanges auth code for tokens, fetches connected email via userinfo, stores encrypted refresh token; also exports `encryptToken` / `decryptToken` used by outlook-exchange and send-email
- `api/oauth/outlook-connect.ts` + `outlook-exchange.ts` — Microsoft Graph OAuth equivalent
- `api/oauth/status.ts` — returns `{ gmail: { email } | null, outlook: { email } | null }` for a recruiter
- `api/oauth/disconnect.ts` — deletes token row
- `api/send-email.ts` — refreshes access token, sends via Gmail API or Microsoft Graph; auto-logs `interaction_type="email"` to interactions with full body as `full_notes`
- `src/components/shared/SendEmailDialog.tsx` — reusable dialog with editable To/Subject; body read-only (edit draft first); shows "Connect Gmail or Outlook in Settings" toast on missing provider
- `/settings` route — connect/disconnect Gmail + Outlook; handles OAuth callback code via URL search params; shows connected account email
- Settings added to sidebar nav (IconSettings)
- `SubmissionPackagePanel`: Send button alongside Copy on submission email section; accepts `candidateId` + `clientId` props for interaction logging
- Send buttons on: rejection email, spec email, job spec messages (JobMatchPanel + SpecListPanel), batch CV send (JobDetailPanel)
- Locales: `nav.settings`, `common.send`, `common.sendEmail` added to EN + JA

**Setup required before Send works:**
1. Google Cloud Console: create OAuth app, enable Gmail API, set redirect URI to `{base}/settings`, add `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` to `.env`
2. Azure: register app, add Mail.Send + User.Read scopes, set redirect URI, add `OUTLOOK_CLIENT_ID` + `OUTLOOK_CLIENT_SECRET` to `.env`
3. Optional: `OAUTH_REDIRECT_BASE` (default: `http://localhost:5173`) and `OAUTH_ENCRYPTION_KEY` (32-char string; falls back to dev key if unset)
4. Apply migration 029 to Supabase: `supabase db push`

---

### Roadmap — next up (workflow sprint)

Four features to match Spott's table-stakes + add Kanri's intelligence layer on top. Each is a separate session.

#### Feature 1: Email send from AI drafts (Gmail + Outlook OAuth)
Kanri already writes the emails. This makes them sendable.
- Gmail OAuth (Google OAuth2) + Outlook OAuth (Microsoft Graph) — recruiter connects mailbox once in Settings
- `recruiter_oauth_tokens` table (migration 029) — stores encrypted refresh tokens per recruiter
- `api/send-email.ts` — sends via Gmail API or Microsoft Graph using stored token
- "Send" button added alongside "Copy" on all AI draft components (pre-call brief, rejection email, batch CV send, submission note, job spec message)
- Sent emails auto-log to `interactions` table as `interaction_type: "email"` with full body as `full_notes`
- Settings page (`/settings`) — connect/disconnect Gmail and Outlook

#### Feature 2: Call auto-logging via Recall.ai ✓ DONE (2026-06-21)
See session log above.

#### Feature 3a + 3b: Outreach sequences — removed, not needed

#### Feature 4: Auto-enrichment (Apollo.io + Hunter.io)
- Apollo.io API (primary, best Japan coverage) + Hunter.io (fallback)
- `api/ai/enrich-contact.ts` — given name + company, returns email + phone via waterfall
- "Enrich" button on candidate Registration tab and client Contacts card
- Auto-triggers on new candidate creation if email is missing
- Results shown as suggestions (same pattern as ExtractionReviewModal) — recruiter confirms before saving

---

### Roadmap — seed data (after workflow sprint)

#### Phase 2: Seed data
Generate realistic demo data via Supabase SQL seed scripts:
- ~20 clients (mix of gaishikei, domestic, PE-backed)
- ~150 candidates (varied stages, Japanese/English names, real-feeling notes_pitch + notes_interview)
- Processes at every stage — Specs Sent through Placed and Closed Lost
- Activity timelines with realistic entry patterns (2–8 interactions per active process)
- 3–5 candidates with competing interviews
- 2–3 at Offer stage
- Some cold (last touch >30 days)

Key rule: no pre-seeded AI snapshots (`ai_snapshot` = null for all seed candidates). Intelligence is generated on demand from notes. This validates the real pipeline.

#### Phase 3: Demo readiness
- Run through the ROI calculator (`kanri-roi-calculator.html` on Desktop) — verify numbers feel right for a 5-person boutique
- Test advanced search with seed data (AI search needs real requisitions + candidates)
- Walk through a mock client pitch using the app as the live demo

#### Phase 4: Outlook integration (future — not yet)
Significant engineering: OAuth, Microsoft Graph API, email polling/webhooks, thread parsing, deduplication, activity auto-logging. Hold until at least one real user is asking for it.

---

### Known issues / deferred

- Per-contact AI summary (needs design decision on where/how AI reads contact notes)
- Interaction editing (assess scope before starting)
- PDF export for ROI calculator (low priority — standalone HTML file is the demo path)

---

# Kanri — Design System Contract

This section governs all UI work in this codebase. It takes precedence over
any Tailwind defaults, component library defaults, or prior patterns in the
codebase. When generating or modifying any component, layout, or style, follow
these rules exactly.

---

## Identity

Kanri is a recruiter OS built for boutique agency recruiters in the Japan
market. The aesthetic is editorial-Japanese: structured, typographic, precise.
It must never read as generic SaaS, and must never resemble Claude's default
output style.

---

## Fonts — REQUIRED

Three fonts. No others.

| Role        | Font                | Usage                                      |
|-------------|---------------------|--------------------------------------------|
| Display     | Shippori Mincho     | All h1–h4, wordmark, stat numbers, names   |
| Body        | Plus Jakarta Sans   | All body copy, labels, buttons, inputs     |
| Mono        | DM Mono             | IDs, metadata, badges, code, timestamps    |

**Never use**: Inter, Roboto, Space Grotesk, system-ui, Arial, or any font
not in this table.

Tailwind class mapping:
- `font-display` → Shippori Mincho
- `font-sans` → Plus Jakarta Sans
- `font-mono` → DM Mono

---

## Color — REQUIRED

All colors come from CSS custom properties defined in `src/styles.css`.

### Palette

| Token                      | Hex       | Usage                                      |
|----------------------------|-----------|--------------------------------------------|
| `--color-ink`              | #1a1814   | Primary text, primary buttons, borders     |
| `--color-ink-60`           | #6b6760   | Secondary text, placeholders               |
| `--color-ink-30`           | #b8b5b0   | Muted text, mono labels                    |
| `--color-ink-15`           | #d9d7d3   | Default borders                            |
| `--color-ink-10`           | #f2f0ec   | Sunken backgrounds, table stripes          |
| `--color-ink-05`           | #f8f7f5   | Page background                            |
| `--color-white`            | #fdfcfa   | Card/surface background                    |
| `--color-vermillion`       | #c94f2a   | Primary CTA, accent stripes, focus borders |
| `--color-vermillion-light` | #f0e0d8   | Badge backgrounds (warm/interview)         |
| `--color-indigo`           | #2c3e6b   | Links, info states                         |
| `--color-indigo-light`     | #d8dde8   | Info badge backgrounds                     |
| `--color-moss`             | #4a5e3a   | Success, placed, completed states          |
| `--color-moss-light`       | #dce4d5   | Success badge backgrounds                  |
| `--color-gold`             | #b8922a   | Offers, warm/pending pipeline stages       |
| `--color-gold-light`       | #f0e8d0   | Pending badge backgrounds                  |

### FORBIDDEN colors
- **Purple / violet** — never. No `#7c3aed`, no Tailwind `purple-*` or `violet-*`.
- **Blue as primary** — blue (`--color-indigo`) is for links and info only.
- **Arbitrary hex values** — use only the tokens above.
- **Gradients** — no gradient backgrounds on any UI element, ever.

---

## Shape & Radius — CRITICAL

**Border radius is 0 everywhere except avatar/initials circles.**

- All buttons: `border-radius: 0`
- All cards: `border-radius: 0`
- All inputs: `border-radius: 0`
- All badges/chips: `border-radius: 0`
- All modals/drawers: `border-radius: 0`
- Avatar circles only: `border-radius: 9999px`

**Never use**: `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`,
`rounded-3xl`. These are forbidden Tailwind classes in this codebase.

---

## Shadows — NONE

No box shadows anywhere. No `shadow-sm`, `shadow-md`, `shadow-lg`, or any
Tailwind shadow class. No `drop-shadow`. Card elevation is communicated through
borders, not shadows.

---

## Component Patterns

### Buttons
Use the `.btn` base class plus a variant class. Always square corners.

```tsx
// Primary (dark fill)
<button className="btn btn-primary">Add Candidate</button>

// Accent (vermillion — main CTA)
<button className="btn btn-accent">Submit to Client</button>

// Outline
<button className="btn btn-outline">Export</button>

// Ghost (low emphasis)
<button className="btn btn-ghost">Archive</button>

// Small variant
<button className="btn btn-primary btn-sm">Save</button>
```

### Cards
```tsx
// Default card
<div className="card">...</div>

// With accent stripe (vermillion — active/primary)
<div className="card card-accent">...</div>

// With gold stripe (offer/pending)
<div className="card card-accent-gold">...</div>

// With moss stripe (placed/complete)
<div className="card card-accent-moss">...</div>
```

### Badges
```tsx
<span className="badge badge-active">Active</span>      // moss
<span className="badge badge-warm">Interview</span>     // vermillion
<span className="badge badge-pending">Offer Out</span>  // gold
<span className="badge badge-cold">On Hold</span>       // gray
<span className="badge badge-info">New</span>           // indigo
```

### Mono labels (section headers, metadata)
```tsx
<p className="label">Last contacted · 3 days ago</p>
// Renders as: DM Mono, 10px, uppercase, tracked, ink-30
```

### Stat cells
```tsx
<div className="stat-grid grid-cols-4">
  <div className="stat-cell">
    <div className="stat-value">42</div>
    <div className="stat-label">Active</div>
  </div>
</div>
```

### Inputs
Inputs are flat with underline-only active state. The base styles in
`src/styles.css` handle this — do not override with rounded or shadowed styles.

```tsx
<div>
  <label className="label block mb-1">Candidate Name</label>
  <input type="text" placeholder="Full name / 氏名" />
</div>
```

### Candidate name display
When showing Japanese names, always format as:
`田中 雅彦 / Masahiko Tanaka` — Japanese first, Latin second, separated by ` / `.

---

## Typography Rules

- **h1–h4**: always `font-display` (Shippori Mincho)
- **Body text**: always `font-sans` (Plus Jakarta Sans)
- **Metadata, IDs, timestamps, badges, section labels**: always `font-mono` (DM Mono)
- Section labels: mono, 10px, uppercase, letter-spacing 0.12em, `--color-ink-30`
- Stat numbers: `font-display`, 26px+, weight 700
- **Never bold body copy** — use weight 500 maximum for emphasis in body text

---

## Layout Principles

- Page background: `--color-ink-05` (warm off-white)
- Card/surface background: `--color-white`
- Cards sit on page bg — the contrast is subtle and intentional
- No centered hero layouts — content is left-aligned and structured
- Sidebar navigation when needed: left, 240px, `--color-white` bg, `--color-ink-15` right border
- Dividers: `1px solid --color-ink-15` (light) or `2px solid --color-ink` (heavy/section break)
- Metric strips: grid with `1px` gaps and `--color-ink-15` background (creates grid line effect)

---

## What "Claude default" looks like — AVOID ALL OF THIS

| Pattern                         | Why it's wrong              | Use instead                    |
|---------------------------------|-----------------------------|--------------------------------|
| Purple/violet primary color     | Generic AI SaaS             | Vermillion (#c94f2a)           |
| `rounded-lg` or `rounded-xl`   | Soft/generic feel           | `rounded-none` / no radius     |
| `shadow-md` on cards            | Floaty, not editorial       | `border border-ink-15`         |
| Inter or Space Grotesk          | Overused in AI products     | Plus Jakarta Sans + Shippori   |
| Blue as primary CTA             | Default SaaS palette        | Vermillion for CTA             |
| Gray background (`bg-gray-*`)   | Tailwind default             | `bg-[--color-ink-05]`          |
| Gradient buttons                | Web 2.0 / AI-generated      | Flat fill only                 |
| `text-purple-*` anything        | Forbidden                   | (no equivalent — don't use)    |

---

## Migration Checklist

When migrating an existing component to this design system, check each item:

- [ ] Font replaced: heading → `font-display`, body → `font-sans`, meta → `font-mono`
- [ ] All `rounded-*` classes removed (except avatar circles)
- [ ] All `shadow-*` classes removed
- [ ] All purple/violet colors replaced
- [ ] All `bg-gray-*` replaced with ink token equivalents
- [ ] Buttons use `.btn` component classes
- [ ] Badges use `.badge` component classes
- [ ] No inline hex colors — all colors via CSS custom properties
- [ ] Japanese names formatted correctly where applicable
