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
| Email sending from Kanri (Gmail/Outlook) | Deferred — AI drafts are copy/paste only |
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
Kanri is the long-term vision. Active development is paused as of May 2026.
The MVP pivot is a standalone product called CVFlow (separate repository).
CVFlow's submission report capability will be integrated into Kanri in a future phase.
Do not add new features to Kanri until CVFlow has validated core AI output quality.
