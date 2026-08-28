---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-28
---

# IDA-DG57 — T-117B Portal Runtime

> Status: disposable pre-freeze candidate. The prerequisite and promotion are Tier 3; no repository
> or runtime authority exists before exact human approval and the Lean lifecycle.

Gate: `IDA-DG57`

Sole slice: `T-117B-PORTAL-RUNTIME`

Measurement base: `be398cbccdd4491b2d0721bc201fd9e49ce101af`

Prerequisite branch: `codex/t117b-portal-runtime-authority`

Promotion branch: `codex/t117b-portal-runtime-promotion`

Product branch: `codex/t117b-portal-runtime`

## Outcome and revised architecture contract

T-117B mounts the already-built Unified Portal shell for the member consumer through ordinary
async Server Components. Case, Actions, and Timeline are sibling `Suspense` regions; the
protective disclaimer is structural chrome above and outside every data/error boundary. The
existing T-116 `CaseSummary` projection and exhaustive accident renderer supply Case; Actions are
derived from that same promise; one additional tenant-scoped read supplies Timeline. The whole
view therefore uses exactly two projection queries and never performs per-card fan-out.

The member layout and page call one argument-free memoized context function. `React.cache()` wraps
an inner resolver that resolves session once and derives user/tenant context. The member runtime
cannot use `logTag`, cookie material, or a module-global Map/TTL as a cache key or lifetime. A new
server request gets a new cache and session object; revocation is visible on that request.

This is the approved amendment:

> T-117B (Portal Runtime): Delivers the shared portal through ordinary async Server Components
> with independent Suspense boundaries for cases, actions, and timeline; request-scoped
> React.cache session and tenant-context resolution; at most two projection queries per view; and
> a structural protective disclaimer outside all data boundaries. Module-global session caching
> and TTL-based memoization are prohibited. Named parallel routes, cacheComponents, and Partial
> Prerendering are deferred to a separately gated atomic Tier-3 rendering-strategy migration.

T-117C owns that later atomic migration. This slice cannot set `cacheComponents`, add named slots
or `default.tsx`, edit `next.config`, set `dynamic`/`revalidate`, add `generateStaticParams`, or
refactor global `headers()` call sites. It cannot change proxy/routing topology, auth providers,
tenant primitives, schema/RLS, billing, AI, CI/E2E policy, or any non-member route.

## Exact authority and writer boundaries

The prerequisite may write only:

1. `scripts/lean-current-authority-policy.mjs`
2. `scripts/lean-current-authority-policy.test.mjs`
3. `scripts/lean-exact-writer-exceptions.mjs`
4. `scripts/repo-size-budget.json`

It adds no generic Tier-3 authority. The exception is true only for
`sliceId=T-117B-PORTAL-RUNTIME`, `tier=3`, and product writer-map SHA-256
`2e16444a55df145af2d5c0aaa2a1968cbc0215fc4fe0d0970374903dcadd647c`. T-116's existing exact
`domain_read_projection` class is preserved. Every other Tier-3 slice, product-map order/hash, auth,
session, tenant, domain, route, config, or unknown path remains default-denied. The policy module
stays below its hard 200-line contract; the regression test stays below 300.

After that prerequisite merges green, promotion writes exactly this gate, its admission,
`current-program.md`, and `current-tracker.md`. Product writes only:

| Product path                                                                   | Max baseline-relative bytes |
| ------------------------------------------------------------------------------ | --------------------------: |
| `apps/web/src/lib/auth.server.ts`                                              |                         163 |
| `apps/web/src/components/shell/member-portal-context.ts`                       |                         805 |
| `packages/domain-member/src/portal-runtime/get-member-portal-activity.ts`      |                       1,874 |
| `packages/domain-member/src/portal-runtime/get-member-portal-activity.test.ts` |                       2,472 |
| `packages/domain-member/src/index.ts`                                          |                         157 |
| `apps/web/src/components/dashboard/member-portal-runtime.tsx`                  |                       5,210 |
| `apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx`    |                       4,265 |
| `apps/web/src/app/[locale]/(app)/member/_core.entry.tsx`                       |                          78 |
| `apps/web/src/app/[locale]/(app)/member/_core.entry.test.tsx`                  |                         136 |
| `apps/web/src/app/[locale]/(app)/member/page.tsx`                              |                         985 |
| `apps/web/src/app/[locale]/(app)/member/page.test.tsx`                         |                           0 |

