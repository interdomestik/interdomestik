# OBR-DG02 Entity Disclosure Promotion Gate

Status: complete
Slice: `OBR-DG02`
Owner: platform + commercial + qa
Phase: Phase C
Date: 2026-06-12
Authority: explicit design gate after `OBR-COMMIT` closeout.

## Scope Boundary

This is a design-gate and promotion slice only. It promotes the next smallest
Operating-Business Readiness runtime slice, `T-407`, and does not implement
runtime code, schema, migration, RLS, route, proxy, auth, tenancy, billing, AI,
UI, README, AGENTS, or broad architecture-document changes.

`apps/web/src/proxy.ts` remains read-only, canonical `/member`, `/agent`,
`/staff`, and `/admin` routes remain fixed, clarity markers remain contractual,
and Paddle remains the V3 pilot billing provider.

## Source Inputs

| Evidence                                                     | Finding                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/plans/current-program.md`                              | `OBR-COMMIT` is complete as a blocker-record closeout, but no replacement runtime slice is promoted yet.                                                                                                           |
| `docs/plans/current-tracker.md`                              | `T-113` remains blocked on non-promoted `T-108`; `T-204`, `T-208/T-208b`, and `T-209` remain blocked on later structural/M2 work.                                                                                  |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md` | `T-407` depends only on completed `T-112` and renders contracting company plus governing law at signup, membership, and invoice surfaces from `legal_tenant_id` + `governing_law`; missing disclosure fails tests. |
| `T-112` closeout proof                                       | Subscription entity-of-record foundation is complete in PR `#997`, including `legal_tenant_id`, `billing_entity`, `governing_law_snapshot`, and `terms_version_accepted` on `subscriptions`.                       |

## Decision

Promote `T-407` as the next bounded runtime architecture slice.

`T-407` directly improves public trust and legal/entity correctness without
requiring `T-108`, `T-201`, `T-105`, `T-302b`, or billing event semantics. It is
the smallest OBR-eligible product-facing step now unblocked by completed `T-112`.

## Candidate Ranking

| Rank | Candidate                                     | Decision      | Rationale                                                                                                                                                          |
| ---- | --------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `T-407` entity disclosure surfaces            | Promote       | Depends only on completed `T-112`; improves legal/entity correctness and public trust; avoids blocked route, case/recovery, billing-event, and access-tenant work. |
| 2    | `T-108-MIN` ida-host public context           | Defer to DG03 | Still routing/tenant-context adjacent and needs its own explicit reauthorization before `T-113`.                                                                   |
| 3    | `T-113` residence-country field               | Blocked       | Depends on non-promoted `T-108`.                                                                                                                                   |
| 4    | `T-201-MIN` case/recovery package boundary    | Defer to DG04 | Promotable only through a separate bounded M2 design gate after the T-407/T-108/T-113 sequence is resolved.                                                        |
| 5    | `T-208/T-208b` recovery-law routing           | Blocked       | `T-208` depends on `T-201`; `T-208b` also depends on `SVC-CORE-b`.                                                                                                 |
| 6    | `T-204` success-fee billing bridge            | Blocked       | Depends on `T-105` and `T-201`; broader event-family coverage remains WIP.                                                                                         |
| 7    | `T-209` cross-jurisdiction handoff            | Blocked       | Depends on `T-105`, `T-201`, and `T-302b`; it should remain blocked or separately re-gated until case-scoped access semantics are available.                       |
| 8    | `T-408` membership/recovery invoicing binding | Blocked later | Depends on `T-112`, `T-208`, and `T-204`, so it cannot precede recovery-law and success-fee billing bridge work.                                                   |

## Promoted Slice Contract

`T-407` must be limited to entity disclosure on signup, membership, and invoice
surfaces:

- Render contracting company and governing law from stored entity-of-record data.
- Use `subscriptions.legal_tenant_id` and `subscriptions.governing_law_snapshot`
  where subscription context exists.
- Use tenant governing-law/entity data only where no subscription context exists.
- Fail closed or show a bounded unavailable state when required disclosure data
  is missing.
- Add tests proving all three surfaces include disclosure and that missing
  disclosure fails the relevant contract.

## Non-Goals

- No `T-108`, `T-108-MIN`, `T-113`, `T-201`, `T-201-MIN`, `T-208`, `T-208b`,
  `SVC-CORE-b`, `T-105`, `T-204`, `T-408`, or `T-209` runtime work.
- No `apps/web/src/proxy.ts`, canonical route, auth/session, tenancy, schema,
  migration, RLS, Paddle webhook, or billing-entity derivation changes.
- No claim/recovery package split or cross-jurisdiction handoff.
- No assertion that counsel, commercial validation, paid acquisition,
  fee-collection readiness, restore drill completion, or incident-free
  operating readiness is complete.

## Follow-On Sequence

After `T-407` is merged and verified, the intended governed sequence is:

`OBR-DG03` to reauthorize/promote `T-108-MIN` -> `T-108-MIN` -> `T-113` ->
`OBR-DG04` to promote `T-201-MIN` -> `T-201-MIN` -> `T-208` ->
`SVC-CORE-b` then `T-208b`, or record blocker -> finish needed `T-105`
coverage if required -> `T-204` -> `T-408` -> `T-209` only after `T-302b`,
or record blocker.

Each step requires its own slice contract and verification; this gate only
promotes `T-407`.

## Acceptance Criteria

- `OBR-DG02` records the post-`OBR-COMMIT` decision and promotes only `T-407`.
- `current-program.md` and `current-tracker.md` point to `OBR-DG02` and the
  promoted `T-407` slice.
- Blockers for `T-108-MIN`, `T-113`, `T-201-MIN`, `T-208/T-208b`, `T-204`,
  `T-408`, and `T-209` remain explicit.
- No product runtime, schema, migration, RLS, route, proxy, auth, tenancy,
  billing-code, UI implementation, AI, README, AGENTS, or broad
  architecture-document file changes are made.
- Tier 0 docs/tracker verification passes: `git diff --check`,
  `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the canonical program/tracker references. Because this
gate makes no runtime or schema changes, rollback is documentation-only.
