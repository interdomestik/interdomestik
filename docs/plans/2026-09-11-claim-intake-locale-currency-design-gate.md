---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-09-11
---

# Claim intake locale currency design gate

> Status: promotion #1753 pending; runtime remains inactive until its exact merge.
> Slice: `MIGRATION-CURRENCY-PARSING-TRIAL-1`; Tier 3; product branch
> `codex/claim-intake-locale-currency`; promotion base
> `4acbba33e40ad4aa8b50f504149f25684f3380d9`.

## Outcome and scope

Claim intake converts plain whole amounts and one decimal separator without changing the extracted
currency: `650`, `650.50`, and `650,50` become their correct numeric values. Empty, non-finite,
mixed-separator, grouped, and otherwise ambiguous strings resolve to `0` and preserve the existing
warning path. Because extraction supplies no locale, this slice does not guess whether `1,234` is a
grouped integer or a decimal.

Product writers, in hash-bound order:

- `packages/domain-ai/src/claims/intake-extract.test.ts`
- `packages/domain-ai/src/claims/intake-extract.ts`

Writer-map SHA-256: `d28e9bef19d9188ef963605909c009b333c4cab242fb15f61521f5ade5ba7d5b`.
Closeout writers are only `docs/plans/current-program.md` and
`docs/plans/current-tracker.md`.

## Acceptance and migration credit

1. A table-driven focused test proves the accepted forms, finite numeric input, and fail-closed
   malformed or ambiguous forms.
2. `pnpm --filter @interdomestik/domain-ai test:unit --run src/claims/intake-extract.test.ts`,
   capacity/modularity checks, required exact-head PR evidence, and `pnpm security:guard` pass.
3. Before execution, a durable freeze binds the promotion merge as product base, final product head,
   merge-candidate tree, and lockfile SHA-256.
4. In a clean detached checkout, the admission command requires `HEAD=$FROZEN_HEAD`,
   `HEAD^{tree}=$FROZEN_TREE`, empty status, and `CI_LOCAL_HEAD_SHA=$FROZEN_HEAD` before the fixed
   `--lanes=e2e-pr` run. The task owns its database and port.
5. The retained receipt, result, redacted log, hashes, duration, and successful cleanup must match
   the frozen identity, and the result must report `lanes: "e2e-pr"`. Only then, after exact
   product merge, may closeout award trial 1/3.

## Promotion, exclusions, and rollback

This promotion writes exactly this gate, its admission, current-program, and current-tracker. PR
#1752 installed the exact two-path exception and bounded allocations without activating runtime.
The tracked-file delta is two because only the gate and admission are new; the canonical documents
already exist and are edited in place.
Promotion #1753 must receive the exact owner COMMENTED marker generated from its final head/tree and
these artifact hashes. Product work begins from the promotion merge only after the repository
resolver authorizes the exact branch.

`summary.ts`, `policy-analyzer.ts`, schemas, database/RLS, routing/auth, CI workflows, grouping
inference, retry logic, and later trials remain excluded. Before merge, discard only the owned
candidate. After merge, revert only the exact product merge and return program/tracker to inactive
if acceptance or cleanup fails.
