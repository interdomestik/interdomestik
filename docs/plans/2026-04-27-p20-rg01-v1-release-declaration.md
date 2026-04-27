# P20-RG01 v1.0.0 Release Declaration And Version Authority

## Metadata

- Date: 2026-04-27
- Slice: `P20-RG01`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: reconcile the repo-canonical release declaration and version authority after `P20-DG01` selected the final bounded v1.0.0 governance slice.

## Declaration

Interdomestik repository release authority is now `v1.0.0`.

This declaration is bounded to repository version and program authority. It does not create a deployment event, tag, product redesign, route change, auth change, tenancy change, schema change, Stripe reintroduction, CRM workflow expansion, agent-workspace redesign, or product analytics scope.

Historical or operator documents that still mention earlier `v0.1.0` baselines are not release-version authority unless the live program or tracker explicitly promotes them as such. This slice intentionally does not rewrite non-authority documents outside the bounded release declaration and manifest surfaces.

## Evidence Basis

| Evidence                                                                                       | Relevance                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-expand-readiness-2026-04-15.md`                         | Records the bounded expand recommendation after stable operating evidence and strict metric checks.                                                                                                   |
| `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_pilot-ks-expand-readiness-2026-04-15.md`                    | Records met SLA, progression, decision, privacy, and incident thresholds, and states that expansion is defendable.                                                                                    |
| `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md` and `docs/pilot/V1_0_0_NEXT_STEPS.md`         | Require explicit bounded approval and evidence custody instead of implicit continuation.                                                                                                              |
| `P11`, `P13`, `P15`, `P16`, `P17`, `P18`, and `P19` entries in `docs/plans/current-tracker.md` | Record completed production proof, funnel completion, production-professionalism hardening, pilot re-review, maturity hardening, trust/activation, and CRM readiness/tenant-boundary hardening lines. |
| `P20-DG01` in `docs/plans/2026-04-27-p20-dg01-v1-release-declaration-gate.md`                  | Promotes exactly this release-governance slice after confirming the remaining gap is release/version authority, not feature work.                                                                     |
| Workspace `package.json` manifests                                                             | Carry the repo/app/package release-version authority and have been reconciled from `0.1.0` to `1.0.0` as part of this slice.                                                                          |

## Version Authority

The following manifest surfaces are release-version authority for this repository and now declare `1.0.0`:

- `package.json`
- `apps/web/package.json`
- `packages/*/package.json`

`pnpm-lock.yaml` is not manually edited for this declaration because pnpm lockfile importer entries in this repo do not carry workspace package `version` fields. Dependency specifiers remain unchanged.

## Scope Locks

- `apps/web/src/proxy.ts` remains untouched.
- Canonical routes remain unchanged.
- Auth layering remains unchanged.
- Tenancy architecture remains unchanged.
- Database schema remains unchanged.
- Stripe remains out of V3 pilot scope.
- Broad CRM and agent-workspace redesign remain post-v1.0.0 backlog work unless a later repo-canonical design gate promotes them.
- Product analytics instrumentation remains outside this release-authority slice.

## Verification Standard

The slice requires:

- a focused manifest scan proving all workspace release-version manifests declare `1.0.0`;
- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm verify-slice -- --static`;
- pre-PR reviewer pool;
- `pnpm verify-slice -- --required-gates`.
