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
- A recruiter intelligence layer and daily execution command center, built to become the system of record
- A relationship memory and context reconstruction engine
- A daily execution command center that tells recruiters what to do and in what order
- A team visibility layer so recruiters can see what teammates are doing without switching tools
- The goal is to displace incumbent ATS/CRM systems (Vincere, Bullhorn, etc.), not sit on top of them indefinitely

**The core thesis:** Recruiters lose hours every day to cognitive overhead — rebuilding context before every call, manually piecing together pipeline status, and making prioritization decisions with incomplete information. Kanri eliminates that tax. Doing that well requires being the place recruiters actually log activity and manage pipeline, not a second dashboard synced to another system of record.

**The product promise:** A recruiter opens Kanri and within 30 seconds knows exactly what requires their attention today, what to say in their next conversation, and what their team has been doing.

**The positioning sentence:** ChatGPT gives answers. Kanri manages recruiting state.

**The MVP positioning:** Kanri is a recruiter intelligence layer and AI operating system that earns the right to become a firm's system of record by proving operational clarity fast. A pilot customer may keep their existing ATS running during evaluation, but Kanri is not designed as permanent parallel infrastructure — asking a recruiter to log activity in two places is a temporary onboarding cost, not the target end state. The MVP must prove value quickly enough that displacing the incumbent ATS is an easy decision, not a leap of faith.

**Why not "sit on top" long-term:** Early framing described Kanri as a layer above existing ATS systems, with ATS integration deferred post-pilot. In practice, the dashboard, pipeline stage, and activity timeline already function as the actual source of truth for what a recruiter does day-to-day — Vincere/Bullhorn become a stale system nobody updates once Kanri is faster to use. A permanent "sits on top" architecture also implies building and maintaining sync with every customer's ATS indefinitely, which is a harder, more open-ended engineering burden than being the system of record directly. Displacement is the honest end state; the augment framing was an onboarding strategy, not the product's identity.

**Displacement is settled. Do not reopen it.** This decision was re-examined in the August 2026 strategy review and reaffirmed. Three reasons, in order of weight:

1. **Firms do not want to buy several systems.** A boutique with four consultants will not pay for an ATS, a sourcing tool, a note-taker, and an intelligence layer. All of Kanri's value has to be reachable in one place, or the buyer picks the one product that does the most and Kanri is the thing that gets cut.
2. **A companion product loses to whoever consolidates.** Every "layer on top" eventually competes with the platform it sits on, from a weaker position, because the platform owns the data and the login.
3. **Permanent sync is an unbounded liability.** Building and maintaining bidirectional integration with every customer's ATS is more engineering, forever, than being the system of record once.

The competitive read supports this. Sourcing-first platforms (Headhunt.AI and similar) deliberately stop at first reply and hand off to an ATS. That leaves the entire span from buy-in through placement — where agency money is actually made and where Kanri's data model already lives — owned by nobody. Kanri takes that span, and then takes the record.

A pilot customer may run their old ATS in parallel during evaluation. That is an onboarding accommodation with an end date, not an architecture. Build one-time import; never build ongoing two-way sync.

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

**Test for "recruiter judgment only":** a field is recruiter-judgment-only if either (a) a wrong value would embarrass the recruiter in front of a client or candidate, or (b) it records an observation only a human present in the room could have made. When unsure, treat the field as recruiter-judgment-only and flag it.

**The editability rule is a trust doctrine, not a UI preference.** Recruiters adopt AI output they can audit and correct, and abandon output they cannot. If a feature makes inline editing awkward, redesign the feature — do not drop the editing. Any exception requires an explicit decision recorded in this file.

### Architecture Rules

These five exist because the codebase has drifted away from them before. They govern how AI capability gets added, not just what it says.

- **The Memory Doctrine.** Every candidate, client, and requisition has exactly one reconciled context (`ai_context`), written by `refresh-context`. Handlers read that context. Handlers do **not** re-derive context by querying raw rows. Memory refreshes as a consequence of activity, never as something a recruiter has to remember to press.
- **No new one-shot AI endpoints.** A new recruiter question is answered by extending the context layer or the agent tool set, not by adding another handler with another button. Adding a handler is always the locally easiest move and is why there are now 41 of them. Adding number 42 requires a written justification in the session log.
- **Outcome capture is mandatory.** Every terminal process state records a structured reason. Every AI recommendation records whether the recruiter followed it. This data cannot be backfilled — a month not captured is a month permanently lost. Never ship a flow that closes a process without recording why.
- **Explainability is not optional.** Every AI surface must be able to name the records it read. No exceptions, including for outputs that look obvious. This is both the top recruiter trust barrier and a Japanese regulatory requirement (see Section 10).
- **Prefer Postgres.** Kanri does not add a datastore, a queue service, a search service, or a model server while Postgres can do the job. `pgvector`, `pgroonga`, `pgmq`, `pg_net`, and `pg_cron` (see Section 19) replace what a vector database, a search service, and a job queue service would otherwise be. Every alternative was evaluated and rejected on evidence, not aesthetics — see `docs/kanri-substrate-audit.html`. Write this down so the evaluation does not get repeated by every agent that discovers Qdrant.

### Security Rules
- `ANTHROPIC_API_KEY` — server-side only. Never in any `VITE_` variable. Never imported in `src/`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only. Same rule
- All AI calls go through `api/ai/*.ts` serverless functions. Never call the Anthropic API from the browser
- RLS enforces team-scoped access — every table includes both `recruiter_id` (owner) and `team_id` (org)
- **Never generate SQL from user or model text.** Retrieval goes through typed functions (e.g. `match_candidates_hybrid`, Section 19), not model-authored queries. This is both an accuracy argument (text-to-SQL collapses on realistic schemas — GPT-4o scores 86.6% on Spider 1.0 but 10.1% on Spider 2.0, which uses enterprise-shaped schemas) and an injection argument, and it applies directly to any future "Ask Kanri" agentic surface (Wave 6).
- A queue worker or scheduled job invoked from Postgres (`pg_cron`/`pg_net`) runs outside a user session and outside RLS if it uses the service-role key. It must filter `team_id` explicitly in the query or function itself — RLS provides no protection there. This is the most likely place for a cross-team data leak to be introduced.

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
VOYAGE_API_KEY=...             # server-side only — candidate profile embeddings (Wave 2). Optional: unset, retrieval degrades to full-text search only
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
- The dashboard **priority queue** surfaces actions for the logged-in recruiter only — never the whole team's queue. That queue is a personal to-do list and stays personal.
- Team activity is a **separate surface** from the priority queue. A recruiter should be able to see what teammates logged without those items entering their own action list. This is not yet built; it is the main unshipped piece of the multi-user promise.
- Teammates' activity appears in timelines with a clear "logged by [name]" attribution

**Note for agents:** these two rules used to read as a contradiction — "the primary value is seeing teammate activity" against "the dashboard is scoped to the logged-in recruiter only." They are not in conflict. Personal queue and team feed are different surfaces. Do not resolve the tension by mixing teammate items into the priority list.

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

Handler logic lives in `lib/`, **not** in `api/`. The files under `api/` are thin Vercel entry points that dispatch into `lib/` — this keeps Vercel's serverless function count down. `api/ai.ts` routes `?type=<name>` to one of 39 handlers in `lib/ai-handlers/`.

