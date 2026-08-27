---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-08-27
---

# IDA-DG56 — T-116 Case Summary Projection and Registry

> Status: pre-freeze candidate. Promotion is Tier 0; product is Tier 2 projection/UI/accessibility. No
> repository or runtime authority exists before exact human approval and the Lean lifecycle.

Gate: `IDA-DG56`

Sole slice: `T-116-CASE-SUMMARY`

Base: `43ef9c2685a9bfa2fafb2cb6a47f373cff156b27`

Promotion branch: `codex/t116-case-summary-promotion`

Product branch: `codex/t116-case-summary`

## Outcome and authority boundary

Protected `origin/main` and this detached candidate equal the base. Capacity PR `#1644` added the
bounded `t116-case-summary` allocation and no generic reserve. Compatibility PR `#1645` added the
typed `domain_read_projection` policy class only for this exact Tier-2 writer map while preserving
default-deny for every other domain path. Authority remains inactive. After approval, the named
promotion PR may be created; only its live branch/base/head-verified number may become the derived
Lean marker.

T-116 supplies the missing member case read boundary needed before T-117B can meet its two-query
dashboard budget: one tenant-scoped projection returns presentation-safe `CaseSummary` values, and
a compile-time-exhaustive registry maps the current kind to a pure accident renderer. Nothing is
mounted.

The database has no `case_kind` column and this slice cannot add one. `caseKind: 'accident'` is a
provisional, presentation-only registry key applied to current claim rows; it is derived from no
column and is not member-facing taxonomy. Never infer kind from category, title, host, tenant, or
country. Later Green Card/flight kinds need separate contracts; adding one without a descriptor
must fail TypeScript. No future kind is fabricated here.

No route/dashboard mount, parallel route, PPR, auth/session, tenant primitive, proxy/routing,
schema/RLS, billing, AI, CI/E2E infrastructure, T-117B, or provider change is allowed.

## Exact writers and capacity

Promotion writes only this gate, admission, `current-program.md`, and `current-tracker.md`. Product
writes only:

| Product path                                                                 | Max bytes |
| ---------------------------------------------------------------------------- | --------: |
| `packages/domain-member/src/case-summary/types.ts`                           |       769 |
| `packages/domain-member/src/case-summary/get-member-case-summaries.ts`       |     2,382 |
| `packages/domain-member/src/case-summary/get-member-case-summaries.test.ts`  |     3,644 |
| `packages/domain-member/src/index.ts`                                        |        96 |
| `apps/web/src/components/dashboard/case-summary/accident-case-summary.tsx`   |     1,255 |
| `apps/web/src/components/dashboard/case-summary/case-kind-registry.ts`       |       686 |
| `apps/web/src/components/dashboard/case-summary/case-kind-registry.test.tsx` |     2,184 |

No manifest, route/layout, story, E2E, schema/migration, translation, helper, config, generated
file, or eighth product writer is allowed. Gate/admission/program/tracker caps are
11,495/9,748/2,863/791 bytes. Aggregate baseline-relative ceilings: 35,913 bytes, 8 files; docs
14,358, config 9,748, support 791, source 5,188, tests 5,828. Every ceiling is hard, never a target;
no budget edit is authorized. Existing barrels, dependency, and Vitest collectors close the graph.
The 96-byte barrel delta is exactly these two lines, with no comment or blank line:
`export * from './case-summary/get-member-case-summaries';` and
`export * from './case-summary/types';`.

## Projection and privacy contract

- `getMemberCaseSummaries({ memberId, tenantId })` rejects missing tenant and executes inside
  existing `withTenantContext({ tenantId, role: 'member' })`.
- SQL predicates include tenant and member IDs; unchanged RLS remains defense in depth.
- Keep one grouped `select` inside the `withTenantContext` callback. It reads claims and document
  counts with predicates on claims tenant/member and `claim_documents.tenant_id`; `accessTenantId`
  never widens or substitutes for the document tenant. No second read or per-card fan-out. T-117B
  keeps its separate whole-view maximum of two projections.
- Select only stable identity, lifecycle states, count, ordering timestamps, and a closed next-step
  token derived from the lifecycle pair.
- Exclude title/description, category/company, amount/currency, pricing/billing, fee/proof state,
  document names/paths/types/content, notes/messages/evidence, legal analysis, and direct PII.
- `documentCount` is non-negative; a missing join is zero. Order by
  `coalesce(updated_at, created_at) desc nulls last, id asc`, with a null-timestamp fixture. Empty
  returns `[]`; query errors and invalid lifecycle pairs propagate without fabricated data.

The next-step token is metadata, not a command or sentence: exhaustively map lifecycle status to
member action, team review, external response, court schedule, or complete. It cannot authorize a
transition, choose a tenant, expose proof, or duplicate billing/legal rules.

## Union, registry, renderer

- `CaseKind`, `AccidentSummary`, and `CaseSummary` discriminate on `caseKind`; derive `CaseKind`
  from the union rather than a second unchecked list.
- `caseKindRegistry` uses `satisfies Record<CaseKind, CaseKindDescriptor>`; a new kind without a
  descriptor fails compilation. No unknown-kind fallback silently accepts drift.
- Descriptors select typed RSC-compatible components with no fetch or database/auth/tenant/routing/
  billing/AI/sibling-vertical import. The accident leaf has no client directive, state, effect,
  transition, timer, analytics, navigation decision, or motion runtime.
