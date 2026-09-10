---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-09-10
---

# Staff current-claim tenant-context design gate

> Status: promotion #1741 pending; runtime remains inactive until exact promotion merge.
> Slice: `STAFF-CURRENT-CLAIM-TENANT-CONTEXT`; Tier 3; product branch `codex/staff-current-claim-tenant-context`.
> Promotion base and prerequisite merge: `4b4bb609feb3aa55f58aa062e64ae4ee9ef9f7d6`. Prerequisite #1740 head: `594885985bf46d07f661fee0523b137908053ca6`.

## Outcome and exact scope

Read the current staff claim through the transaction supplied by the existing trusted
`withTenantContext` boundary while preserving the caller's tenant, claim, branch, assignment and
role predicates. The loader accepts the transaction client and uses that client's select chain.
Tenant identity continues to come from the validated session; no new client-controlled tenant input
is accepted. This is a focused read-context repair, not a status-workflow atomicity redesign.

Product writers, in hash-bound order:

- `packages/domain-claims/src/staff-claims/current-claim-record.test.ts`
- `packages/domain-claims/src/staff-claims/current-claim-record.ts`
- `packages/domain-claims/src/staff-claims/update-status.test.ts`
- `packages/domain-claims/src/staff-claims/update-status.ts`

Writer-map SHA-256: `1754dbc42a20b563be1181e7cb3a1dbabdfb5913f333d186f9973b60c52751be`. Closeout writers are only
`docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

## Acceptance

1. Focused RED proves the loader uses the supplied transaction and never the global database;
   GREEN implements that boundary.
2. Caller coverage proves the session-derived tenant context and callback transaction reach the
   loader. Existing out-of-scope, assignment, lifecycle and recovery denials remain intact.
3. Required focused domain tests, capacity/modularity checks, `pnpm pr:verify`,
   `pnpm security:guard`, and `pnpm e2e:gate` pass on the exact product head.
4. Same-head review, expected-head merge and protected-main health precede inactive closeout.
5. Trusted migration activation and a prospective baseline exist before product execution; only
   measured product use may earn trial 1/3.

## Promotion and capacity

This promotion writes exactly this gate, its sibling admission, current-program and current-tracker.
PR #1740 installed the exact writer exception and bounded allocations without activating runtime.
The `staff-current-claim-tenant-context-promotion` allocation caps this new gate at 4500 bytes and
the admission at 3000 bytes. Existing canonical projection paths retain their established owner.
PR #1741 is bound to base `4b4bb609feb3aa55f58aa062e64ae4ee9ef9f7d6` and must receive the exact owner COMMENTED marker generated from
its final head/tree and these artifact hashes. Promotion merge precedes migration activation because r20
requires a promoted slice. The expected product branch must not be created until the live r20 activation
receipt and prospective baseline/protocol are verified; branch absence keeps the repository resolver from
entering `active_implementation`. The repository resolver remains the sole product authority.

## Exclusions and rollback

Currency parsing, failed-run retry, shared tenant helpers, schema/RLS policy, routing/auth, provider,
billing, E2E collectors, architecture and M0-M5 nodes remain outside this slice. Before product
merge, discard only owned candidate changes. After merge, revert only the exact product merge and
restore inactive program/tracker if acceptance fails. Preserve T117C and unrelated repository state.