```
src/
  routes/           # TanStack Router file-based routes
    _authenticated/ # Guarded app routes
    addin/          # Outlook add-in task pane
  components/
    ui/             # shadcn/ui primitives — never modify directly
    shared/         # Reusable domain-aware components (Card, StageBadge, ActivityTimeline…)
    candidate/      # Candidate-specific components
  lib/
    candidate-utils.ts   # All candidate domain utility functions
    auth-context.tsx     # Auth provider
    pdf-utils.ts
  hooks/            # Custom React hooks — one concern per hook. CURRENTLY EMPTY (see §15)
  integrations/
    supabase/
      client.ts     # Supabase client (browser)
      types.ts      # Generated types + custom app types appended below
  locales/          # en.json / ja.json
  i18n.ts
  styles.css        # Design tokens as CSS custom properties
lib/                # ← all server-side handler logic
  ai-handlers/      # 39 AI handlers
  oauth-handlers/   # Gmail + Microsoft Graph connect/exchange/status/disconnect
  import-handlers/  # CSV import: suggest-mapping, commit, rollback, history
  addin-handlers/   # Outlook add-in: match-sender, log-email
  webhook-handlers/ # Recall.ai transcript webhook
api/                # thin Vercel entry points only
  ai.ts             # dispatch table → lib/ai-handlers
  ai/               # 2 standalone handlers (polish-notes, translate-interaction)
  oauth.ts  import.ts  addin.ts  webhooks.ts  send-email.ts  extract-text.ts
supabase/
  migrations/       # Sequential SQL migration files
scripts/
  dev-api.ts        # Local dev API server
tests/
  ai-handlers-structure.test.ts   # npm test — see §18
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
// 5. Call Claude: model claude-sonnet-5 (or claude-haiku-4-5-20251001 for simple extraction/classification), max_tokens: 1024
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

Reasoning-heavy handlers (positioning, briefings, submission notes, advanced search, etc.) use: **`claude-sonnet-5`**

Simple extraction/classification/translation handlers use: **`claude-haiku-4-5-20251001`** — cheaper and sufficient for these tasks. Don't reach for Sonnet where Haiku already does the job.

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

### What Kanri Automates vs What Stays Human

The product thesis is that AI removes the work *between* the recruiter's judgment and the outcome. It does not move into the judgment. This table is the operational version of that sentence. If a proposed feature belongs in the right column, do not build it.

| Kanri automates | Stays human, permanently |
|---|---|
| Capturing what was said (calls, email, meetings) | Deciding whether to take a brief |
| Retrieving what is already known | Judging whether a candidate is telling the truth about why they are leaving |
| Reconciling contradictory facts across time | Choosing which of two good candidates to push |
| Drafting messages, notes, and documents | Reading the room on a counteroffer |
| Preparing the recruiter before a conversation | Deciding what a client is actually willing to hear |
| Reminding, sequencing, and prioritising work | Delivering bad news |
| Detecting patterns across outcomes | Setting expectations with a candidate about their market value |
| Flagging risk and surfacing opportunity | Every final decision, without exception |

Two consequences. **Never auto-send anything** — no email, no message, no scheduling on the recruiter's behalf. And **never present AI output as a conclusion**; it is a draft the recruiter edits, approves, and owns.

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
- Market size: the domestic white-collar agency market was ¥449B in FY2024, up 12% year on year, across roughly 30,561 agencies of which about 70% have ten or fewer staff. That last figure is the ICP — approximately 21,000 firms shaped like Torch.
- Candidates earning ¥7M+ now register with several agencies at once. Speed and exclusivity decide outcomes, which is why `competing_interviews` is a clock and not just a risk badge.

### Postgres full-text search does not work on Japanese

PostgreSQL's built-in full-text search (`to_tsvector`) tokenizes on whitespace and has no Japanese configuration. Japanese does not use spaces between words, so running native Postgres FTS over 職務経歴書 text or Japanese interview notes produces roughly one giant token per sentence — the index builds, the query runs, and the results are silently useless. **`pgroonga` is the answer** (Section 19) — it uses variable-length N-gram indexing and handles Japanese, English, and mixed text in one index. This is the single most important fact for any full-text search work on candidate or client data. Do not reach for `tsvector`/GIN on any column that might contain Japanese.
- Offer decline (内定辞退) runs roughly 15–20% at large firms and above 30% at SMEs. The most-cited cause is a gap between what was described and what the actual conditions turn out to be.
- Early turnover inside 3–6 months triggers refund obligations. `placement_guarantee_until` exists for this reason.

### How Japanese Boutiques Actually Operate

Two operating models, and Kanri's customer is the first one:

- **両手型 (ryōte-gata, dual desk)** — one consultant owns both the client and the candidate side. Standard at boutiques and at industry-specialist firms. Information does not fragment, but the model's named failure mode is **属人化 (zokujinka)**: knowledge trapped in one person's head, so the business stops when they are out, overloaded, or leave.
- **片手型 (katate-gata, RA/CA split)** — separate client-facing (RA) and candidate-facing (CA) consultants. Standard at large firms. Enables volume; fails on handoffs and duplicate candidate approaches.

**Why this matters to the product:** 属人化 is the defining operational problem of Kanri's exact target market, and Kanri's reconciled memory layer is the direct answer to it. Say so. The stated tool requirement for 両手型 firms is single-screen visibility across jobs, candidates, matches, and revenue. Cross-client submission visibility (which client has already seen this candidate) is treated as critical infrastructure by both models.

Japanese agencies adopting AI report 1.3–1.8× expansion in per-consultant interview capacity. The three tasks named as the highest-value AI targets are: resume screening, 面談議事録 (interview minutes), and **推薦文作成 (recommendation-letter writing)**.

### Japan-Specific Documents

These are real artifacts with conventional forms. Getting them wrong reads as a foreign product with a Japanese menu.

- **推薦文 (suisenbun)** — a formal recommendation letter written by the consultant and submitted with the candidate's 履歴書 and 職務経歴書 at document-screening stage. Conventional five-part structure: opening greeting acknowledging the relationship → candidate basics (name, age, status, desired start, salary expectation) → character, skills, and achievements with concrete numbers → reason for changing jobs → forward-looking close. Written in keigo. PREP-structured. Specific numbers beat adjectives; overstatement that the candidate cannot live up to in interview is the classic failure. This is **not** the same artifact as `submission-note`, which produces an English client email.
- **職務経歴書 (shokumu keirekisho)** — the Japanese career-history document. Agencies routinely reformat and correct (添削) a candidate's version before submission. Standard format, not a free-form CV.
- **Register matters at generation time, not translation time.** 敬語 (keigo) / 丁寧語 / casual are different documents, not different translations. Generic models trained mostly on English get keigo conjugation wrong. Choose register when generating; do not generate in English and translate after.

### Regulatory Posture (APPI + 職業安定法)

Two laws govern this. Both point the same direction, and Kanri's existing human-in-the-loop design already complies. State it explicitly in the product, because in Japan it is a sales asset and not just a constraint.

- **職業安定法 Art. 5-4** — using AI output directly as a hiring decision is a legal exposure. The operating rule Japanese counsel gives is: **AI produces drafts, humans make decisions.** This is exactly Section 8's table.
- **APPI (個人情報保護法)** — the 2026 amendment was promulgated 17 July 2026. It loosens consent for some AI-training uses while sharply tightening enforcement, introducing a surcharge regime for serious violations affecting more than 1,000 individuals.
- **Practical consequence:** import and process candidate data the customer already lawfully holds. Do **not** build scraping or unlicensed candidate-data accumulation. Operators holding large Japanese candidate databases do so under a registered provider licence (第4号特定募集情報等提供事業者); Kanri is not that and should not act like it.

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
Open roles. One requisition is always exactly one seat — a backfill is a new requisition row, never the old one reopened, even for the same title/JD at the same client (confirmed with the user 2026-08-23, not assumed). `title`, `client_id`, `salary_min`, `salary_max`, `salary_stretch`, `salary_range_text` (free-text comp description), `location`, `urgency_date` (target close date), `is_open`, `is_backfill`, `backfill_of_requisition_id` (nullable FK to `requisitions`, set from the "Add job" form when `is_backfill` is checked — migration 049), `hiring_manager_id` (FK to client_contacts), `strategic_context`, `recruiter_notes`, `owner_recruiter_id`, `team_id`.

`is_open` is set to `false` automatically the moment a process on this requisition reaches `Placed` (`useStageChange` in `candidates.$id.tsx`) — a filled role stops appearing in "add to process" pickers and the Jobs open-roles count without anyone remembering to close it. `is_backfill`/`backfill_of_requisition_id` are purely structural today (a link plus a badge); nothing reads them for matching or context yet, and pre-filling a new backfill's JD/salary/conditions from the role it replaces was deliberately not built — those can genuinely differ, so a backfill should start from a clean form.

Intake intelligence (captured at job intake, read by matching and prep handlers): `jd_text`, `jd_url`, `why_role_opened`, `ideal_candidate_notes`, `industry_must_haves`, `japanese_level_required`, `english_level_required`, `age_min`, `age_max`, `open_to_foreign_candidates`, `internal_candidate`, `other_agencies`, `other_agency_names`, `flexibility_notes`, `target_start_date`, `urgency`.

Hiring manager intelligence (recruiter observation about how this HM behaves): `hm_communication_style`, `hm_priority_beyond_jd`, `hm_rejection_patterns`, `hm_can_meet_in_person`.

Interview process: `interview_rounds`, `interview_steps`, `interview_structure` (JSON), `interview_notes`, `has_skills_test`, `skills_test_notes`.

Memory: `ai_context`, `ai_context_updated_at` — see Memory & Intelligence Tables below.

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

Also on `interactions`: `requisition_id` (nullable — links activity to a specific job), `process_id` (nullable), `direction` (inbound/outbound), `is_future` + `scheduled_at` (upcoming events render above the past feed), `transcript_raw`, `full_notes_translated` + `translated_lang` (cached JP/EN translation), `triggers_context_refresh` (marks an interaction as significant enough to rebuild entity memory).

Always display "logged by [recruiter name]" on teammate interactions in timelines.
Cross-linking: an interaction can link to both a `candidate_id` and a `client_id` — it will appear on both timelines. Use `contact_id` to link to a specific client contact, and `primary_party` to designate who you spoke with.

### Memory & Intelligence Tables

These are the product's core asset and were previously undocumented. Read the Memory Doctrine in Section 2 before touching any of them.

**`ai_context` columns** — present on `candidates`, `clients`, and `requisitions`, each paired with `ai_context_updated_at`. Holds one reconciled narrative of everything currently known about that entity, written by the `refresh-context` handler.

How `refresh-context` builds it: fetch the entity plus its last 30 interactions, bucket each interaction by age as `CURRENT` (≤30 days) / `RECENT` (≤90 days) / `BACKGROUND` (older), then ask Claude to write a senior recruiter's reference note where recent facts override older ones and **contradictions are stated explicitly** — "salary expectation updated to ¥16M (was ¥14M at registration)."

That reconciliation is the differentiator. Competitors store transcripts and summarise them; Kanri stores resolved current state plus the correction history. Do not "simplify" this into a summary.

**`ai_context_log`** — one row per refresh: `entity_type`, `entity_id`, `recruiter_id`, `triggered_by_interaction_id`, `tokens_used`, `created_at`. Cost tracking and audit trail.

**`requisition_conditions`** — extracted job criteria: `condition_text`, `condition_type`, `priority_rank`, `source`. Populated by `extract-conditions` from JD text. Intended as the spine of matching (must / nice / dealbreaker); currently underused.

**`client_package_intelligence`** — accumulated comp knowledge per client: `base_pct_of_total`, `bonus_type`, `last_bonus_payout_pct`, `has_rsu`, `rsu_notes`, `confirmed_stretch`. This is institutional knowledge that gets more valuable with every deal.

**`candidate_lists`** — saved shortlists: `name`, `candidate_ids[]`, `requisition_id` (nullable), `source`, `visibility`.

**`recall_bot_sessions`** — Recall.ai note-taker sessions: `bot_id`, `candidate_id`, `meeting_url`, `status` (invited/in_progress/done/failed).

**`import_batches`** (+ `_contacts`, `_interactions`) — CSV import staging with rollback. See Section 24.

### Known state of the memory layer (updated 2026-08-23, Wave 2)

Documented so no agent assumes this works better — or worse — than it does. This block was stale for a while (it described the pre-Wave-1 state after Wave 1 had already shipped); corrected here.

- `refresh-context` handles all three entity types correctly.
- **Refresh is automatic**, not manual. A trigger on `interactions` insert enqueues a job (`pgmq`), drained every minute by `pg_cron`, dispatched to `refresh-context` via `pg_net` (migrations 044/046). The manual "Refresh" buttons on candidate/client pages and `TranscriptPanel` still exist and both paths coexist without conflict.
- **9 of 39 handlers read `ai_context`**: `client-meeting-prep`, `interview-prep`, `closing-script`, `pre-call-briefing`, `match-candidates`, `req-strategic-context`, `spec-email`, `submission-note`, and `refresh-context` itself (which only writes it). The other 30 still re-derive context from raw rows, violating the Memory Doctrine — extending to them remains open.
- **Truncation is gone.** None of the 9 slice `ai_context` anymore; all interpolate the full string.
- `candidates.profile_embedding` (pgvector, Wave 2) is now computed in the same job that refreshes `ai_context`, so the two stay in sync automatically.
- `requisitions.ai_context` is written by `refresh-context` and still read by **nothing**. (`req-strategic-context` reads `clients.ai_context`, not the requisition's own.) Still open.
- Outcome fields (`closed_reason`, `ccm_outcome`, `placed_fee_jpy`) are captured but only read by `client-rejection-diagnosis`, scoped to a single requisition. There is no cross-database learning. Still open — this is Wave 4.

Remaining highest-leverage work: extend `ai_context` reads to the other 30 handlers, give the requisition context a reader, and build the explainability panel (Wave 1, still open — see the roadmap below).

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
| `/clients/$id` | `.../clients.$id.tsx` | Client detail (5 tabs) |
| `/jobs` | `.../jobs.tsx` | Open requisitions + revenue forecast |
| `/jobs/$id` | `.../jobs.$id.tsx` | Single requisition detail |
| `/settings` | `.../settings.tsx` | Gmail / Outlook OAuth connect + disconnect |
| `/advanced-search` | `.../advanced-search.tsx` | Three-panel AI candidate search — not a nav item, accessed via candidates page |
| `/addin/taskpane` | `routes/addin/taskpane.tsx` | Outlook add-in task pane — see Section 24 |

Sidebar nav has five items: Dashboard, Candidates, Clients, Jobs, Settings.

---

## 14. Page Structure

### Candidate Detail — 4 Tabs

Tab order (left to right): **Timeline → Candidate notes → Candidate intelligence → Registration**

1. **Timeline** — merged feed of manual activity logs + process milestones, newest first. "Log activity" button opens inline form: type (call/email/meeting/job spec sent/linkedin message/other), date, summary, notes, optional linked client (cross-posts to client timeline). "Paste transcript" opens TranscriptPanel for AI processing.
2. **Candidate notes** — structured inline form, one card per section. Click any field box to begin typing; saves on blur. Sections: Current employment (company, title), Interview notes (large textarea → `notes_interview`), Notice period & urgency, Language assessment (Japanese/English selects + other text), Compensation (current base/bonus/total + expected range, all ¥M inline), Recruiter assessment (presentation & communication only → `notes_presentation`).
3. **Candidate intelligence** — active process panels with AI action buttons (all output editable). Compensation card with Edit dialog (5 salary fields, amounts in ¥M, stored as raw yen) + "Sync from notes" button (calls `/api/ai?type=extract-compensation`). Collapsible "Candidate profile data" section: status/source, language, job history, motivations, blockers, competing interviews.
4. **Registration** — document uploads (registration form PDF + CV PDF, CV triggers AI field extraction). Candidate details card: full name (English), full name (Japanese), date of birth (auto-calculates and saves `age`), email, phone, address, LinkedIn (all auto-populated from registration form upload).

### Candidate Profile Header

Shows: name · Japanese name | title · company · age | current salary · expected salary range. All pulled from DB fields. Salary only renders if at least one value is non-null.

### Client Detail — 5 Tabs

1. **Timeline** — interaction log. Each entry shows: type badge, date, "with [contact]" chip if contact_id set, "re: [candidate]" chip if candidate_id set, "spoke with candidate/client" badge from primary_party. Log event button opens `LogActivityModal` (includes who-you-spoke-with + contact selector).
2. **Client info** — company header, completeness bar, strategy notes, AI enrich, account intelligence, recommended actions, quick actions, Japan Market Context (all fields inline-editable).
3. **Contacts** — ContactsCard with per-contact activity log button and inline interaction history per contact.
4. **Jobs** — inline AddJobForm: JD upload (AI extracts title/salary/location via `/api/ai?type=extract-req-fields`), free-text salary range, location, hiring manager select, target close date, strategic context. Job list with pipeline badges.
5. **Contract** — all fields inline-editable (fee %, client since, contract signed). Contract file upload → AI extracts fee % and start date via `/api/ai?type=extract-contract`.

---

## 15. Component Architecture

### Actual state — read this before believing the target below

The target architecture in this section describes where the code should go. It is **not** where the code is. As of August 2026:

- `src/routes/_authenticated/candidates.$id.tsx` is **5,579 lines**.
- `src/routes/_authenticated/clients.$id.tsx` is **4,309 lines**.
- Those two files are **51% of the entire frontend** (~19,300 lines across routes and components).
- `src/hooks/`, `src/components/dashboard/`, `src/components/layout/`, `src/components/candidate/processes/`, and `src/components/candidate/registration/` **exist and are empty**. Earlier versions of this file described them as populated. They were not.

There are ~35 component functions inside `candidates.$id.tsx` and ~25 inside `clients.$id.tsx`, all defined in-file.

**Standing instruction:** when you touch either mega-file for a feature, extract the components you touched into the directories below as part of that change. Do not attempt a big-bang refactor, and do not add new top-level components to those files.

### Target hierarchy

```
src/components/ui/          ← shadcn primitives. Never modify.
src/components/shared/      ← Reusable domain components. Check here first.
src/components/[feature]/   ← Feature-specific. e.g. candidates/CandidateCard.tsx
src/hooks/                  ← One concern per hook. Currently empty.
```

### Existing Shared Components — use these, do not recreate

| Component | Purpose |
|---|---|
| `Card` | White square container, standard inner padding |
| `SectionLabel` | Small uppercase label above a data group |
| `FieldRow` | Label + value row inside a Card. `highlight="warning"` for amber state |
| `StageBadge` | Colored pill for pipeline stages — always use, never inline |
| `ActivityTimeline` | Unified feed for candidate and client pages. Handles upcoming events, cross-link chips, contact filtering, translation |
| `LogActivityModal` | Unified log-activity dialog. Exports `interactionTypeLabel(type, primaryParty)` |
| `SendEmailDialog` | Send via connected Gmail/Outlook. Editable To/Subject; body read-only (edit the draft first) |
| `ImportWizard` | CSV import with column mapping and rollback |
| `JdViewer` | Job description viewer |
| `LiveCallPanel` | In-call panel |
| `TranslateButton` | On-demand EN/JA translation of a text block |

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
- **Fast enough to earn the switch.** During a pilot, Kanri works alongside an existing ATS so the recruiter isn't asked to abandon their tools before they've seen value. But this is a transition window, not the target state — the product is designed to become the recruiter's primary system, not a permanent companion to Vincere or Bullhorn.

### What Should Never Happen in the UX

- Do not show a loading spinner for operations under 300ms — use optimistic UI
- Do not use modals for data that can be edited inline
- Do not paginate short lists — load all or use virtual scrolling
- Do not show empty states without a clear call to action
- Do not render AI output as static read-only text — it is always editable
- Do not auto-send anything — all AI drafts are copy/paste in MVP
- Do not add a section to a page without asking: does the recruiter need this in the next 60 seconds?
- During pilot onboarding, minimize double-entry friction where easy (e.g. CSV import, bulk candidate/client upload) — but do not build permanent bidirectional sync with third-party ATS platforms as a load-bearing feature. Kanri is meant to become the primary place activity gets logged, not a mirror of another system.

---

## 18. AI Endpoints

**41 endpoints.** 39 live in `lib/ai-handlers/` and are dispatched by `api/ai.ts` via `?type=<name>`. Two are standalone files under `api/ai/`. This table was previously 16 rows and badly out of date; it is now complete.

Before adding a 42nd, read the Architecture Rules in Section 2. The answer is usually to extend the context layer, not to add a handler.

### Memory (read the Memory Doctrine first)

| Endpoint | Input | Output |
|---|---|---|
| `refresh-context` | `entity_type` ('candidate' \| 'client' \| 'requisition'), `entity_id`, `triggered_by_interaction_id?` | Rebuilds that entity's reconciled `ai_context`. Recency-weights the last 30 interactions and states contradictions explicitly. Logs to `ai_context_log`. |

### Candidate intelligence

| Endpoint | Input | Output |
|---|---|---|
| `pre-call-briefing` | `candidate_id` | 60-second pre-call brief. Reads `ai_context`. |
| `positioning` | `process_id` | NFAR talking points sequenced by ranked motivations |
| `competing-analysis` | `candidate_id`, `recruiter_id` | Risk analysis across competing processes |
| `competing-brief` | `candidate_id`, `process_id?`, `competing[]` | Positioning call brief against named competitors |
| `closing-script` | `process_id` | Closing and counteroffer-defense script. Reads `ai_context`. |
| `interview-prep` | `process_id`, `ccm_number` | Prep for the next interview round. Reads `ai_context`. |
| `rejection-email` | `process_id`, `candidate_id` | Soft candidate rejection email in recruiter voice |
| `placed-checkin-message` | `process_id`, `milestone`, `format` | Post-placement check-in message |
| `job-spec-message` | `candidate_id`, `requisition_id`, `recruiter_id` | Spec message to a candidate |
| `spec-email` | `candidate_id`, `requisition_id` | Spec email. Reads `ai_context`. |

### Client intelligence

| Endpoint | Input | Output |
|---|---|---|
| `client-snapshot` | `client_id` | Two-part account snapshot |
| `client-meeting-prep` | `client_id`, `requisition_id?` | Pre-meeting brief. Reads `ai_context`. |
| `client-draft` | `client_id` + context | Client-facing email draft |
| `client-rejection-diagnosis` | `requisition_id` | Why candidates are being rejected at this client. **The only handler that reads outcome data.** |
| `enrich-client` | Pasted company text | Structured client profile fields. Writes nothing when it has no real information. |
| `chat-enrich-client` | `company_name`, `url?`, `question` | Tavily-backed company research Q&A |
| `update-client-strategy` | `client_id`, `interaction_summary`, `interaction_notes` | Synthesizes meeting notes into a living client brief |
| `merge-strategy-notes` | `existing`, `incoming` | Consolidates two versions of strategy notes |
| `req-strategic-context` | `requisition_id` | Strategic framing paragraph. Reads the client's `ai_context`. |

### Submission and pipeline

| Endpoint | Input | Output |
|---|---|---|
| `submission-note` | `candidate_id`, `requisition_id` | Client submission note. Returns `contactEmail` for the Send dialog. Reads `ai_context`. |
| `batch-cv-send` | `candidate_ids[]`, `requisition_id` | Multi-candidate introduction email in flowing prose |
| `call-priority` | `candidate_ids[]`, `requisition_id` | Ranks candidates 'call' vs 'email' with a one-line reason |
| `ccm-feedback-brief` | `process_id` | Client-chase call brief for outstanding interview feedback |
| `ccm-next-step` | `process_id`, `scenario` ('pass' \| 'reject' \| 'no_response') | Next-step guidance for each post-interview outcome |

### Search and matching

| Endpoint | Input | Output |
|---|---|---|
| `advanced-search` | `requisition_id`, `client_id`, `threshold`, `use_key_criteria` | Scored candidate list. Stage 1 retrieval (hybrid vector + full-text, `candidate-retrieval.ts`) bounds the candidate set before Claude ranks it — see Wave 2 in the roadmap below. |
| `match-candidates` | `requisition_id`, `recruiter_id` | Candidate matches for a requisition. Reads `ai_context`. Same two-stage retrieval as `advanced-search`. |

### Extraction and formatting

| Endpoint | Input | Output |
|---|---|---|
| `extract-candidate` | `candidate_id` (fetches PDF from storage) | Structured candidate fields from CV |
| `extract-compensation` | `candidateId` | Salary figures from `notes_template`, saved as raw yen |
| `extract-conditions` | `requisition_id`, `jd_text` | Rows into `requisition_conditions` |
| `extract-contract` | Contract text | `fee_pct`, `started_at` — only fields it can identify |
| `extract-req-fields` | `jd_text` | Title, `salary_range_text`, location. Excludes the client's own company name from the title. |
| `apply-candidate-notes` | `candidateId`, `existingTemplate`, `rawNotes?`, `fileBase64?`, `fileType?` | Distributes raw notes into template sections. Accepts text, PDF, Word. |
| `format-interview-notes` | `raw_text` | Structured interview notes (BACKGROUND / CAREER HISTORY / MOTIVATIONS) |
| `polish-call-notes` | `raw_notes`, `candidate_name?` | Cleaned call notes |
| `process-transcript` | `candidate_id`, `transcript_raw`, `interaction_type`, `interacted_at` | Structured interaction from a raw transcript |
| `infer-status` | none (batch job) | Recomputes `candidate_status` from activity recency. Clears stale 'placed'. |
| `translate` | `text`, `target_lang` ('en' \| 'ja') | Translated text |

### Integrations

| Endpoint | Input | Output |
|---|---|---|
| `invite-recall-bot` | `candidate_id?`, `meeting_url?`, `recruiter_id?` | Creates a Recall.ai bot session, stores it in `recall_bot_sessions` |

### Standalone (not in the `api/ai.ts` dispatch table)

| File | Input | Output |
|---|---|---|
| `api/ai/polish-notes.ts` | `notes` | Cleaned, scannable activity-log notes (haiku) |
| `api/ai/translate-interaction.ts` | `interaction_id`, `notes`, `source_lang` | Translation cached to `full_notes_translated` |

### Handler structure — enforced by tests

`tests/ai-handlers-structure.test.ts` (run with `npm test`) is a permanent regression guard. Every handler must:

1. Pass `thinking: { type: "disabled" }`. `claude-sonnet-5` emits an unrequested thinking block by default.
2. Extract text with `.content.find(b => b.type === "text")`, never `message.content[0]`.

Both patterns silently broke or truncated most AI features in August 2026. Do not regress them.

Current model split: 30 handlers on `claude-sonnet-5`, 15 call sites on `claude-haiku-4-5-20251001`.

## 19. Supabase

- **Project ID:** `iqotqiqamytpjoafwgzb`
- **RLS:** All tables enforce `team_id = auth.jwt() -> team_id` (team-scoped)
- **Storage bucket:** `resumes` — private, PDF only
- **Storage path pattern:** `{team_id}/{candidate_id}/{timestamp}_{filename}`
- **Buckets cannot be created via SQL migrations** — must use Supabase Dashboard UI

### Enabled extensions

An extension nobody can justify is an extension somebody will remove — so the reason each one is on is recorded here, not just the fact of it (from `docs/kanri-substrate-audit.html`).

| Extension | Schema | Why it's on |
|---|---|---|
| `vector` (pgvector) | `extensions` | Semantic retrieval — `candidates.profile_embedding`, `match_candidates_hybrid` (migration 047) |
| `pgroonga` | `public` | Japanese/CJK full-text search — Postgres FTS cannot tokenize Japanese (Section 10). `candidates.search_text` |
| `pgmq` | `pgmq` | Durable job queue with visibility-timeout retries — the automatic context-refresh queue (migration 044) |
| `pg_net` | `public` | Async HTTP from inside Postgres — lets the refresh trigger call a Vercel handler without blocking the interaction insert. Fire-and-forget; the queue, not the HTTP response, is the durability guarantee |
| `pg_cron` | `pg_catalog` | Drains the context-refresh queue every minute (migration 046) |

Do not add a new extension without recording why here in the same migration.

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
| `019_drop_urgency_to_move.sql` | Drops the legacy `urgency_to_move` column |
| `020_placed_fee.sql` | `processes`: ADD `placed_fee_jpy`, `placed_date` |
| `021_priority_fields.sql` | `interactions`: ADD `is_future`, `scheduled_at`; `processes`: ADD `not_interested_at` |
| `022_candidate_preferences.sql` | `candidates`: location / industry / bonus preferences, `equity_open`, `availability_date` |
| `023_interactions_requisition_link.sql` | `interactions`: ADD `requisition_id` FK (idempotent) |
| `024_ccm_interaction_types.sql` | Constraint allows `ccm1`–`ccm6` interaction types |
| `025_requisition_recruiter_notes.sql` | `requisitions`: ADD `recruiter_notes` |
| `026_candidate_lists_requisition.sql` | `candidate_lists`: ADD `requisition_id` FK — persistent spec shortlists |
| `027_clients_website.sql` | `clients`: ADD `website` |
| `028_dual_cv_fields.sql` | Separate English CV and Japanese document fields |
| `029_oauth_tokens.sql` | `recruiter_oauth_tokens` — AES-256-CBC encrypted refresh tokens, unique on (recruiter_id, provider) |
| `030_recall_bot_sessions.sql` | `recall_bot_sessions` table with team-scoped RLS |
| `032_drop_outreach_sequences.sql` | Removes the outreach-sequence tables. **Feature deliberately cut — do not reintroduce.** |
| `033_email_received_type.sql` | Adds inbound email as an interaction type |
| `034_interactions_delete_policy.sql` | RLS delete policy on interactions |
| `035_restore_tanaka_interactions.sql` | Mock-data repair |
| `036_interaction_translations.sql` | `interactions`: ADD `full_notes_translated`, `translated_lang` |
| `037_import_batches.sql` | `import_batches` — CSV import staging with rollback |
| `038_import_batches_contacts.sql` | Contact import support |
| `039_import_batches_interactions.sql` | Interaction import support |
| `040_process_last_activity_sync.sql` | Trigger syncing `processes.last_activity_at` from interactions |
| `041_process_last_activity_default.sql` | Default for the above |
| `042_candidate_last_interaction_sync.sql` | Trigger + backfill for `candidates.last_interaction_at`. Fixes the "Last touch" filter and all staleness logic. |
| `043_resumes_bucket_allow_docx.sql` | Storage bucket accepts .docx |
| `044_automatic_context_refresh.sql` | Enables `vector`/`pgroonga`/`pgmq`/`pg_net`/`pg_cron`; trigger on `interactions` insert enqueues a context-refresh job, drained by a worker function (not yet scheduled) |
| `045_harden_extension_schemas.sql` | Moves `vector` into the `extensions` schema (security linter) |
| `046_schedule_context_refresh_worker.sql` | Schedules the queue worker on `pg_cron` — turns on automatic memory refresh in production |
| `047_candidate_retrieval.sql` | `candidates.profile_embedding` (pgvector) + `search_text` (pgroonga-indexed generated column) + `match_candidates_hybrid()` (RRF fusion). `requisition_conditions` gets a `dealbreaker` condition_type and a `weight` column |
| `048_requisition_conditions_recruiter_source.sql` | Adds `'recruiter'` to `requisition_conditions.source`'s allowed values. Pre-existing bug found verifying Wave 2: `ConditionsCard`'s manual-add insert always sent this value, and the check constraint never allowed it — every manual add through that UI had failed since it was written |
| `049_backfill_requisition_link.sql` | `requisitions.backfill_of_requisition_id` (nullable, self-FK) — structural link from a backfill requisition to the one it replaces |

Note: there is no `031`. Numbering skips it.

New migrations increment sequentially. Never edit existing migration files.

**The two trigger-sync migrations (040, 042) exist because denormalised timestamp columns silently stopped matching the interactions table.** If you add another cached timestamp or counter, add the trigger in the same migration.

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
| Bidirectional live sync with third-party ATS (Bullhorn, Vincere, Greenhouse, etc.) | **Deferred permanently.** Not a sequencing choice — it contradicts the displacement thesis in Section 1. One-time CSV/bulk import is in scope; ongoing two-way sync never is |
| Outreach sequences / multi-channel campaigns | **Cut and removed** (migration 032). Competitor core competence, not Kanri's. Do not reintroduce |
| External sourcing database or profile scraping | **Do not build.** Established players hold 4M+ Japan profiles under a registered provider licence; Kanri is not licensed for this and the 2026 APPI surcharge regime makes it a poor place to improvise. See Section 10 |
| Additional one-shot AI endpoints | **Requires written justification.** See Architecture Rules, Section 2 |
| Calendar sync for interviews | Deferred. Highest measured admin cost in the industry, and pure commodity — buy or integrate rather than build |
| LinkedIn / BizReach sourcing automation | Deferred. Importing data the customer already holds is in scope; automated sourcing is not |
| Autonomous AI follow-ups | Deferred — trust risk too high, and it crosses the line in the Section 8 table |
| SMS / LINE / WhatsApp integration | Deferred |
| Permission tiers / admin roles | Deferred — all team members have equal access in MVP |
| Candidate-facing portal | Deferred. A single tokenised self-update link is the acceptable narrow version |
| Reporting and analytics (beyond Jobs forecast chip) | Deferred — except outcome-derived intelligence (client / hiring-manager conversion patterns), which is strategy, not reporting |
| AI podcast / audio briefing feature | Deferred — strong idea, post-MVP |
| Automated resume tailoring | Deferred. Japanese 職務経歴書 generation is a separate, in-scope thing — see Section 10 |
| Offer panel action buttons | UI shells exist, logic not yet wired |
| Real-time collaboration (live cursors, comments, @mentions) | Deferred |
| Mobile app | Not planned. A mobile voice-capture route is worth having; a second full client is not |
| A separate vector database (Qdrant, Weaviate, Pinecone) | **Do not build.** `pgvector` inside the RLS boundary is simpler and keeps candidate text inside Postgres, which matters under the APPI posture in Section 10 — shipping candidate text to a third-party vector store is a data-transfer question Kanri does not need to have. See Section 2's "Prefer Postgres" rule |
| A graph database (Neo4j, FalkorDB, Neptune) | **Do not build.** Kanri's relationships are already correctly modelled as foreign keys with RLS enforcing team scope on every one of them. A graph database would re-encode that in a second store that must be kept in sync — the same "permanent sync liability" argument that settled the displacement question in Section 1, applied internally. Graphs earn their keep on unbounded-depth traversal over schemas that change shape; Kanri's traversals are shallow and known in advance |
| An agent framework (LangChain, LangGraph, CrewAI, etc.) | **Do not build.** Kanri's handlers are direct Anthropic SDK calls and are perfectly legible. A framework adds indirection, version churn, and prompt opacity to solve a problem Kanri does not have |
| Self-hosted model serving (embedding models, cross-encoder rerankers) | **Do not build.** Model weights and GPU inference do not belong in a Vercel serverless function. Call a managed API (Voyage for embeddings) or use Claude itself (it already reranks well when given a bounded candidate set and asked to score with reasons — see `match-candidates.ts`/`advanced-search.ts`) |
| Backfill intelligence — pulling what's known about who succeeded in a role before into the new backfill's matching/strategic-context prompts | Deferred, not rejected. Structural link (`backfill_of_requisition_id`, migration 049) is built; the AI layer on top is not, because "what made the placement work" isn't tracked well enough yet (no structured signal for early turnover, performance, or why someone left) for the AI to say anything a recruiter couldn't already read off the old requisition. Revisit once outcome capture (Wave 3) exists |

### Shipped — remove from any "deferred" reasoning

| Feature | Shipped |
|---|---|
| Email sending from Kanri (Gmail + Outlook OAuth) | June 2026. `api/send-email.ts`, `/settings`, `SendEmailDialog` |
| Call auto-logging via Recall.ai | June 2026. Migration 030, `api/webhooks/recall.ts` |
| Full EN/JP i18n toggle | June 2026 |
| CSV import with rollback | See Section 24 |
| Outlook add-in | See Section 24 |

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

### Before adding any AI capability, ask in this order

1. Does the reconciled `ai_context` already contain what this needs? If yes, read it. Do not query raw rows.
2. Can an existing handler be extended instead of a new one being added? Prefer extension.
3. Does this record an outcome or a decision? If it should and does not, add that first.
4. Can the recruiter see what the AI read? If not, it is not finished.
5. Does it fall in the right-hand column of the Section 8 table? If so, do not build it.

### Keeping this file true

This document is the single source of truth, which means a wrong line here is worse than a missing one — agents act on it. When a session changes the endpoint list, the schema, the routes, or the architecture, update the matching section in the same commit.

This file drifted badly once already: it documented 16 AI endpoints when there were 41, described five component directories that were empty, and stopped listing migrations at 018 when the repo was at 043. Do not let that happen again.


## 24. Systems Not Documented Elsewhere

These shipped and were never written down. Agents have proposed rebuilding them.

### CSV Import (`lib/import-handlers/`, `src/components/shared/ImportWizard.tsx`)

Bulk import for pilot onboarding — the sanctioned answer to migration friction, and the only ATS-data path that exists.

- `suggest-mapping.ts` — AI-suggested column mapping from an uploaded CSV
- `commit.ts` — writes rows, recording the batch in `import_batches`
- `rollback.ts` — undoes an entire batch
- `history.ts` — past imports

Supports candidates, client contacts, and interactions (migrations 037–039). Entity types include activity/timeline.

### Outlook Add-in (`lib/addin-handlers/`, `src/routes/addin/taskpane.tsx`)

A task pane inside Outlook that logs an email to Kanri without leaving the mail client.

- `match-sender.ts` — resolves a sender address to a candidate, client, or contact
- `log-email.ts` — writes the email into `interactions`

Built by `npm run build`, which copies `dist/index.html` to `dist/addin/taskpane.html`. **Currently outbound-only.** Two-way capture (inbound email as well) is the intended next step, not a new system.

### OAuth (`lib/oauth-handlers/`)

Gmail and Microsoft Graph connect / exchange / status / disconnect. Refresh tokens are AES-256-CBC encrypted at rest (`recruiter_oauth_tokens`, migration 029). `encryptToken` / `decryptToken` are exported from `gmail-exchange.ts` and reused by the Outlook path and by `api/send-email.ts`.

Environment: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, optional `OAUTH_REDIRECT_BASE` (default `http://localhost:5173`) and `OAUTH_ENCRYPTION_KEY` (32 chars; falls back to a dev key if unset).

