---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-26
---

# IDA-DG54 — T-118 Crystal Design-System Primitives

> Status: pre-freeze candidate. Promotion is Tier 0; the downstream product slice is Tier 2
> UI/accessibility. No repository or runtime authority exists before exact human approval and the
> repo-owned Lean lifecycle.

Gate: `IDA-DG54`

Sole slice: `T-118-CRYSTAL-PRIMITIVES`

Base: `6ff846deb9d99ad103d81dba5e4de46343dcf965`

## Outcome and authority boundary

`origin/main` and this detached candidate resolve to the base. This projection is
`promotion_pending`; Lean runtime remains inactive until merge/owner/resolver, and T-117 is
deferred. PR `#1636` installed the exact allocation; no further repair is needed.

The sole outcome is four typed presentation primitives, local tokens, barrels, one story, and two
tests. They prepare `Case → Actions → Timeline`; T-117 later composes one responsive,
capability-driven shell rather than copied role dashboards. Nothing mounts here.

No auth/session, tenant, proxy/routing, schema/RLS, billing, AI, domain, M1–M5, T-117, CI, E2E, or
product-workflow surface changes.

## Exact writers and capacity

Promotion writes exactly this gate, its admission, `current-program.md`, and
`current-tracker.md`. Product writes exactly:

| Product path                                                    | Max positive bytes |
| --------------------------------------------------------------- | -----------------: |
| `packages/ui/src/components/crystal/tokens.ts`                  |              1,070 |
| `packages/ui/src/components/crystal/matte-anchor-card.tsx`      |              1,843 |
| `packages/ui/src/components/crystal/refractive-glass-panel.tsx` |              1,844 |
| `packages/ui/src/components/crystal/stepper.tsx`                |              2,130 |
| `packages/ui/src/components/crystal/timeline.tsx`               |              2,407 |
| `packages/ui/src/components/crystal/index.ts`                   |                501 |
| `packages/ui/src/components/crystal/crystal.stories.tsx`        |              1,731 |
| `packages/ui/src/index.ts`                                      |                275 |
| `apps/web/src/components/dashboard/crystal-primitives.test.tsx` |              2,143 |
| `apps/web/src/components/dashboard/crystal-boundary.test.ts`    |              1,468 |

No `package.json`, split story, helper, route, mount, config, or generated writer is allowed. The
same allocation caps this gate at 9,157 bytes and admission at 8,504 bytes. Aggregate positive
ceilings are 33,073 bytes and 11 new files: docs 9,157; config/data 8,504; source 11,801; tests
3,611. Every path/category/total is a hard maximum, never a target.

Existing root export, recursive Storybook/Vitest collectors, UI alias, and Tailwind scan make the
map feasible without package/config edits.

## Primitive and accessibility contract

- Primitives are pure typed React presentation. Props carry labels, status, dates, links,
  descriptions, or children. Domain/database/auth/tenant/routing/billing/AI/app/server imports are
  zero. Local Crystal tokens do not replace global theme or create tenant branding.
- `MatteAnchorCard` uses native anchor truth when linked, an accessible name, visible focus,
  forced-colors support, and a 44 CSS-pixel interactive target. No fake click semantics.
- `RefractiveGlassPanel` has a readable matte fallback and at most one
  `backdrop-filter`-bearing layer per panel. The representative story permits at most two
  concurrent viewport glass layers and no nested filter amplification.
- `Stepper` is an ordered list with text/programmatic completed/current/future/error states and one
  `aria-current="step"`; only supplied native links are interactive. `Timeline` is ordered, uses
  `<time>`, explicit state text, and a named empty state. Neither infers domain decisions.
- Motion is short, CSS-only, and non-blocking; runtime libraries/controllers/timers are forbidden.
  Reduced motion removes transforms/transitions without losing state.
- Matte/glass combinations meet WCAG 2.2 AA text and non-text contrast, keyboard/focus semantics,
  forced colors, and reflow without horizontal scrolling at 320, 768, and 1440 CSS pixels.

Production components prefer `<=150` physical lines. A 151–300 production file needs an exposed
cohesion rationale with unchanged complexity, duplication, accessibility, coverage, and capacity;
`>300` is forbidden. Focused tests are `<=300`.

