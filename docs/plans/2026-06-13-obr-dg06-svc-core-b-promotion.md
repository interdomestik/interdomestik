# OBR-DG06 SVC-CORE-b Promotion Gate

Status: complete
Slice: `OBR-DG06`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-13
Authority: explicit design gate after merged `T-208` and post-`T-208` blocker
record.

## Scope Boundary

This is a design-gate and promotion slice only. It promotes `SVC-CORE-b` as the
next bounded runtime architecture slice so the law-pack loader prerequisite can
be completed before returning to `T-208b`.

This gate does not implement runtime code, schema, migration, RLS, route, proxy,
auth, tenancy, billing, AI, UI, README, AGENTS, or broad architecture changes.

`apps/web/src/proxy.ts` remains read-only, canonical `/member`, `/agent`,
`/staff`, and `/admin` routes remain fixed, clarity markers remain contractual,
and Paddle remains the V3 pilot billing provider.

## Source Inputs

| Evidence                                                     | Finding                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#1031` / squash merge `a866b1c3`                         | `T-208` completed recovery-law routing and typed unsupported-jurisdiction outcomes.                                                               |
| `docs/plans/2026-06-13-post-t208-blocker-record.md`          | `T-208b` is blocked until `SVC-CORE-b` is complete; `T-204`, `T-209`, and `T-408` remain blocked by separate prerequisites.                       |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md` | `SVC-CORE-b` requires a law-pack registry with per-isolate promise caching, Zod schema validation, needed-country-only loading, and typed errors. |
| `docs/plans/current-program.md`                              | `SVC-CORE-b` is the next governed action after `T-208`.                                                                                           |

## Decision

Promote `SVC-CORE-b` as the next bounded runtime architecture slice.

`SVC-CORE-b` is now promotable because `T-208` is complete and `T-208b` cannot
be proven until the law-pack loader layer exists. This promotion is limited to
loader infrastructure and test proof; it does not promote service-rule runtime,
Help Now, dashboard cards, consent, document classification, success-fee
billing, handoff, access grants, or country-rule product flows.

## Promoted Slice Contract

`SVC-CORE-b` must be limited to law-pack registry infrastructure:

- Add a static loader map for the supported law-pack countries needed by the
  recovery/service-rule spine.
- Add `loadLawPack(country)` with a per-warm-isolate promise cache.
- Validate loaded packs with a Zod schema before returning them.
- Load only the requested country/pack; no all-country eager parse on a normal
  load path.
- Return or throw a typed unsupported-country error for unsupported countries.
- Prove the loader never defaults from membership `legal_tenant_id`, booking
  tenant, host, access tenant, or any ambient session/tenant context.
- Keep rule execution pure over injected law-pack data; no route, proxy, auth,
  tenancy, billing, AI, UI, or database work.

## Non-Goals

- No `T-208b` implementation in this gate.
- No `SVC-CORE`, `SVC-06`, SVC product surface, Help Now, dashboard, consent,
  document-classification, or service-rule runtime implementation.
- No schema, migration, RLS, event/outbox, billing, Paddle, invoice,
  cross-jurisdiction handoff, case-scoped access grant, `T-204`, `T-209`,
  `T-408`, `T-302b`, M3, M4, M5, WS-F, OMG, DOM, route, proxy, auth/session,
  tenancy, AI, README, AGENTS, or broad architecture-document changes.
- No counsel, regulated-activity, commercial-validation, or paid-acquisition
  readiness claim.

## Candidate Ranking

| Rank | Candidate                                     | Decision         | Rationale                                                                                                                       |
| ---- | --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `SVC-CORE-b` law-pack registry                | Promote          | It is the direct blocker for `T-208b` and can be implemented without broad service-rule or product-surface scope.               |
| 2    | `T-208b` no-fallback law-pack proof           | Next after green | It depends on both `T-208` and `SVC-CORE-b`; return to it immediately after `SVC-CORE-b` merges.                                |
| 3    | `T-204` success-fee billing bridge            | Blocked          | Still depends on `T-105` and full `T-201`; do not bypass the event and package prerequisites.                                   |
| 4    | `T-408` membership/recovery invoicing binding | Blocked          | Still depends on `T-204`; recovery fee invoice binding cannot precede the success-fee event bridge.                             |
| 5    | `T-209` cross-jurisdiction handoff            | Blocked          | Still depends on `T-105`, full `T-201`, and `T-302b`; case-scoped access semantics are not available before access-tenant work. |

## Acceptance Criteria

- `OBR-DG06` records the post-`T-208` decision and promotes only
  `SVC-CORE-b`.
- `current-program.md` and `current-tracker.md` point to `OBR-DG06` and the
  promoted `SVC-CORE-b` slice.
- `T-208b` is recorded as the next governed action after `SVC-CORE-b` merges
  green.
- `T-204`, `T-209`, and `T-408` remain blocked by their existing prerequisites.
- No runtime, schema, migration, RLS, route, proxy, auth, tenancy, billing-code,
  UI, AI, README, AGENTS, or broad architecture files are changed in this gate.
- Tier 0 docs/tracker verification passes: `git diff --check`,
  `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the canonical program/tracker references. Because this
gate makes no runtime or schema changes, rollback is documentation-only.