### Tavily web research

`@tavily/core` powers `ClientEnrichCard` on the client page and the `chat-enrich-client` handler. This is the only outbound web-research capability in the product. It is the right tool for BD signal detection when that gets built.

### Tests

`tests/ai-handlers-structure.test.ts`, run with `npm test` (Vitest). Guards the two handler-structure rules in Section 18. Run it before committing any change to `lib/ai-handlers/`.

---

## Project Status

Active development resumed June 2026. All sessions below are committed and pushed to main.

**Reading the session log:** entries are a historical record of what each session did, not a description of current state. Where an entry conflicts with Sections 1–24, the numbered sections win. In particular, older entries write AI calls as `/api/ai/<name>`; the actual convention is `/api/ai?type=<name>` for the 39 dispatched handlers (see Section 18).

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

**Recruiter workflow QA pass — 7-step walkthrough + follow-up fixes (2026-08-23)**
- Systemic bug: claude-sonnet-5 emits an unrequested "thinking" content block by default. All 33+ `lib/ai-handlers/*.ts` files were indexing `message.content[0]` directly (often the thinking block, not text) and none disabled thinking — silently broke or truncated most AI features. Fixed: every handler now uses `.content.find(b => b.type === "text")` and passes `thinking: { type: "disabled" }`. Added `tests/ai-handlers-structure.test.ts` (Vitest, `npm test`) as a permanent regression guard for both patterns.
- `advanced-search.ts`: `max_tokens` raised 2500 → 8000 (was truncating before any JSON output with ~60 candidates in the ranking prompt).
- Candidates search/filter: fixed a stale-closure bug where updating a filter while a candidate was open would get silently overwritten by an auto-redirect effect a moment later. `candidates.$id.tsx` `updateSearch()` now preserves the open candidate's route instead of bouncing through the bare `/candidates` path.
- `candidates.last_interaction_at` was never synced from `interactions` (same bug class as the `processes.last_activity_at` fix above, just not caught at the time) — added migration 042 (trigger + backfill), fixing the "Last touch" filter and touch-staleness logic app-wide.
- `clients.$id.tsx` "Add job" crashed the whole app on open (`SelectItem value=""` — Radix reserves empty string for "no selection"). Fixed with a `"none"` sentinel.
- `extract-req-fields.ts`: job title extraction no longer includes the client's own company name (redundant since the req is already scoped to that client).
- `enrich-client.ts`: when the model has no real info about a company, it now leaves strategy notes empty instead of writing an apology/refusal paragraph into the field; frontend shows a toast instead of saving junk text.
- Missing Send capability, despite being documented as already wired: `JobMatchPanel`, `SpecListPanel` (candidate email), and `JobDetailPanel`'s batch CV send (client contact email via `hiring_manager_id`) all had Copy/Regenerate but no Send. All three now open `SendEmailDialog` pre-filled with the real recipient address.
- `submission-note.ts`: submission emails are addressed to a named client contact but never included that contact's email for the Send dialog. Added `contactEmail` to the response.
- Stage-change toast copy contradicted the SituationBanner shown right below it (Buy-In: "confirmed" before any outreach happened; CCM: "prepare the candidate" for an interview that already occurred). Reworded both to match the banner's actual meaning.
- CV Sent chase threshold drift: banner and this doc both said 5 business days, but the live dashboard rule and the (now-deleted) `daily-agenda.ts` were both firing at 3. Aligned dashboard rule to 5.
- Marking a process "Placed" left the candidate's own Candidate Intelligence tab showing "No active processes — add to open requisition," as if nothing happened, and never logged a timeline entry for the placement. Fixed: proper "Placed." empty-state summary + auto-logged timeline entry, matching the existing "specs sent" auto-log pattern.
- `daily-agenda.ts` deleted — dead code, nothing in the frontend has called it since the dashboard moved to the rule-based `usePriorityActions` hook; removed from `api/ai.ts` route table too.
- Mock data enrichment: `scripts/enrich-mock-candidates.mjs` (authored text, not AI-generated) gave 201/202 seed candidates a realistic `notes_interview`, diversified `candidate_status` (28 active / 172 passive / 2 placed, was 0/200/2), and added 4 `competing_interviews` — the AI positioning/briefing/submission outputs were reading as generic because almost no seed candidate had any of this.

