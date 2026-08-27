---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-27
---

# IDA-DG55 — T-117A Unified Portal Presentational Shell

> Status: pre-freeze candidate. Promotion is Tier 0; the downstream product slice is Tier 2
> UI/accessibility. No repository or runtime authority exists before exact human approval and the
> repo-owned Lean lifecycle.

Gate: `IDA-DG55`

Sole slice: `T-117A-UNIFIED-PORTAL-SHELL`

Base: `438ea3f51f68789743bf6d3882c5a423e9593629`

Promotion branch: `codex/t117a-unified-portal-shell-promotion`

## Outcome and authority boundary

Protected `origin/main` and this detached candidate resolve to the base. T-118 is closed and the
`t117-unified-portal-shell` allocation is present. Pre-freeze authority stays inactive. After
approval, GitHub creates the named branch's PR; only then may its real number be inserted as a
derived marker and verified against branch/base/head. Runtime remains inactive until merge.

The sole outcome is one typed, pure presentational shell that composes neutral `Case → Actions →
Timeline` slots from the existing Crystal public surface. It stays responsive and unmounted,
enabling a capability-driven portal rather than copied role dashboards.

T-117A owns only the shared presentational shell. T-117B needs separate authority for RSC runtime,
parallel routes, PPR, context, projections, boundaries, and mounting. This slice touches none.

No auth, tenant, routing/mount, schema, billing, AI, domain, PPR, CI/E2E, or provider changes.

## Exact writers and frozen capacity

Promotion writes exactly this gate, its admission, `current-program.md`, and
`current-tracker.md`. Product writes only:

| Product path                                                      | Max positive bytes |
| ----------------------------------------------------------------- | -----------------: |
| `packages/ui/src/components/crystal/unified-portal-shell.tsx`     |              1,633 |
| `packages/ui/src/components/crystal/index.ts`                     |                553 |
| `packages/ui/src/components/crystal/crystal.stories.tsx`          |              2,080 |
| `packages/ui/src/index.ts`                                        |                 38 |
| `apps/web/src/components/dashboard/unified-portal-shell.test.tsx` |              2,157 |

No `package.json`, split story, helper, boundary-test, route, mount, config, E2E, or generated
writer is allowed. The allocation also caps this gate at 8,877 bytes, admission at
8,277 bytes, program at 1,576 bytes, and tracker at 590 bytes. Aggregate positive ceilings are
25,781 bytes and 6 new files: docs 10,453; config/data 8,277; support 590; source 4,304; tests
2,157. Every path/category/total is a hard maximum, never a target. Existing capacity is consumed;
no budget edit or generic reserve is authorized.

Existing barrels, recursive Storybook/Vitest collection, and UI alias make the map feasible. Root
`index.ts` is writer-permitted only if its wildcard export proves insufficient; otherwise it is a
proven no-op inside the map.

## Shell and accessibility contract

- Props supply Case, Actions, Timeline content and accessible labels. The shell performs no fetch,
  persistence, navigation, authorization, tenant choice, analytics, domain decision, or state.
- DOM/reading order is Case, Actions, Timeline. Named regions avoid duplicate `main` landmarks.
  Consumers own headings, controls, states, loading, and business actions.
- The layout stacks without horizontal overflow at 320 CSS pixels and progressively uses the
  available space at 768 and 1440. Visual rearrangement cannot change logical keyboard or screen
  reader order.
- Existing Crystal focus, forced-colors, matte, contrast, and motion contracts remain. The shell
  adds no filter, nested glass, timer, controller, or motion runtime. Reduced motion loses nothing.
- Interactive descendants retain visible, unobscured focus and native keyboard semantics. Text
  and non-text UI meet WCAG 2.2 AA; content remains usable at 200% zoom and narrow reflow.
- Production code prefers `<=150` physical lines. A 151–300 production file needs a cohesion
  rationale with unchanged complexity, duplication, accessibility, coverage, and capacity;
  `>300` is forbidden. The focused test has its own `<=300` ceiling.

