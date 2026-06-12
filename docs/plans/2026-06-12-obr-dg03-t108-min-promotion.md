# OBR-DG03 T-108-MIN Reauthorization Gate

Status: complete
Slice: `OBR-DG03`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-12
Authority: explicit design gate after verified `T-407` closeout.

## Scope Boundary

This is a design-gate and promotion slice only. It reauthorizes the smallest
ida-host foundation slice, `T-108-MIN`, and does not implement runtime code,
schema, migration, RLS, route, proxy, auth, tenancy, billing, AI, UI, README,
AGENTS, or broad architecture-document changes.

`apps/web/src/proxy.ts` remains read-only in this gate. The follow-on
`T-108-MIN` implementation is explicitly authorized to make only the minimal
proxy/tenant-resolution changes needed to prove `ida.*` can resolve to a real
public no-tenant context. Canonical `/member`, `/agent`, `/staff`, and `/admin`
routes remain fixed, clarity markers remain contractual, and Paddle remains the
V3 pilot billing provider.

## Source Inputs

| Evidence                                                             | Finding                                                                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-06-12-obr-dg02-t407-entity-disclosure-promotion.md` | After verified `T-407`, the intended governed sequence starts with `OBR-DG03` to reauthorize/promote `T-108-MIN`, then `T-108-MIN`, then `T-113`.           |
| `docs/plans/current-program.md`                                      | Ida-host work is not promotable without explicit reauthorization, because it is routing/tenant-context adjacent.                                            |
| `docs/plans/current-tracker.md`                                      | `T-113` remains blocked on non-promoted `T-108`; downstream `T-201-MIN`, `T-208/T-208b`, `T-204`, `T-408`, and `T-209` remain gated by later prerequisites. |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md`         | `T-108` requires `ida.*` to resolve to `{kind:'public'}` with no tenant cookie and neutral no-tenant branding; `T-113` depends on `T-108`.                  |

## Decision

Promote `T-108-MIN` as the next bounded runtime architecture slice.

`T-108-MIN` is the smallest safe reauthorization of the ida-host work because it
only proves a real no-tenant public context for `ida.*`. It unblocks the
follow-on residence-country slice, `T-113`, without flipping live login,
renaming canonical routes, changing country-host compatibility behavior, or
starting dashboard redesign work.

## Candidate Ranking

| Rank | Candidate                                     | Decision               | Rationale                                                                                                                                    |
| ---- | --------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-108-MIN` ida-host public context           | Promote                | Required before `T-113`; can be bounded to no-tenant public context proof and no tenant cookie on `ida.*`.                                   |
| 2    | `T-113` residence-country field               | Next after `T-108-MIN` | Still blocked until the minimal ida-host/no-tenant context proof lands.                                                                      |
| 3    | `T-201-MIN` case/recovery package boundary    | Defer to DG04          | Structural M2 boundary work needs its own design gate after the `T-108-MIN` -> `T-113` sequence.                                             |
| 4    | `T-208/T-208b` recovery-law routing           | Blocked                | `T-208` depends on `T-201`; `T-208b` also depends on `SVC-CORE-b`.                                                                           |
| 5    | `T-204` success-fee billing bridge            | Blocked                | Depends on `T-105` and `T-201`; broader event-family coverage remains WIP.                                                                   |
| 6    | `T-408` membership/recovery invoicing binding | Blocked later          | Depends on `T-112`, `T-208`, and `T-204`, so it cannot precede recovery-law and success-fee billing bridge work.                             |
| 7    | `T-209` cross-jurisdiction handoff            | Blocked                | Depends on `T-105`, `T-201`, and `T-302b`; it should remain blocked or separately re-gated until case-scoped access semantics are available. |

## Promoted Slice Contract

`T-108-MIN` must be limited to the minimal ida-host public context proof:

- Add or narrow the tenant-resolution model so `ida.*` can resolve to an
  explicit public/no-tenant result.
- Prove `ida.*` does not set a tenant cookie.
- Render only a neutral public shell or bounded skeleton on `ida.*`; no
  tenant-branded tokens, tenant logo, or tenant-specific copy before session
  context exists.
- Keep country hosts as compatibility behavior; no redirects, no live-login
  flip, and no `T-109`, `T-110`, `T-114`, `T-115`, or dashboard IA work.
- Preserve canonical `/member`, `/agent`, `/staff`, and `/admin` routes and all
  clarity markers.
- Add focused unit/E2E proof for `ida.localhost` or the configured `IDA_HOST`
  lane.

## Non-Goals

- No `T-113`, `T-201`, `T-201-MIN`, `T-208`, `T-208b`, `SVC-CORE-b`, `T-105`,
  `T-204`, `T-408`, `T-209`, `T-109`, `T-110`, `T-114`, `T-115`, M3, M5, WS-F,
  OMG, DOM, or dashboard redesign work.
- No schema, migration, RLS, billing, Paddle webhook, AI, README, AGENTS, or
  broad architecture-document changes in this gate.
- No assertion that counsel, commercial validation, paid acquisition,
  fee-collection readiness, restore drill completion, or incident-free
  operating readiness is complete.

## Follow-On Sequence

After `T-108-MIN` is merged and verified, the intended governed sequence is:

`T-113` -> `OBR-DG04` to promote `T-201-MIN` -> `T-201-MIN` -> `T-208` ->
`SVC-CORE-b` then `T-208b`, or record blocker -> finish needed `T-105`
coverage if required -> `T-204` -> `T-408` -> `T-209` only after `T-302b`,
or record blocker.

Each step requires its own slice contract and verification; this gate only
promotes `T-108-MIN`.

## Acceptance Criteria

- `OBR-DG03` records the post-`T-407` decision and promotes only `T-108-MIN`.
- `current-program.md` and `current-tracker.md` point to `OBR-DG03` and the
  promoted `T-108-MIN` slice.
- Blockers for `T-113`, `T-201-MIN`, `T-208/T-208b`, `T-204`, `T-408`, and
  `T-209` remain explicit.
- No product runtime, schema, migration, RLS, route, proxy, auth, tenancy,
  billing-code, UI implementation, AI, README, AGENTS, or broad
  architecture-document file changes are made in this gate.
- Tier 0 docs/tracker verification passes: `git diff --check`,
  `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the canonical program/tracker references. Because this
gate makes no runtime or schema changes, rollback is documentation-only.
