# Kanri — Session Handoff Document

> Generated: 6 June 2026
> Build status: **passing** (TypeScript clean, all migrations applied)
> Last session: 7th session — technical debt cleanup + design system foundation

---

## Project Overview

Kanri is an AI-native recruiter intelligence platform and CRM for boutique agency recruiters in the Japan bilingual talent market. See CLAUDE.md for full spec.

---

## What Was Completed This Session (7th session, 6 June 2026)

### Technical Debt Items Fixed

**1. `current_total` manual override**
- `NoteCompensationFields` in `candidates.$id.tsx` now has an `overrideTotal` state (boolean, default false).
- Default: current total is locked read-only, labelled "Auto-calculated — Override" (clickable link).
- Override mode: field becomes editable. Auto-calc from base+bonus is suppressed. Label shows "Manual — Auto" (clickable link to restore).
- `restoreAutoTotal()` recalculates from `current_base + current_bonus` and resets override state.
- Override is session-local (resets on navigation). The manually saved value persists in DB.

**2. `urgency_to_move` dead column removed**
- Migration `019_drop_urgency_to_move.sql` applied: backfills `active_passive` (High → Active, Medium/Low → Passive where null), then `DROP COLUMN urgency_to_move`.
- `urgency_to_move: string | null` removed from the `Candidate` type in `candidates.$id.tsx`.
- No UI references remain.

**3. Candidate page general review — no issues found**
- Source label on Intelligence tab: correct (uses `{linkedin: "LinkedIn", bizreach: "BizReach", ...}` mapping).
- Other languages display: correct (`additional_languages ?? other_languages ?? "None"`).
- Interview notes upload flow: complete end-to-end.

### Design System Foundation Laid (partial — visual changes not yet visible)

**What was done:**
- `src/styles.css` fully replaced with Kanri design token system: Shippori Mincho / Plus Jakarta Sans / DM Mono fonts, ink/vermillion/indigo/moss/gold palette, `.btn`, `.card`, `.badge`, `.label`, `.stat-*`, `.nav-tab`, `.divider` component classes.
- CLAUDE.md updated with full Design System Contract section (fonts, colors, radius rules, component patterns, migration checklist).
- Global class sweep across all route and shared component files: removed all `rounded-lg/xl/2xl/3xl/md`, all `shadow-*`, replaced `bg-gray-*`/`text-gray-*` with ink tokens.
- `font-display` (Shippori Mincho) added to: dashboard greeting h1, stat numbers, login h1, sidebar wordmark, candidate name header in profile, candidate list names, client company name h2, jobs page h1.
- Shared components migrated: `Card`, `FieldRow`, `StageBadge`, `SectionLabel` now use design tokens.
- Tab navigation (`candidates.$id.tsx`, `clients.$id.tsx`) switched to `.nav-tab`/`.active` CSS classes.
- Sidebar background → `var(--color-white)`, border → `1px solid var(--color-ink-15)`.

**Why changes are not visually obvious yet:**
The codebase uses **inline `style={{ color: "#xxx" }}`** for almost all colour and spacing.
`candidates.$id.tsx` alone has 241 inline style attributes with hardcoded hex values like `#1a1a18`, `#5f5e5a`, `#888780`, `#f5f5f3`, `#185fa5`, `#e6f1fb`, `#633806`, `#27500a`, `#a32d2d`.
CSS token changes do not affect inline styles. The next session must replace these inline hex values with `var(--color-*)` CSS custom properties to make the design system visible.

---

## What Needs to Happen Next Session

### The single most important task: inline style migration

Go file by file (highest traffic first) and replace all hardcoded hex colours in `style={{}}` props with CSS custom properties from the design system.

**Colour mapping — hardcoded hex → CSS token:**

| Old hex | Token | Meaning |
|---|---|---|
| `#1a1a18` | `var(--color-ink)` | Primary text / borders |
| `#5f5e5a` | `var(--color-ink-60)` | Secondary text |
| `#888780` | `var(--color-ink-30)` | Muted / placeholder text |
| `#b8b7b2` | `var(--color-ink-30)` | Same token, lighter use |
| `#d9d7d3` | `var(--color-ink-15)` | Default borders |
| `#f5f5f3` | `var(--color-ink-10)` | Sunken / input background |
| `#f5f5f3` / `#eeede8` | `var(--color-bg-page)` | Page background areas |
| `#ffffff` / `#fff` | `var(--color-white)` | Card / surface background |
| `#fafaf9` | `var(--color-white)` | Same, slightly off-white |
| `#185fa5` | `var(--color-indigo)` | Info / link / CCM blue |
| `#e6f1fb` | `var(--color-indigo-light)` | Info background |
| `#27500a` | `var(--color-moss)` | Success / placed green |
| `#eaf3de` | `var(--color-moss-light)` | Success background |
| `#633806` | `var(--color-gold)` | Warning / offer amber |
| `#fdf3e7` / `#faeeda` | `var(--color-gold-light)` | Warning background |
| `#a32d2d` | `var(--color-danger)` | Danger / risk red |
| `#fcebeb` | `var(--color-danger-bg)` | Danger background |
| `#173404` / `#3b6d11` | Keep as-is | Process tab own (green) — intentional |
| `#2c2c2a` / `#501313` | Keep as-is | Process tab colleague/uncovered — intentional |

**Also fix border shorthand strings:**