No package manifest, message, E2E, route slot, default file, config, schema, migration, shared
motion runtime, or twelfth product writer is allowed. The bounded allocation
`t117b-portal-runtime` owns the new exception module, gate/admission, and exact product paths;
existing allocations retain their disjoint historical paths. Aggregate and category ceilings are
the measured positive deltas plus budget-file self-size only, never a generic reserve. Actual
implementation cannot exceed a per-path/category/file ceiling.

## Session, tenant, and query contract

- `resolveSessionInner()` performs the existing Better Auth server read with current request
  headers and returns null on the existing failure posture. `getCachedSession = cache(inner)`
  remains argument-free.
- `resolveMemberPortalContextInner()` derives `{session,userId,tenantId}`; the exported
  `getMemberPortalContext` is one shared `cache(inner)` function consumed by both layout and page.
- One render tree invokes the inner context resolver once even when a region exceeds two seconds.
  Different requests cannot share its object/cache; a revoked session is absent on the next
  request. Session instrumentation is reported separately from projection instrumentation.
- Projection 1 is existing `getMemberCaseSummaries`. Projection 2 is
  `getMemberPortalActivity`. Both receive the same member/tenant IDs and execute within existing
  tenant context with explicit tenant/member/vehicle predicates. No write, cache, event, schema,
  RLS, price, proof, document payload, note, PII, or narrative escapes.
- Cases and Actions share the first promise. Timeline owns the second. Starting both promises
  before translation work preserves concurrent streaming; no component or card starts a query.
- Missing session follows the current redirect boundary. Missing tenant/forbidden role stays
  `notFound`. Query errors remain isolated in their region; empty arrays render explicit empty
  states without fabricating work.

## Responsive, accessibility, and states

- Preserve the shell's semantic Case → Actions → Timeline order at 320, 768, and 1440 px without
  horizontal overflow. Member is the first consumer; no copied role dashboard is introduced.
- The page has one labelled heading. Status and empty/loading/error feedback use semantic text and
  are never color-only. Existing links keep visible focus and keyboard activation.
- Reduced-motion remains inherited from the Crystal primitives; this slice adds no animation,
  transition, timer, filter layer, or client runtime.
- Disclaimer remains visible while regions are loading, empty, failed, or streaming. A slow or
  failed region cannot prevent ready sibling output or remove shell chrome.
- `MemberPortalRuntime` is a cohesive 151–300-line orchestration surface: it owns only three
  regions, their fallbacks, and shared copy. It stays under 300 with unchanged complexity,
  duplication, accessibility, and focused proof. Every focused test is at most 300 lines.

## Acceptance matrix

| ID  | Acceptance                                                                         | Required proof                                       |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Exact eleven product writers; no T-117C/config/slot drift.                         | scope, writer hash, architecture, security           |
| A2  | Layout/page share one argument-free request-scoped context resolver.               | unit source boundary and real Next RSC probe         |
| A3  | One resolution per tree; requests isolated; revocation visible next request.       | invocation/object/revocation probe                   |
| A4  | Exactly two tenant-scoped projections, measured separately from session.           | query mocks, domain tests, DB-access guard           |
| A5  | Cases/Actions/Timeline stream independently; slow region does not block siblings.  | real RSC timing probe with >2-second region          |
| A6  | Disclaimer survives loading, empty, and isolated error states.                     | runtime boundary tests and real error probe          |
| A7  | Existing CaseSummary registry renders; Actions/Timeline remain presentation-safe.  | focused web/domain tests and TypeScript              |
| A8  | 320/768/1440 reflow, keyboard/focus, semantics, and reduced motion remain sound.   | Storybook/browser/a11y evidence after implementation |
| A9  | Ordinary production build passes with PPR/cacheComponents absent.                  | full `build:ci` and source exclusions                |
| A10 | Exact allocation, policy exception, approval marker, PR/CI/E2E, and closeout hold. | capacity, Lean suite, certificate, live Git/GitHub   |