**Strategy review + CLAUDE.md rewrite (2026-08-23)**
- Discovery, market and competitive research pass. No application code or database changes. Report published to `docs/kanri-memory-thesis.html`.
- This file rewritten against the actual codebase. Section 18 went from 16 documented endpoints to all 41. Section 15 now states the real component architecture (two route files are 51% of the frontend; five documented directories are empty) instead of an aspirational one. Section 20 extended from migration 018 to 043. Section 11 gained the memory and intelligence tables, which had never been documented. Section 13 gained `/jobs/$id`, `/settings`, and the add-in route, and the client tab count was corrected from 3 to 5.
- New in Section 2: the Memory Doctrine, a ban on new one-shot AI endpoints, mandatory outcome capture, and mandatory explainability. New in Section 8: an explicit automate-versus-human table. New in Section 10: 両手型 / 属人化 operating context, the 推薦文 and 職務経歴書 document specs, and the APPI + 職業安定法 posture. New Section 24 documents the CSV import system, the Outlook add-in, OAuth, Tavily, and the test suite — all previously shipped and unwritten.
- Resolved a standing contradiction between Sections 5 and 9: personal priority queue and team activity feed are separate surfaces, and teammate items must never enter the personal queue.
- Displacement thesis re-examined and reaffirmed with the reasoning recorded, so it does not get relitigated.

