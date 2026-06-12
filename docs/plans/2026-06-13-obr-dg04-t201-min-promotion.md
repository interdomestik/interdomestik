# OBR-DG04 T-201-MIN Promotion Gate

Status: complete
Slice: `OBR-DG04`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-13
Authority: explicit design gate after verified `T-108-MIN` and `T-113`
closeout.

## Scope Boundary

This is a design-gate and promotion slice only. It promotes the smallest M2
case/recovery package-boundary foundation, `T-201-MIN`, and does not implement
runtime code, schema, migration, RLS, route, proxy, auth, tenancy, billing, AI,
UI, README, AGENTS, or broad architecture-document changes.

`apps/web/src/proxy.ts` remains read-only, canonical `/member`, `/agent`,
`/staff`, and `/admin` routes remain fixed, clarity markers remain contractual,
and Paddle remains the V3 pilot billing provider.

## Source Inputs

| Evidence                                                     | Finding                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/plans/2026-06-12-obr-dg03-t108-min-promotion.md`       | After verified `T-108-MIN` and `T-113`, the intended governed sequence proceeds to `OBR-DG04` to promote `T-201-MIN`.                                                          |
| `T-108-MIN` closeout proof                                   | PR `#1024` / squash merge `50af5e27` proved `ida.*` can resolve to a real no-tenant public context with no tenant cookie and neutral no-tenant branding.                       |
| `T-113` closeout proof                                       | PR `#1025` / squash merge `d78ebea0` added nullable `users.residence_country` with ISO-2 proof and no tenant/host inference.                                                   |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md` | `T-201` depends on completed `T-103` and requires `domain-case` and `domain-recovery` package boundaries while keeping the physical `claims` table.                            |
| `docs/plans/current-program.md`                              | `T-201/T-202` requires explicit design-gate reauthorization because its primary acceptance criterion is structural package-boundary work rather than a direct product surface. |

## Decision

Promote `T-201-MIN` as the next bounded runtime architecture slice.

`T-201-MIN` is the smallest safe reauthorization of `T-201` because it creates
the package-boundary foundation needed before recovery-law routing, billing
bridges, membership/recovery invoicing binding, and cross-jurisdiction handoff
work. It must not attempt the full M2 rewrite in one slice.

## Candidate Ranking

| Rank | Candidate                                     | Decision               | Rationale                                                                                                                                                 |
| ---- | --------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-201-MIN` case/recovery package boundary    | Promote                | Required by `T-208`, `T-204`, and `T-209`; can be bounded to package skeletons, public contracts, compatibility facade, and static no-cross-import proof. |
| 2    | `T-208` recovery-law routing                  | Next after `T-201-MIN` | Still depends on `T-201`; should not resolve recovery law or recovery legal tenant before package boundaries exist.                                       |
| 3    | `SVC-CORE-b` then `T-208b`                    | Later or blocker       | `T-208b` depends on both `T-208` and `SVC-CORE-b`; after `T-208`, record blocker if service-core prerequisites are not promoted and green.                |
| 4    | Finish needed `T-105` coverage                | Conditional            | Needed only if `T-204` verification exposes missing event-family or audit-projection coverage; do not expand now.                                         |
| 5    | `T-204` success-fee billing bridge            | Blocked after `T-201`  | Depends on `T-105` and `T-201`; billing/event semantics must wait for the package boundary and any needed event coverage.                                 |
| 6    | `T-408` membership/recovery invoicing binding | Blocked later          | Depends on `T-112`, `T-208`, and `T-204`, so it cannot precede recovery-law and success-fee bridge work.                                                  |
| 7    | `T-209` cross-jurisdiction handoff            | Blocked until `T-302b` | Depends on `T-105`, `T-201`, and `T-302b`; must remain blocked until case-scoped access semantics are available.                                          |

## Promoted Slice Contract

`T-201-MIN` must be limited to the minimum viable package-boundary foundation:

- Create or expose `domain-case` and `domain-recovery` package boundaries with
  explicit public entrypoints.
- Keep the physical `claims` table and existing `domain-claims` compatibility
  imports intact.
- Move or duplicate only boundary-neutral types/helpers needed to compile the
  new entrypoints; do not move active write paths unless the move is purely
  mechanical and covered by compatibility tests.
- Prove `domain-case` has no imports from `domain-recovery` and
  `domain-recovery` has no imports from `domain-case` except through an
  explicitly shared neutral contract.
- Add focused static/build/type tests proving package exports, compatibility,
  and no cross-boundary import leakage.
- Preserve `status` as authoritative through M2; do not make
  `case_lifecycle_state` or `recovery_lifecycle_state` authoritative.

## Non-Goals

- No full `T-201` rewrite, `T-202`, `T-203`, `T-204`, `T-205`, `T-206`,
  `T-207`, `T-208`, `T-208b`, `SVC-CORE-b`, `T-105`, `T-408`, `T-209`,
  `T-302b`, M3, M5, WS-F, OMG, DOM, or dashboard redesign work.
- No schema, migration, RLS, route, proxy, auth/session, tenancy, Paddle
  webhook, billing-code, AI, README, AGENTS, or broad architecture-document
  changes in this gate.
- No package split that breaks existing `@interdomestik/domain-claims`
  consumers.
- No assertion that counsel, commercial validation, paid acquisition,
  fee-collection readiness, restore drill completion, or incident-free
  operating readiness is complete.

## Follow-On Sequence

After `T-201-MIN` is merged and verified, the intended governed sequence is:

`T-208` -> `SVC-CORE-b` then `T-208b`, or record blocker -> finish needed
`T-105` coverage if required -> `T-204` -> `T-408` -> `T-209` only after
`T-302b`, or record blocker.

Each step requires its own slice contract and verification; this gate only
promotes `T-201-MIN`.

## Acceptance Criteria

- `OBR-DG04` records the post-`T-108-MIN` and post-`T-113` decision and
  promotes only `T-201-MIN`.
- `current-program.md` and `current-tracker.md` point to `OBR-DG04` and the
  promoted `T-201-MIN` slice.
- Blockers for `T-208/T-208b`, `T-204`, `T-408`, and `T-209` remain explicit.
- No product runtime, schema, migration, RLS, route, proxy, auth, tenancy,
  billing-code, UI implementation, AI, README, AGENTS, or broad
  architecture-document file changes are made in this gate.
- Tier 0 docs/tracker verification passes: `git diff --check`,
  `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the canonical program/tracker references. Because this
gate makes no runtime or schema changes, rollback is documentation-only.