## Closure and acceptance

Root → Crystal barrel → four primitives/tokens is the only export graph. Story/tests consume the
public surface; no app runtime does. There is no persistence, fetch, session, provider, transition,
route state, or deletion. Empty/error states are prop-driven; consumers own data/actions.

| ID  | Acceptance                                                              | Proof                              |
| --- | ----------------------------------------------------------------------- | ---------------------------------- |
| A1  | Public exports and exact writer map.                                    | tests, TypeScript, Git scope       |
| A2  | Names/state, one current step, focus, 44px target, empty/error, motion. | render and Storybook a11y/keyboard |
| A3  | Zero domain/app/server or shared-motion imports.                        | boundary, lint, architecture       |
| A4  | One filter/panel, two/story, matte fallback, AA contrast.               | boundary and browser contrast      |
| A5  | Logical order and zero overflow at 320/768/1440.                        | Storybook/browser geometry         |
| A6  | Exact byte/category/line limits; protected paths unchanged.             | size, modularity, security, scope  |

Skipped required proof fails. Source proof cannot replace Storybook browser proof, and Storybook
cannot replace type, boundary, capacity, scope, or exact-head evidence.

## Current benchmark

Official evidence observed `2026-08-26T20:42:09.000Z`:

- GitHub Primer (`https://primer.style/`): public, composable product primitives.
- Atlassian motion (`https://atlassian.design/foundations/motion`): purposeful, performant motion
  with a usable reduced-motion state.
- IBM Carbon progress indicator
  (`https://carbondesignsystem.com/components/progress-indicator/usage/`): explicit completed,
  current, future, error, focus, and responsive-orientation semantics.

Criteria: composability, state clarity, assistive semantics, reduced motion, reflow, and layer cost.
Raise widths passing semantics, focus order, reduced motion, and zero overflow from 0 (absent) to 3
(320/768/1440), measured on frozen Storybook/browser evidence.

Use principles only. Never copy distinctive words, anatomy, layout, colors, branding, illustration,
interaction choreography, or trade dress.

## Verification and execution

Start RED in both tests, then add only admitted product files. Focused proof runs tests, UI
lint/type-check, Storybook/browser, modularity, architecture, capacity, security, and Git scope.
Tier-2 proof runs `pnpm slice:verify`,
`pnpm slice:e2e:pr`, and one `pnpm ci:local:pr`. Exact product-head readiness runs
`pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate` with same-head review feedback and no
E2E/config edit.

After green pre-freeze and frozen bytes, run one bounded, redacted, no-tools Claude Opus 5 design
review. After product green and before its PR, run one Opus code review on the exact diff plus
matrix. Accepted findings get one consolidated in-map remediation and proof restart. No retry:
timeout/quota/login/no-output/unavailable records `unavailable`, then uses Sol once. Opus stays
advisory and skips mechanical closeout absent new semantics.

The final approval authorizes the complete bounded chain: byte-identical four-path promotion and
PR; its derived exact Lean owner marker; product branch/implementation only after promotion merge;
one product PR; exact-head CI/E2E/review; green squash merge; deterministic success/failure
closeout in program/tracker; and cleanup. Normal remediation stays within the ten product writers
and repeats only invalidated proof. An eleventh writer, protected surface, new product contract,
route mount, persistence/provider capability, or risk-tier change invalidates the gate.

## Rollback and failure closure

Before product merge, delete the product branch/PR with no runtime effect. After merge, revert the
exact product merge and root-export delta. Trigger on broken exports, semantics, focus, reduced
motion, contrast, reflow, glass bound, capacity, gates, or any app import.

An unmerged/foreign/mismatched PR, failed exact-head proof, merge mismatch, failed main health,
uncertain containment, or closeout failure consumes the promoted authority, restores
`runtime_authorized:false` and `activeSlice:null`, preserves observed effects, blocks T-117 and all
successors, and stops for incident authority when needed. Success closeout records exact identities
and proof, then makes T-117 eligible for a separate gate; it never promotes T-117 automatically.
