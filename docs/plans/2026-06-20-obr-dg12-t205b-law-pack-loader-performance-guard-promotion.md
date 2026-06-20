---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-20
tracker_path: docs/plans/current-tracker.md
---

> Status: Completed Tier 0 promotion record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself.

# OBR-DG12: Post-T309 T-205b Law-Pack Loader Performance Guard Promotion

## Classification

Classified as promotion/design-gate because this record only reconciles current
plan and tracker authority after `T-309` closeout and promotes the next governed
implementation slice. Risk tier: Tier 0 because the touched surface is
docs/tracker authority only.

## Authority Evidence

| Source                            | Evidence                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR `#1130`                        | `T-309` implementation merged at `7ce973423065ef74ece80b4a75503aaa3fabe84c` from final head `4a37189f1fe9beaa28087806e478cb073a2a9af7`.                            |
| PR `#1131`                        | `T-309` closeout merged at `1f7088579fc3a5da7bf46f3bab831017a42a0496`.                                                                                             |
| Canonical `main`                  | Clean and synced at `1f7088579fc3a5da7bf46f3bab831017a42a0496` before this gate branch.                                                                            |
| Current main checks               | Post-closeout `main` has CI, Sonar Main Gate, CodeQL, and Secret Scan green; CD/deployment context is pending/external and waived only for deployment evidence.    |
| `next-slice.mjs` before this gate | Returned `blocked_requires_current_authority` / `umbrella_without_concrete_promoted_slice` with `activeSlice=null`.                                                |
| Architecture tracker              | `T-205b` is the canonical law-pack loader performance guard row: one pack load per country per warm isolate and no all-country JSON parse on transition checks.    |
| Operational Brain advisory        | Recommends `OBR-DG12` promote `T-205b` as the smallest valuable next candidate after `T-309`; broader UI, AI, M5, proxy, billing, and entity-migration work defer. |

## Candidate Ranking

| Rank | Candidate                                      | Decision   | Rationale                                                                                                                                                                                                             |
| ---- | ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-205b` law-pack loader performance guard     | Promote    | Smallest valuable next governed slice: it is test/performance-guard oriented, depends only on completed `SVC-CORE-b`, reinforces existing law-pack lazy loading, and avoids protected runtime architecture expansion. |
| 2    | `T-403` / AI posture chain                     | Defer      | Important but AI production posture requires consent/context contracts, evals, guardrails, review routing, and a higher-risk AI-specific design package; it is not the smallest post-`T-309` continuation.            |
| 3    | `T-310` dynamic theme tokens                   | Defer      | Product-facing branding and tenant-context token work can affect UI, routing/session interpretation, and cross-tenant brand-leak proof; it needs a separate design gate and is broader than this performance guard.   |
| 4    | `T-410` / `T-411` member UX libraries          | Defer      | Optimistic UI and Smart Next Step work are user-facing workflow/product slices with accessibility, i18n, and E2E obligations; they should not bypass the narrower law-pack loader guard.                              |
| 5    | `T-116` / `T-117` / `T-118` / `T-210` UI spine | Defer      | Unified dashboard, Crystal primitives, case summary registry, and event renderer work are broader frontend architecture/product changes with UI, performance, and accessibility gates.                                |
| 6    | Broad M5, proxy, billing, entity migration     | Reject now | Live cutover, routing/proxy, provider/billing, and entity-migration rows touch protected surfaces or broad milestone authority and remain unpromoted unless a later explicit design gate selects one bounded slice.   |

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-205b`.

`T-205b` goal: add focused proof that the law-pack loader performs one pack load
per country per warm isolate and does not parse or load all country JSON during
a transition or assistance check.

Implementation acceptance scope for the future worker:

- Assert one law-pack load per requested country per warm isolate.
- Assert transition and assistance checks do not trigger an all-country JSON
  parse or eager registry-wide load.
- Preserve the explicit incident-country law-pack path proven by `SVC-CORE-b`,
  `T-208`, and `T-208b`.
- Preserve typed unsupported-country behavior and the no-fallback boundary: no
  tenant, host, membership governing-law, booking-tenant, access-tenant, or
  ambient session fallback may pick a law pack.
- Keep the slice focused to test/performance guard evidence unless the
  implementation discovers a concrete loader defect that must be fixed to make
  the guard true.

Likely implementation surfaces for the future worker:

- Focused domain-recovery law-pack loader tests or guard helpers.
- Loader instrumentation or existing test seams needed to prove per-country
  warm-isolate behavior.
- No product UI, proxy, auth/session, tenancy model, schema/RLS, billing, AI, or
  Operational Brain runtime changes.

## Non-Goals

- No implementation in this design-gate PR.
- No Operational Brain runtime or product integration.
- No AI posture chain, broad M3/M4/M5, proxy/routing/auth, schema/RLS,
  billing/provider work, product redesign, entity migration, or next-slice
  runtime changes.
- No tenant, host, membership, booking, access-tenant, or ambient fallback for
  selecting recovery law packs.
- No README, AGENTS, architecture-doc rewrite, product/runtime code, tests,
  scripts, or `apps/web/src/proxy.ts` changes in this gate.

## Risk And Gate Plan For The Future T-205b Worker

Expected class: implementation.

Expected risk tier: likely Tier 1 because the slice should be a narrow
TEST/performance guard over existing law-pack loader behavior, outside UI,
auth, tenancy, routing, schema/RLS, billing, and AI trust surfaces. Escalate if
the worker changes runtime behavior beyond a minimal defect fix, touches shared
gate infrastructure, or reaches protected surfaces.

Focused acceptance proof should show:

- Per-country warm-isolate caching loads each requested country pack once.
- A transition or assistance check requests only its explicit incident country.
- Unsupported countries remain typed unsupported outcomes without fallback.
- No all-country JSON parse or eager registry-wide load appears in the checked
  paths.

The future worker should run focused domain tests first, then the normal Phase C
PR evidence required by the runner for the actual touched surface. It must not
claim broad runtime readiness from this Tier 0 gate.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
docs/tracker proof plus `git diff --check`.

Current evidence disposition: PR `#1130` and PR `#1131` are merged at the
recorded SHAs. Post-closeout `main` at
`1f7088579fc3a5da7bf46f3bab831017a42a0496` has CI, Sonar Main Gate, CodeQL, and
Secret Scan green. CD/deployment context is pending/external and waived only for
deployment evidence; that waiver does not cover CI, Sonar, CodeQL, security, or
future implementation proof.

## Exit State

Authority is reconciled after `T-309`; `T-205b` is the only promoted next
implementation slice. `T-403`, `T-310`, `T-410`, `T-411`, `T-116`, `T-117`,
`T-118`, `T-210`, broad M5, proxy/routing/auth, schema/RLS, billing/provider,
entity migration, product redesign, AI posture, Operational Brain runtime,
README, AGENTS, and broad architecture-doc work remain deferred unless
separately reauthorized.
