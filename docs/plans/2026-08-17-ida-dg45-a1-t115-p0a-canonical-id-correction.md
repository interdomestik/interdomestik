---
document_id: IDA-DG45-A1-T115-P0A-CANONICAL-ID-CORRECTION
date: 2026-08-17
status: corrective_candidate_pending_exact_arben_approval
authority: advisory_until_exact_hash_approval_and_docs_only_canonical_merge
base_sha: f4f6b5f8d93bfa30fffbd0c9c94eae32b42926be
parent_gate: IDA-DG45-T115-P0A-CANONICAL-FRONT-DOOR
parent_gate_sha256: faed90a14251220b2092a830a8f44696d54877534ca9573e5aa699e2d5f3bc2e
runtime_authorized: false
product_mutation_authorized: false
deployment_authorized: false
production_authorized: false
---

# IDA-DG45-A1 — T-115 P0A canonical identifier correction

## Exact defect

After Arben exact-approved the immutable 16,491-byte parent gate at SHA-256
`faed90a14251220b2092a830a8f44696d54877534ca9573e5aa699e2d5f3bc2e`, its
byte-identical materialization was tested against the current canonical resolver.
The proposed identifier `IDA-T115-P0a-CANONICAL-FRONT-DOOR` failed closed as
`invalid_canonical_authority`.

The global resolver deliberately rejects long mixed-case identifiers that can be
mistaken for opaque material. Its semantic slice grammar accepts the same bounded
identifier only when the P0 suffix is uppercase. This was discovered before
commit, push, PR, authority merge, runtime receipt, product branch or product
mutation. Main remains clean/synced at the parent base.

## Sole correction

The sole canonical slice identifier becomes:

`IDA-T115-P0A-CANONICAL-FRONT-DOOR`

The parent gate remains byte-identical and historical references may retain its
original proposed spelling. Every new canonical program/tracker/resolver,
admission, UI/UX, runtime, branch, PR and closeout identity must use the uppercase
`P0A` spelling. The lowercase spelling is an invalid proposal alias and must never
be used as active authority or runtime identity.

## Unchanged contract

This correction changes no product outcome, risk tier, behavior, metric, TDD,
writer path, proof surface, shared consumer, environment, reviewer disposition,
rollback, exclusion, stop condition or journey-tree position from the approved
parent gate.

The sole product outcome remains: make the already-built Help Now and
resolved-member `HomePageRuntime` composition the only repository-controlled
locale-root landing. The frozen future product writer map remains exactly:

1. `apps/web/src/app/[locale]/page.tsx`
2. `apps/web/src/app/[locale]/page.test.tsx`
3. `apps/web/e2e/gate/public-locale-no-js-shell.spec.ts`

The conditional deterministic size-budget metadata rule remains unchanged.
Session-pending skeleton, Hero redesign, dashboard work, routes/proxy,
auth/session, tenancy, draft/recovery internals, membership logic, analytics
implementation, CI, deployment, production and every second slice remain
excluded.

## Evidence and reviewer disposition

- Parent approval: exact 16,491 bytes / SHA-256
  `faed90a14251220b2092a830a8f44696d54877534ca9573e5aa699e2d5f3bc2e` on
  base `f4f6b5f8d93bfa30fffbd0c9c94eae32b42926be`.
- Parent admission: `ready`, SHA-256
  `806d53fc54a089ebb3554c6804272c554134db0256d56330b6508ac187ba2f67`.
- Parent UI/UX receipt: `pass`, SHA-256
  `bb3c4be0cf337a89403d60c36ffb250a9f4f477743c5d660f97090789f227af9`.
- Opus 5: `REVISE` in 571.350 seconds; findings addressed and no final model
  PASS claimed. Identifier casing was not a product/design finding and this
  mechanical correction does not invalidate that substantive review.
- Exact resolver probe with the lowercase canonical marker: fail-closed
  `invalid_canonical_authority`, `activeSlice=null`.

After exact approval, rebind the external admission and UI/UX receipts to the
uppercase canonical ID, run their validators, materialize this A1 alongside the
unchanged parent gate, and rerun resolver/scorecard. A result other than exactly
`awaiting_runtime_authority`, active slice
`IDA-T115-P0A-CANONICAL-FRONT-DOOR`, `runtime_authorized:false` is a hard stop.

## Authority boundary

This A1 grants only docs-only identifier correction and promotion materialization.
It grants no product branch, worktree, active execution, product session, runtime,
deployment or production authority. A separate content-addressed runtime receipt
on exact merged main remains mandatory.

Rollback before merge is dropping the unmerged docs-only authority worktree.
Rollback after authority merge is reverting only the docs-only authority merge;
there is no data or runtime rollback.
