---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-09-10
---

# Staff current-claim tenant-context design gate

> Status: promotion #1749 pending; runtime remains inactive until exact promotion merge.
> Slice: `STAFF-CURRENT-CLAIM-TENANT-CONTEXT`; Tier 3; product branch `codex/staff-current-claim-tenant-context`.
> Promotion base and prerequisite merge: `3c89a6520094f9badab3b528e80c444a831d34c5`. Prerequisite #1748 head: `f515ff5bfcf9b30bf6d9a9fd5548b731cbaf0974`.

## Outcome and exact scope

Execute the staff status-change decision inside one trusted `withTenantContext` transaction. The
current-claim read, recovery agreement, subscription and allowance reads, transition, service usage
and assignment writes all use the supplied transaction. A subscription-scoped transaction lock
serializes allowance decisions before counting usage. Tenant identity remains session-derived and the
existing claim, branch, assignment, role and lifecycle predicates remain enforced. Audit and
notification effects begin only after commit, so a rolled-back decision cannot publish success.

Product writers, in hash-bound order:

- `apps/web/src/actions/staff-claims/update-status.test.ts`
- `packages/domain-claims/src/staff-claims/current-claim-record.test.ts`
- `packages/domain-claims/src/staff-claims/current-claim-record.ts`
- `packages/domain-claims/src/staff-claims/matter-allowance.test.ts`
- `packages/domain-claims/src/staff-claims/matter-allowance.ts`
- `packages/domain-claims/src/staff-claims/update-status.test.ts`
- `packages/domain-claims/src/staff-claims/update-status.transaction.test.ts`
- `packages/domain-claims/src/staff-claims/update-status.ts`

Writer-map SHA-256: `4f32cf06a1b801bf5b59a1854f97ef516e40ffa5e3acc61a3b300c2b19dc7dec`. Closeout writers are only
`docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

## Acceptance

1. Focused tests prove every decision read and write uses the supplied tenant transaction.
2. A concurrent regression proves two claims cannot consume the same final subscription allowance;
   the second decision observes the first committed usage.
3. Rollback coverage proves failed allowance or transition work leaves no partial status, usage or
   assignment persistence; post-commit effects do not run before commit.
4. Existing out-of-scope, assignment, lifecycle, recovery and allowance denials remain intact.
5. Required focused domain and web-adapter tests, capacity/modularity checks, `pnpm pr:verify`,
   `pnpm security:guard`, and `pnpm e2e:gate` pass on the exact product head.
6. Same-head review, expected-head merge and protected-main health precede closeout; only measured
   execution through the trusted Z620 provider may earn migration trial 1/3.

## Promotion and capacity

This promotion writes exactly this gate, its sibling admission, current-program and current-tracker.
PR #1748 installed the exact eight-path writer exception and bounded allocations without activating
runtime. PR #1749 is bound to base `3c89a6520094f9badab3b528e80c444a831d34c5` and must receive the exact owner COMMENTED marker
generated from its final head/tree and these artifact hashes. Product PR #1744 remains unmerged until
the repository resolver recognizes this exact promotion and the live r20 activation binds its exact
base, head and tree. The repository resolver remains the sole product authority.

## Exclusions and rollback

Currency parsing, failed-run retry, shared tenant helpers, schema/RLS policy, routing/auth, provider,
billing, E2E collectors, architecture and M0-M5 nodes remain outside this slice. Before product
merge, discard only owned candidate changes. After merge, revert only the exact product merge and
restore inactive program/tracker if acceptance fails. Preserve T117C and unrelated repository state.
