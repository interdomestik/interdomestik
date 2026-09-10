---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-09-10
---

# Staff current-claim tenant-context design gate

> Status: promotion #1747 pending; runtime remains inactive until exact promotion merge.
> Slice: `STAFF-CURRENT-CLAIM-TENANT-CONTEXT`; Tier 3; product branch `codex/staff-current-claim-tenant-context`.
> Promotion base and prerequisite merge: `c3a560efeaf058fdbb9f20066f61aa533bbc6f2b`. Prerequisite #1746 head: `4d51e5ac4aaecd3c749d52f19a42559ec6e2313c`.

## Outcome and exact scope

Execute the staff status-change decision inside one trusted `withTenantContext` transaction. The
current-claim read, recovery agreement, subscription and allowance reads, transition, service usage
and assignment writes all use the supplied transaction. Tenant identity remains session-derived and
the existing claim, branch, assignment, role and lifecycle predicates remain enforced. Audit and
notification effects begin only after commit, so a rolled-back decision cannot publish success.

Product writers, in hash-bound order:

- `packages/domain-claims/src/staff-claims/current-claim-record.test.ts`
- `packages/domain-claims/src/staff-claims/current-claim-record.ts`
- `packages/domain-claims/src/staff-claims/matter-allowance.test.ts`
- `packages/domain-claims/src/staff-claims/matter-allowance.ts`
- `packages/domain-claims/src/staff-claims/update-status.test.ts`
- `packages/domain-claims/src/staff-claims/update-status.transaction.test.ts`
- `packages/domain-claims/src/staff-claims/update-status.ts`

Writer-map SHA-256: `621da1c635c4f90c9388103ab4afdca9acb3e2b691441b30b576232aa24a257d`. Closeout writers are only
`docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

## Acceptance

1. Focused tests prove every decision read and write uses the supplied tenant transaction.
2. Rollback coverage proves failed allowance or transition work leaves no partial status, usage or
   assignment persistence; post-commit effects do not run before commit.
3. Existing out-of-scope, assignment, lifecycle, recovery and allowance denials remain intact.
4. Required focused domain tests, capacity/modularity checks, `pnpm pr:verify`,
   `pnpm security:guard`, and `pnpm e2e:gate` pass on the exact product head.
5. Same-head review, expected-head merge and protected-main health precede closeout; only measured
   execution through the trusted Z620 provider may earn migration trial 1/3.

## Promotion and capacity

This promotion writes exactly this gate, its sibling admission, current-program and current-tracker.
PR #1746 installed the exact seven-path writer exception and bounded allocations without activating
runtime. PR #1747 is bound to base `c3a560efeaf058fdbb9f20066f61aa533bbc6f2b` and must receive the exact owner COMMENTED marker
generated from its final head/tree and these artifact hashes. Product PR #1744 remains unmerged until
the repository resolver recognizes this exact promotion and the live r20 activation binds its exact
base, head and tree. The repository resolver remains the sole product authority.

## Exclusions and rollback

Currency parsing, failed-run retry, shared tenant helpers, schema/RLS policy, routing/auth, provider,
billing, E2E collectors, architecture and M0-M5 nodes remain outside this slice. Before product
merge, discard only owned candidate changes. After merge, revert only the exact product merge and
restore inactive program/tracker if acceptance fails. Preserve T117C and unrelated repository state.