- Web files use `import type` from the `@interdomestik/domain-member` package root only; no subpath
  or value-side domain import may trigger database module loading.
- Use semantic heading/status/fact-list markup. Future callers own localization and links; raw
  tokens are never mounted as member-facing prose.
- Production files prefer `<=150` lines. A cohesive 151–300 file needs unchanged complexity,
  duplication, privacy, a11y, tests, and capacity; `>300` is forbidden. Focused tests use their own
  `<=300` ceiling.

## Responsive, accessibility, and states

Though unmounted, T-117B-safe composition requires only executable jsdom/source proof here:

- DOM order: case reference, lifecycle status, document count, next step. Visuals cannot reorder it.
- Native semantics and accessible names; status is not color-only; no fixed width, animation,
  filter, glass, motion runtime, or control requiring keyboard/focus proof.
- Caller-owned empty/error, explicit zero documents, and compile-time failure for unknown kinds.

Real geometry, 200% zoom, forced-colors, and 320/768/1440 browser measurement require a mounted
entry or browser collector and are explicitly deferred to separately gated T-117B.

## Acceptance matrix

| ID  | Acceptance                                       | Proof                         |
| --- | ------------------------------------------------ | ----------------------------- |
| A1  | Seven writers and public domain export only.     | Git scope, entrypoint, types  |
| A2  | One tenant+member grouped query, no fan-out.     | query test, DB-access guard   |
| A3  | Zero/N document counts fold into that query.     | call count and fixtures       |
| A4  | Exhaustive union/registry; accident registered.  | `satisfies Record`, compile   |
| A5  | No price/proof/document/narrative/PII leak.      | field and source assertions   |
| A6  | Lifecycle maps to a bounded next-step token.     | lifecycle fixtures            |
| A7  | Semantic order, names, zero, color independence. | jsdom and source boundaries   |
| A8  | No mount/PPR/auth/schema/T-117B/CI drift.        | boundary, architecture, scope |
| A9  | Capacity and typed line limits hold.             | size, modularity, certificate |

Skipped proof fails. Query-shape tests cannot replace exact-head type/security/scope/DB/CI proof.
No browser geometry or production-route behavior is claimed by this unmounted slice.

## Current benchmark

Official evidence observed `2026-08-27T17:01:18.000Z`:

- GOV.UK Summary List (`https://design-system.service.gov.uk/components/summary-list/`): concise
  key/value facts, semantic lists, explicit missing data, and repeated summary cards.
- GOV.UK Tag (`https://design-system.service.gov.uk/components/tag/`): descriptive,
  non-interactive status; color is not a hidden action.
- IBM Carbon Structured List (`https://carbondesignsystem.com/components/structured-list/usage/`):
  related facts are scannable, simple, sentence-cased, and accessibility-tested.

Criteria: fact hierarchy, status semantics, zero handling, privacy, and screen-reader structure.
Baseline: 0 of 4 semantic renderer proofs (renderer absent); target: 4 of 4 for DOM order, explicit
zero, accessible status, and no color-only signal. Geometry and task-time measurement belong to
T-117B. This is component confidence, not a mounted product outcome.
Use principles only: retain Crystal/Interdomestik language and copy no markup, copy, icons,
proportions, visual system, or trade dress.

## Verification, review, and execution

Promotion preflight runs formatter, admission, plan/track, Lean structure, UI governance,
size/capacity, DB/architecture, security, scope, and certificate. Pre-PR projection stays inactive;
after approval the verified live PR number moves both projections to `promotion_pending`. No
phantom PR number is an anchor.

After promotion, start RED in both focused tests. Run the domain collector explicitly with
`pnpm --filter @interdomestik/domain-member test:unit --run`; then run web tests, type/lint, DB,
entrypoint, architecture, modularity, capacity, security, scope, and proportional full gates. No
new E2E or infrastructure is needed; repo policy alone classifies exact-head E2E.

After mechanical green, freeze the product diff and matrix. Run one bounded, redacted, read-only
Claude Opus 5 adversarial review before product PR. Accepted findings get one consolidated in-map
repair, invalidated checks, and refreeze. No retry: timeout/quota/login/no-output/unavailable/tool
failure is recorded, then Sol runs once. Git, tests, security, exact-head CI/E2E, and feedback rule.

Final approval binds the four-file candidate; derived live PR/Lean marker; one promotion PR;
post-merge RED→GREEN product branch; one product PR; exact-head CI/E2E/review; squash merge;
deterministic closeout; cleanup. In-map remediation reruns invalidated proof. An eighth writer,
schema/route/session change, mount, allocation breach, or tier drift requires new authority.

## Rollback and failure closure

Before product merge, close/delete the unmerged branch/PR. After merge, revert the exact product
merge and restore inactive projection. Trigger on tenant/query/privacy/exhaustiveness/a11y/capacity/
exact-head/mount failure.

An unmerged/foreign promotion, failed exact-head proof, merge/main-health mismatch, uncertain
containment, or closeout failure consumes authority, restores `runtime_authorized:false` and
`activeSlice:null`, preserves effects, blocks T-117B, and stops for incident authority if needed.
Success records identities/proof and returns T-117B as the next separately gated Tier-3 candidate;
it never promotes T-117B.
