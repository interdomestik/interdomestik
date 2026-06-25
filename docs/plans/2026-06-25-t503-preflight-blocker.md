---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-25
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 T-503 preflight/blocker record. This document does not
> implement runtime, product, schema, RLS, migration, auth, tenancy, routing,
> billing, security, README, or AGENTS changes. It records why destructive
> `claims.status` removal remains stopped.

# T-503 Preflight Blocker

## Classification

Classified as promotion/design-gate evidence because this record only refreshes
current authority for the already-promoted `T-503` final M0-M5 slice.

Risk tier for this PR: Tier 0, because the changed surface is limited to
`docs/plans/**` current-authority and tracker documentation.

Risk tier for any later `T-503` implementation worker remains Tier 3 because it
would drop legacy `claims.status`, alter claim-state compatibility posture, and
require DB/RLS/migration, rollback, data-repair, observability, reviewer,
security, and explicit human approval or waiver evidence.

## Refreshed Evidence

| Area                    | Evidence                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch basis            | Worktree branch `codex/t-503-final-status-removal` was clean at `origin/main` SHA `cdea3a892d2bb6564c8bd286f9a26ced643f33be`, the merged `OBR-DG39` authority gate.                                                                                                                  |
| Resolver before blocker | `next-slice.mjs .` returned `ready`, `activeSlice=T-503`, class `implementation`, tier `3`, sourced from `docs/plans/current-tracker.md`.                                                                                                                                            |
| Main health             | Merged main at `cdea3a89` is green for CI `28149930314`, Sonar Main Gate `28149930260`, Secret Scan/gitleaks `28149930265`, CodeQL `28149929935`, and manual main Security/pnpm-audit `28150566626`.                                                                                 |
| CD/release evidence     | CD run `28149930266` for `cdea3a89` remains `pending` with zero jobs. The Actions runner API returned `total_count=0`, so this lane cannot currently produce production release-gate proof. GitHub deployment lookup for `cdea3a89` returned no deployment records.                  |
| Live endpoint evidence  | Public health checks from this worktree environment were blocked by DNS resolution failures for `app.interdomestik.com` and `staging.interdomestik.com`; no live production build-provenance proof is claimed from local curl.                                                       |
| Data quality            | Local/default DB lifecycle inventory after the existing non-destructive repair script reports `total=121`, `valid=121`, `invalid_lifecycle_pair=0`, `null_incomplete=0`, and `status_lifecycle_mismatch=0`. This is local/default DB proof only, not production release-cycle proof. |
| MCP status              | `interdomestik_qa.git_status_compact` is callable but bound to `/Users/arbenlila/development/interdomestik-crystal-home`, where it reports unrelated dirt. Worktree-scoped shell evidence is therefore authoritative for this blocker lane.                                          |

## Decision

Do not proceed with destructive `T-503` implementation yet.

The final M0-M5 candidate remains `T-503`, but current authority is blocked
until one of these is supplied:

1. A named qualifying production release-cycle after `T-202` and `T-503c`, with
   production release-gate/build-provenance evidence showing lifecycle-state
   reads and command-path lifecycle CAS ran long enough to make status removal
   safe.
2. An explicit written equivalent evidence approval naming the accepted
   substitute for that production release-cycle and the residual risk accepted
   before destructive migration work starts.

No replacement runtime slice is started by this blocker record. Fresh
current-authority resolution is required after release-cycle or equivalent
evidence exists.

## Non-Goals

- No destructive migration.
- No runtime source, tests, schema/RLS/migrations, proxy, routing, auth/session,
  tenancy runtime, billing, product UI, dependencies, README, AGENTS, or broad
  architecture-doc changes.
- No M6/product expansion, VONESA/SVC/CQRS/UI/UX work, Operational Brain
  runtime/live AI, Dependabot work, or broad architecture rewrite.