| Old | New |
|---|---|
| `"0.5px solid rgba(26,26,24,0.12)"` | `"0.5px solid var(--color-ink-15)"` |
| `"0.5px solid rgba(26,26,24,0.08)"` | `"0.5px solid var(--color-border-subtle)"` |
| `"0.5px solid rgba(26,26,24,0.20)"` | `"0.5px solid var(--color-ink)"` |
| `"0.5px solid rgba(26,26,24,0.22)"` | `"0.5px solid var(--color-ink-15)"` |

**Priority order (do these files, in this order):**

1. `src/routes/_authenticated/candidates.$id.tsx` — 241 inline styles, highest traffic
2. `src/routes/_authenticated/clients.$id.tsx` — second highest traffic
3. `src/routes/_authenticated/dashboard.tsx`
4. `src/routes/_authenticated/advanced-search.tsx`
5. `src/routes/_authenticated/candidates.tsx` (list pane)
6. `src/routes/_authenticated/jobs.$id.tsx`

**Approach per file:**
- Do one file per commit.
- Use sed for the repeated hex-to-token substitutions, then manually fix any edge cases.
- Run `npx tsc --noEmit` after each file — must stay clean.
- Run dev server after each file and visually check the page before committing.

**Sed commands to run on each file (adapt path):**
```bash
FILE="src/routes/_authenticated/candidates.\$id.tsx"
sed -i '' \
  -e 's/color: "#1a1a18"/color: "var(--color-ink)"/g' \
  -e 's/color: "#5f5e5a"/color: "var(--color-ink-60)"/g' \
  -e 's/color: "#888780"/color: "var(--color-ink-30)"/g' \
  -e 's/color: "#b8b7b2"/color: "var(--color-ink-30)"/g' \
  -e 's/background: "#f5f5f3"/background: "var(--color-ink-10)"/g' \
  -e 's/background: "#fafaf9"/background: "var(--color-white)"/g' \
  -e 's/background: "#ffffff"/background: "var(--color-white)"/g' \
  -e 's/background: "#fff"/background: "var(--color-white)"/g' \
  -e 's/color: "#185fa5"/color: "var(--color-indigo)"/g' \
  -e 's/background: "#e6f1fb"/background: "var(--color-indigo-light)"/g' \
  -e 's/color: "#27500a"/color: "var(--color-moss)"/g' \
  -e 's/background: "#eaf3de"/background: "var(--color-moss-light)"/g' \
  -e 's/color: "#633806"/color: "var(--color-gold)"/g' \
  -e 's/background: "#fdf3e7"/background: "var(--color-gold-light)"/g' \
  -e 's/color: "#a32d2d"/color: "var(--color-danger)"/g' \
  -e 's/background: "#fcebeb"/background: "var(--color-danger-bg)"/g' \
  "$FILE"
```

---

## Known Technical Debt (remaining)

3. Team Activity Feed on dashboard shows only logged-in recruiter's own interactions.
4. Submission package "Accept All / Reject All" not implemented in TranscriptPanel.
5. `/jobs/$id` — no "Add condition" shortcut from within JD text.
6. Single-team bootstrap — second recruiter joining requires a manual SQL update.
7. Advanced Search location filter uses text search of notes; no dedicated `preferred_location` DB column.
8. **Inline style migration incomplete** — design system tokens defined but not yet wired to component inline styles (see above). No visual impact until this is done.

---

## Current Architecture

### Frontend Structure
```
src/
  routes/
    _authenticated/
      dashboard.tsx
      candidates.tsx          — list pane + filter panel
      candidates.$id.tsx      — 4-tab candidate detail (Timeline / Notes / Intelligence / Registration)
      clients.tsx
      clients.$id.tsx         — 5-tab client detail (Timeline / Client info / Contacts / Jobs / Contract)
      jobs.tsx
      jobs.$id.tsx
      advanced-search.tsx
  components/
    ui/                       — shadcn/ui primitives — never modify
    shared/                   — Card, SectionLabel, FieldRow, StageBadge (all on design tokens)
    candidate/
      TranscriptPanel.tsx
      SubmissionPackagePanel.tsx
```

### Design System Status
- `src/styles.css` — fully replaced with Kanri token system. Tailwind v4 `@theme` block defines all tokens. Legacy aliases preserved for shadcn compat.
- `CLAUDE.md` — Design System Contract appended as final section. Read it before any UI work.
- Shared components (Card, FieldRow, StageBadge, SectionLabel) — on design tokens.
- Route files — Tailwind class cleanup done. **Inline styles not yet migrated** (next session task).

### Database — All Applied Migrations
```
001–018  (see prior sessions)
019_drop_urgency_to_move.sql  — backfill active_passive from urgency_to_move, then DROP COLUMN
```

### Key Field Conventions
- `active_passive` — 'Active' | 'Passive'. Live urgency toggle. `urgency_to_move` column is gone.
- `urgency_notes` — free text urgency context.
- `comp_notes` — free text compensation context.
- `current_total` — auto-calculated from `current_base + current_bonus` in UI. Override pattern available (session-local).
- `source` — linkedin / bizreach / doda / referral / inbound / other. Display as human label.
- `additional_languages` — stored as "Korean — Business" (language + " — " + proficiency).
- Salaries: raw yen in DB. UI inputs in ¥M (× 1,000,000). Use `formatYen()` for display.

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