Skip is failure except a repo-classified exact-head E2E skip whose wrapper/delivery evidence is
green and whose policy explicitly classifies the changed surface. Source counting alone cannot
prove session lifetime, streaming, or query execution.

## Feasibility and current benchmark

The disposable exact-main prototype passed formatter, 14 focused tests, domain/web TypeScript, and
a full ordinary Next production build. A real Next RSC probe produced one inner invocation across
layout/page/three consumers; three sequential request contexts produced distinct alpha, beta, and
revoked objects. In the actual shell, disclaimer plus fast Case/Actions/loading flushed at 814 ms;
the delayed Timeline arrived at 2809 ms, a 1995 ms separation. A rejected Case region kept the
disclaimer and empty Timeline while rendering isolated failure feedback. Probe routes/scripts were
removed before measurement.

Benchmark direction remains the approved Unified Portal and T-117A proof: one responsive shell,
progressive disclosure, stable semantic region order, visible system status, and task-first copy.
React request memoization and Next streaming are implementation mechanics, not visual inspiration.
No external trade dress, markup, copy, iconography, proportions, or dashboard layout is copied.
The user-supplied final Claude Opus 5 consultation selected this ordinary-RSC option after its first
tool-dependent attempt was discarded; this evidence is advisory, while Git/tests/security/build
and exact-head CI remain authoritative.

## Verification and single-approval execution

The disposable candidate runs formatter WRITE/CHECK, admission/schema, Lean regression/full
authority tests, capacity schema/derived ceilings/attribution, focused domain/web tests, both type
checks, modularity/source boundaries, DB/architecture/security/scope checks, ordinary production
build, and candidate certificate. The staging source is then deleted after its manifest and hashes
are stored.

One human approval may authorize the whole bounded chain without broadening promotion scope:

1. materialize the exact four-path prerequisite from protected main and open/merge one green PR;
2. derive the new protected-main SHA, replacing only the frozen base token in gate/admission;
3. create the exact four-path promotion branch, obtain its live PR number, inject that number only
   into agreeing program/tracker projections, reformat, rerun all invalidated checks, freeze, and
   post the exact Lean owner marker on the verified head/tree;
4. merge promotion only when required exact-head checks and feedback are clean;
5. implement the exact eleven-path product candidate with focused RED→GREEN, browser/a11y proof,
   one frozen Opus 5 adversarial code review (Sol once only on no-output/unavailable), consolidated
   in-map remediation, one product PR, exact-head CI/E2E/review, and green squash merge;
6. perform deterministic success/failure closeout in program/tracker and clean task-owned state.

The derived substitutions are closed: prerequisite merge SHA becomes promotion base; GitHub's
verified live number becomes `promotionPrNumber`; gate/admission hashes are recomputed after the
base substitution; no writer or semantic field may change. Each derivation reruns the complete
invalidated freeze/check sequence. No second human approval is needed for those mechanical steps.
A writer, contract, protected surface, allocation, tier, or rendering-strategy drift invalidates
the chain and stops.

## Rollback and failure closure

Before a merge, close the affected PR and delete only its task-owned branch/worktree. After the
prerequisite merges but promotion fails, leave the dormant exact exception/allocation unused and
restore inactive projections; it authorizes no other slice. After product merge, revert the exact
product merge and restore inactive program/tracker. No data/schema/provider rollback exists.

Trigger rollback on session isolation/revocation, tenant/query count, disclaimer/streaming,
accessibility/responsive, capacity, writer-map, marker, exact-head, feedback, merge, or main-health
failure. An unmerged/foreign PR, uncertain effects, or closeout failure consumes authority, blocks
successors, records observed effects, and stops for incident authority. Success records exact
identities and makes T-117C or the next role/task view separately gateable; it never promotes them.