**Wave 2 — retrieval layer (2026-08-23)**
- Migration 047: `candidates.profile_embedding` (pgvector, HNSW index) + `candidates.search_text` (generated column, `pgroonga` index) + `match_candidates_hybrid()` SQL function (reciprocal rank fusion over the two). `requisition_conditions` gets a `dealbreaker` condition_type and a `weight` (1-10) column, backfilled for existing rows.
- `lib/embeddings.ts` — Voyage AI (`voyage-3.5`) wrapper via raw `fetch`, no SDK. Returns `null` on missing key or failure; every caller must degrade gracefully.
- `refresh-context.ts`'s `refreshCandidate()` now computes `profile_embedding` in the same job that already refreshes `ai_context` on every interaction insert — no new trigger.
- New `lib/ai-handlers/lib/candidate-retrieval.ts` — shared two-stage retrieval helper (not a new AI endpoint). `advanced-search.ts` and `match-candidates.ts` both call it instead of loading the whole team's candidate table, fixing the scaling failure Section 18 used to flag.
- Along the way: `match-candidates.ts` was filtering candidates by `recruiter_id` (owner), hiding teammates' candidates from a job's matches — contradicts the multi-user rule in Section 5. Fixed as a side effect of team-scoping the new retrieval helper. `advanced-search.ts`'s candidate and client-process queries had no `team_id` filter at all despite running under the service-role key (bypasses RLS) — also fixed.
- Regenerated `src/integrations/supabase/types.ts` (stale since migration 030) — incidentally resolved the `recall_bot_sessions` `@ts-expect-error` noted in Known Issues below.
- This work incorporated `docs/kanri-substrate-audit.html`, a same-day open-source discovery audit that had been written but never folded back into this file (its own §17 says so explicitly). Its corrections: `pgroonga` not native Postgres FTS (Section 10), reciprocal rank fusion not a plain union for combining vector + full-text results (no BM25 extension on Supabase), and Claude-as-reranker validated over a paid reranking API. Its unmerged CLAUDE.md recommendations are now folded in: the "Prefer Postgres" rule and the SQL-injection rule in Section 2, the extension list in Section 19, and the deferred-technology entries in Section 22.
- `scripts/backfill-candidate-embeddings.ts` — one-off backfill for existing seed candidates, needs `VOYAGE_API_KEY` to run.

