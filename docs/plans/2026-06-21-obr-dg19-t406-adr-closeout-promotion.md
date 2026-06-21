---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-21
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself.

# OBR-DG19: T-406 ADR Closeout Promotion

## Classification

Classified as promotion/design-gate because this record only reconciles current
plan and tracker authority after `T-405` closeout and promotes the next governed
implementation slice. Risk tier: Tier 0 because this PR touches only docs and
tracker authority.

## Authority Evidence

| Source                            | Evidence                                                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#1149`                        | `T-405` implementation merged at `df4b5c7e32383b8dc6f73bc41a9da07f178803e0` from final implementation head `ced6d1bd78e3fc8248d7bf5e4dd83b8c6f7a3df9`.                                                                                                            |
| PR `#1150`                        | `T-405` closeout merged at `1194240e5f7836244d7864c7990a92caad26123f`.                                                                                                                                                                                            |
| Worker worktree                   | Clean at `1194240e5f7836244d7864c7990a92caad26123f` before this gate; initial worktree was detached, then switched to `codex/obr-dg19-t406-gate` from `origin/main`.                                                                                              |
| Current main checks               | At supervisor revalidation time after `T-405` closeout, CI, CodeQL, Sonar Main Gate, and Secret Scan were green on `1194240e5f7836244d7864c7990a92caad26123f`; CD remained pending and is recorded as deployment-context friction, not Tier 0 readiness evidence. |
| `next-slice.mjs` before this gate | Returned `blocked_requires_current_authority` / `umbrella_without_concrete_promoted_slice` with `activeSlice=null`, so implementation remained blocked until a fresh authority record selected exactly one slice.                                                 |
| Architecture tracker              | `T-401`, `T-402`, `T-403`, `T-404a`, `T-404`, `T-403b`, `T-405`, `T-407`, and `T-408` are DONE; `T-406` remains TODO in M4 and is the smallest remaining M4 ADR closeout.                                                                                         |
| OP Brain advisory route           | The supervisor handoff records OP Brain advisory recommending exactly `T-406` because `T-405` completed the AI posture cleanup chain and `T-406` is now the smallest valuable ADR closeout. This gate accepts that recommendation.                                |

## Candidate Ranking

| Rank | Candidate                                                                  | Decision   | Rationale                                                                                                                                                                                               |
| ---- | -------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-406` ADR-07/ADR-08/ADR-11                                               | Promote    | Smallest valuable follow-up after `T-405`: records proven card-derived-view, AI-posture, and disclosure/tax binding decisions without changing runtime behavior.                                        |
| 2    | M5 live cutover tasks `T-501` through `T-507`                              | Reject now | M5 touches routing, legacy status removal, tenant/entity migration, billing/entity-of-record, and residence-change flows. Those broader protected surfaces need a later post-M4 readiness gate.         |
| 3    | Operational Brain runtime, provider/model calls, prompts, outbox AI events | Reject now | Current action is ADR closeout only. Runtime AI behavior, prompts, provider calls, AI event emission, and Operational Brain product integration need later explicit gates.                              |
| 4    | VONESA/WS-F, OMG, DOM, broad M3/M4/M5, proxy/routing/auth, billing         | Reject now | These are downstream or protected programs that either ride the architecture spine behind feature flags or depend on M3/M5 readiness. They are not the smallest current authority action after `T-405`. |

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-406`.

`T-406` goal: author ADR-07, ADR-08, and ADR-11 as docs-only architecture
decision records that close the M4 product-model decisions already proven by the
completed runtime slices.

Future `T-406` scope:

- ADR-07: card is a derived membership proof view for active and grace
  subscriptions; price-bearing offer data must not appear on proof/card outputs.
- ADR-08: AI calls require explicit trusted `AICallContext`; context must be
  mandatory, brand-minted by trusted privacy posture/consent code, and cleaned
  at current callers with no implicit defaults or structural fabrication.
- ADR-11: entity disclosure, tax, invoice, and contracting-law behavior are
  bound to the contracting entity and stored subscription/recovery snapshots.
- Keep the work docs/ADR only. Do not change runtime source, tests, schema,
  RLS, billing behavior, proxy/routing/auth, product UI, prompts, model calls,
  outbox AI events, or Operational Brain runtime.

Likely implementation surfaces:

- New or updated ADR files under `docs/architecture/`.
- Minimal current program/tracker and architecture tracker closeout updates
  required by the ADR-only slice.

## Acceptance Evidence For Future T-406

| Acceptance criterion        | Required proof                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-07 records card posture | ADR cites the completed card/proof hierarchy evidence and states proof/card outputs are derived views without price-bearing offer fields.                  |
| ADR-08 records AI posture   | ADR cites `T-403`, `T-404a`, `T-404`, `T-403b`, and `T-405` evidence and records mandatory trusted context without implicit/default/fabricated callers.    |
| ADR-11 records binding      | ADR cites entity disclosure and billing snapshot evidence from `T-407`/`T-408` and records contracting entity, governing law, tax, and invoice boundaries. |
| Scope remains ADR-only      | Diff contains no runtime source, tests, schema/RLS, proxy/routing/auth, billing behavior, product UI, model/provider calls, prompts, or Operational Brain. |

## Risk And Gate Plan For Future T-406

Expected class: promotion/design-gate or documentation/tracker-only ADR closeout.

Expected risk tier: Tier 0. The slice should remain docs/ADR only. If the worker
finds runtime changes are required, it must stop and ask the supervisor.

Expected future proof:

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `next-slice.mjs` after closeout, expecting no replacement slice unless a
  separate gate promotes one
- Scope audit proving protected runtime and forbidden documentation surfaces
  stayed untouched except the explicitly authorized ADR/current-authority docs

## Non-Goals

- No runtime/product implementation in this design-gate PR.
- No source, tests, package metadata, lockfiles, schema, migration, RLS, billing
  behavior, product UI, or implementation-worker changes in this gate.
- No `apps/web/src/proxy.ts`, canonical routes, auth/session, tenancy model,
  Paddle provider behavior, model/provider calls, prompts, outbox AI events, or
  Operational Brain runtime.
- No M5 live cutover, VONESA/WS-F, OMG, DOM, README, AGENTS, or broad
  architecture-doc rewrite in this gate.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof plus scope audit.

Current evidence disposition: PR `#1149` and PR `#1150` are merged at the
recorded SHAs. Post-closeout `main` at
`1194240e5f7836244d7864c7990a92caad26123f` has CI, Secret Scan, Sonar Main Gate,
and CodeQL green from main health revalidation; CD remains an external
deployment context and is not used as readiness evidence for this Tier 0 gate.

## Exit State

Authority is reconciled after `T-405`; `T-406` is the only promoted next
implementation slice. Operational Brain runtime, model/provider calls, prompts,
outbox AI events, broad M3/M4/M5, proxy/routing/auth, schema/RLS, billing,
product UI, entity migration, README, AGENTS, broad architecture-doc work,
VONESA/WS-F, OMG, and DOM remain deferred unless separately reauthorized.