## Closure and acceptance

Root barrel → Crystal barrel → shell → three caller-owned slots is the complete graph. Story and
test consume the public surface; no app runtime does. The test also proves source boundaries and
absence of mounts, so no sixth product path is needed.

| ID  | Acceptance                                                    | Proof                             |
| --- | ------------------------------------------------------------- | --------------------------------- |
| A1  | Public export and exact writers.                              | test, TypeScript, Git scope       |
| A2  | Named Case → Actions → Timeline regions keep DOM/focus order. | render, a11y, keyboard            |
| A3  | 320/768/1440 reflow has no clipping or overflow.              | Storybook/browser geometry        |
| A4  | Zero runtime imports/mount/motion/new glass.                  | boundary, lint, architecture      |
| A5  | Caller owns empty/error/loading/actions.                      | focused variants and story        |
| A6  | AA, forced colors, focus, zoom, reduced motion remain usable. | browser accessibility             |
| A7  | Byte/category/line limits and protected paths hold.           | size, modularity, security, scope |

Skipped proof fails. Source and browser proof cannot substitute for each other or for exact-head
types, boundaries, capacity, and scope.

## Current benchmark

Official evidence observed `2026-08-27T07:28:46.000Z`:

- GitHub Primer PageLayout (`https://primer.style/product/components/page-layout/`): semantic
  regions, logical source order, narrow reflow, visible focus.
- IBM Carbon UI Shell (`https://carbondesignsystem.com/components/UI-shell-right-panel/usage/`):
  a consistent shared shell with independently composable regions and keyboard/screen-reader
  support.
- GOV.UK page template (`https://design-system.service.gov.uk/styles/page-template/`): consistent
  landmarks, skip-link compatibility, and useful top-level hierarchy.

Criteria: region order, runtime-free slots, focus/reduced motion, and reflow. Raise passing widths
from 0 (shell absent) to 3 (320/768/1440), measured in frozen Storybook/browser evidence.

Use principles only; keep Crystal tokens/brand and copy no trade dress.

## Verification and execution

After promotion, start RED in the focused test, then add only admitted changes. Run focused test,
UI type/lint, Storybook/browser, modularity, architecture, capacity, security, and scope; then
`slice:verify`, `slice:e2e:pr`, and one `ci:local:pr`. Exact-head readiness runs `pr:verify`,
`security:guard`, and `e2e:gate` with same-head feedback and no infrastructure edit.

After focused/full mechanical green, freeze the exact product diff and acceptance matrix. Run one
bounded, redacted, read-only Claude Opus 5 adversarial code review before opening the product PR.
Accepted findings receive one consolidated in-map remediation, invalidated checks rerun, and the
diff re-freezes. No retry: timeout/quota/login/no-output/unavailable records `unavailable`, then
uses Sol once. Git, tests, security, CI/E2E, and feedback remain authoritative.

The final approval authorizes the complete bounded chain: byte-identical gate/admission plus the
two projection files with only their live PR-number marker derived after PR creation; one promotion
PR; its exact Lean owner marker; product branch/RED→GREEN implementation
only after promotion merge; one product PR; exact-head CI/E2E/review; green squash merge;
deterministic success/failure closeout in program/tracker; and cleanup. Normal remediation stays
inside the five product writers and repeats only invalidated proof. A sixth product writer,
protected surface, runtime mount, new product contract, allocation breach, or risk-tier change
invalidates the gate and requires new human authority.

## Rollback and failure closure

Before merge, close/delete product branch/PR with no runtime effect. After merge, revert the exact
product merge. Trigger on any acceptance, capacity, gate, or mount failure.

An unmerged/foreign PR, failed exact-head proof, merge/main-health mismatch, uncertain containment,
or closeout failure consumes promoted authority, restores
`runtime_authorized:false` and `activeSlice:null`, preserves observed effects, blocks T-117B and
successors, and stops for incident authority when needed. Success closeout records exact
identities and proof, then makes T-117B eligible for a separate gate; it never promotes T-117B.