---

### Strategy review — August 2026 (decisions in force)

A full discovery and competitive review was run on 2026-08-23. Findings, the 34-opportunity scoring matrix, and the competitive analysis live in `docs/kanri-memory-thesis.html`. The decisions below are settled and should not be re-derived each session.

**Positioning.** Kanri's differentiator is not the number of things it can generate — that layer is commoditising fast, and better-funded competitors ship it weekly. The differentiator is the reconciled memory underneath: Kanri remembers, everything else generates. In Japan this maps directly onto 属人化, the defining failure of the 両手型 boutiques that are the target customer. See Sections 1 and 10.

**Displacement confirmed.** Re-examined and reaffirmed. See Section 1.

**What the review found in the code.** The memory layer works and is underused: refresh is manual, 30 of 39 handlers ignore `ai_context`, the 9 that read it truncate it to 300–600 characters, `requisitions.ai_context` has no reader, and outcome data is captured but never learned from. `advanced-search` puts the whole candidate table in one prompt and will fail on a real database. Dashboard done/snooze lives in `localStorage`. There is no task entity, no team feed, no BD surface, and no way to re-surface dormant candidates.

### Roadmap — build order

Sequenced by dependency. Each wave assumes the one above it.

**Wave 1 — substrate. Mostly done (2026-08-23).** Automatic context refresh on interaction insert is live (migrations 044/046, `lib/job-handlers/process-context-refresh-queue.ts`) and the 9 handlers that read `ai_context` no longer truncate it. Still open: explainability panel (no UI exists, and `ai_context_log` doesn't record which records were read, only that a refresh happened), duplicate-submission guard (done — warning in `AddToProcessModal`), and mega-file decomposition (not started — `candidates.$id.tsx` is now 5,640 lines, up from 5,579).

**Wave 2 — retrieval. Done (2026-08-23).** Built as hybrid pgvector + `pgroonga` (not native Postgres full-text search, which cannot tokenize Japanese — see Section 10 and `docs/kanri-substrate-audit.html` §3), fused with reciprocal rank fusion in `match_candidates_hybrid()` (migration 047). `advanced-search.ts` and `match-candidates.ts` both call the new `lib/ai-handlers/lib/candidate-retrieval.ts` helper for a bounded, relevance-ranked candidate set instead of loading the whole team's candidate table. `requisition_conditions` now has a `dealbreaker` tier and a `weight` (1-10) column. Scope decisions, so a future session doesn't re-litigate them:
  - Only `candidates.profile_embedding` is a stored embedding column — computed as a side effect of the existing context-refresh job (`refreshCandidate()` in `refresh-context.ts`), not a new trigger. Requisition query text is embedded live at search time instead of stored, since it changes more often and has no refresh trigger of its own.
  - Embedding provider is **Voyage AI** (`voyage-3.5`, `output_dimension: 1024`) — chosen by the user, **not independently validated** against Kanri's actual code-switched JP/EN content. `docs/kanri-substrate-audit.html` §12 flags this as an open question (Japanese-specialist models like Ruri may or may not beat multilingual ones here) that nobody has tested on real notes. Revisit if match quality looks off.
  - `requisition_conditions.weight` is AI/default-assigned (`extract-conditions.ts`, and per-type defaults in `ConditionsCard`), not manually editable — no weight slider in v1.
  - `VOYAGE_API_KEY` is unset in this environment as of this writing. Everything degrades safely without it (embedding write/read no-ops, retrieval falls back to full-text-only, then to a bounded fetch) — see `scripts/backfill-candidate-embeddings.ts`, which needs to be run once the key is added, to populate embeddings for the existing seed candidates.

**Wave 3 — flywheel and Japan wedge.** Structured outcome capture on every terminal process state. Tasks and follow-ups as a real entity, replacing `localStorage`. 推薦文 generator. Keigo register control at generation time.

**Wave 4 — intelligence.** Client and hiring-manager scorecard from outcome data. Interview debrief capture. Database re-engagement engine. Handoff pack.

**Wave 5 — anticipation.** Event spine giving interactions and stage changes consequences. Pre-meeting briefs that fire themselves. Offer-stage watch. Competitive clock. Job-change detection on the firm's own database. Two-way email logging.

**Wave 6 — leverage.** Ask Kanri (single agentic surface with database tools). Placement post-mortem. Weekly recruiter review. 職務経歴書 builder. Prospect and BD objects.

**When Wave 6 is complete:** stop and remind the user about the Recall.ai note-taker setup gap in Known Issues below — they explicitly asked to be prompted about it once all waves are finished, not before.

**Also when Wave 6 is complete:** bring up building a **Placements tab** in the left sidebar nav (alongside Dashboard/Candidates/Clients/Jobs/Settings) — the user asked for this 2026-08-23 but explicitly said not to action it until all waves are done. Spec as given: lists every placement (candidate name, placement fee), filterable by all-time / year / quarter, with fees totaled for the selected filter. `processes.placed_fee_jpy` and `placed_date` already exist and are the data source — this is a new list view and filter, not new data model.

**Deferred from earlier roadmaps:** Apollo.io / Hunter.io auto-enrichment. Contact enrichment is commodity and lower value than any wave above.

### Roadmap — seed data

Not yet done at target scale. Current state: 201 seed candidates with authored `notes_interview` (28 active / 172 passive / 2 placed), 4 competing interviews, plus a Torch mock import dataset.

Target: ~20 clients, ~150+ candidates across every stage including Placed and Closed Lost, 2–8 interactions per active process, several candidates at Offer, some cold (last touch >30 days).

**Key rule: no pre-seeded AI output.** `ai_snapshot` and `ai_context` stay null for all seed records. Intelligence is generated on demand from notes. Seeding it would hide exactly the pipeline failures this data exists to expose.

### Known issues / deferred

- Per-contact AI summary (needs design decision on where/how AI reads contact notes)
- Interaction editing (assess scope before starting)
- PDF export for ROI calculator (low priority — standalone HTML file is the demo path)
- `placement_guarantee_until` exists on candidates and nothing reads it. Japan's 3–6 month early-turnover refund exposure makes this worth wiring
- Dashboard done/snooze state is per-browser `localStorage` — invisible to teammates, lost on device change. Fixed by the Wave 3 tasks entity
- Two mega-files (`candidates.$id.tsx` 5,640 lines, `clients.$id.tsx` 4,309 lines) are over half the frontend. Decompose incrementally, never in one pass
- **`VOYAGE_API_KEY` is unset, both locally and in Vercel production.** Candidate profile embeddings (Wave 2) no-op without it — matching still works, just full-text-only, no semantic retrieval. Needs a Voyage AI account and API key, then `scripts/backfill-candidate-embeddings.ts` run once to populate the existing seed candidates. Embedding model choice (Voyage vs. a Japanese-specialist alternative) was also never validated on real Kanri notes — see the Wave 2 roadmap entry above
- **Recall.ai note-taker was never actually finished.** `RECALL_API_KEY` is unset both locally and in Vercel production — nobody has signed up at recall.ai and added a key anywhere. `recall_bot_sessions` has zero rows; the feature has never been exercised end to end. The `APP_URL` half of this was fixed 2026-08-23 (it silently defaulted to an unrelated third-party domain — see that commit), but the feature still cannot be used until a real Recall.ai API key is obtained and added to both `.env` and Vercel. **Deliberately deferred until after the roadmap waves are done** — flag this to the user once Wave 6 is complete; they asked to be reminded then, not before.

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
