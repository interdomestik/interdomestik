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

# OBR-DG20: T-503 Readiness Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
plan and tracker authority after `T-406` closeout and decides whether `T-503`
can be promoted. Risk tier: Tier 0 because this PR touches only docs and tracker
authority.

## Authority Evidence

| Source                  | Evidence                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin/main`           | Revalidated at `3f60700de5f0f0caaee83d19220bc0c7b7d0f57f`, the PR `#1152` merge commit for `T-406` ADR closeout.                                                             |
| PR `#1152`              | Merged 2026-06-21; `T-406` authored ADR-07, ADR-08, and ADR-11 and promoted no replacement slice.                                                                            |
| `next-slice.mjs`        | On clean `origin/main`, returned `blocked_requires_current_authority`, `activeSlice=null`, reason `umbrella_without_concrete_promoted_slice`.                                |
| Architecture tracker    | `T-202` is complete through PR `#1104`, and `T-503` is TODO with acceptance requiring release-cycle evidence before dropping legacy `status`.                                |
| Current tracker/program | `T-202` says lifecycle states are authoritative for reads, but legacy `status` removal still requires release-cycle dual-read evidence and fresh current-authority approval. |
| GitHub search           | No existing open PR for `codex/obr-dg20-t503-readiness-gate`; PR `#1152` is merged at the expected closeout SHA.                                                             |

## Candidate Ranking

| Rank | Candidate                                                                                                                           | Decision              | Rationale                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-503` readiness                                                                                                                   | Park pending evidence | Highest-value M5 candidate because `T-202` is complete, but current evidence does not attach a full release-cycle dual-read/dual-write proof package. Dropping legacy `status` would be destructive schema work without that proof. |
| 2    | `T-504` tenant entity split                                                                                                         | Defer                 | Larger architecture migration with legal-entity blast radius; it does not resolve the current `T-503` evidence prerequisite.                                                                                                        |
| 3    | `T-507` residence-change/DSR                                                                                                        | Defer                 | Product/legal workflow work that should follow a specific M5/entity-migration gate, not this status-spine readiness check.                                                                                                          |
| 4    | `T-501`, `T-502`, `T-505`, `T-506`, Operational Brain runtime, broad M5, proxy/routing, billing, entity migration, product redesign | Defer                 | Protected or broader runtime surfaces requiring separate authority and stronger gates. They are not the bounded next action after `T-406`.                                                                                          |

## Decision

Do not promote `T-503` implementation now.

`T-503` is explicitly parked until a fresh release-cycle evidence packet proves
that the system has run with lifecycle-state dual-read/dual-write behavior for
at least one release cycle and that all surviving `status` dependencies are
known, intentional compatibility surfaces or are removed before the drop.

The next bounded action is evidence gathering and current-authority follow-up,
not runtime implementation. That follow-up should attach:

- the release identifier or deployment window that satisfies the release-cycle
  requirement after `T-202`;
- proof that public, member, agent, staff, and admin reads use
  `case_lifecycle_state` plus `recovery_lifecycle_state` as authority;
- an inventory of remaining legacy `status` reads, writes, URL/filter inputs,
  DTO compatibility names, timeline/history/event compatibility, and transition
  command dependencies;
- an explicit destructive-migration rollback and data-repair plan for dropping
  `claims.status`;
- current-authority approval that either promotes exactly `T-503` as Tier 3
  schema/runtime work or keeps it parked with named blockers.

## Hard Boundaries

- `apps/web/src/proxy.ts` remains read-only.
- Canonical routes stay `/member`, `/agent`, `/staff`, and `/admin`.
- `*-page-ready` clarity markers remain contractual.
- Paddle remains the V3 pilot billing provider.
- No Operational Brain runtime, model/provider calls, prompts, outbox AI event
  implementation, broad M5, product UI redesign, entity migration, routing,
  auth/session, tenancy, schema, migration, RLS, billing, README, or AGENTS work
  is authorized by this gate.

## Verification Plan

Focused Tier 0 proof:

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs .`

Expected resolver result after this gate remains
`blocked_requires_current_authority` with `activeSlice=null`, because this record
does not promote a runtime implementation slice.

## Reviewer And Security Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no runtime or
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof plus scope audit.

## Exit State

Authority is reconciled after `T-406`. `T-503` remains the first readiness
candidate, but it is parked pending release-cycle evidence. The next action is a
bounded evidence/current-authority follow-up, not implementation.
