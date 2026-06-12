# OBR-DG05 T-208 Promotion Gate

Status: complete
Slice: `OBR-DG05`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-13
Authority: explicit design gate after verified `T-201-MIN` closeout.

## Scope Boundary

This is a design-gate and promotion slice only. It promotes `T-208` as the next
bounded runtime architecture slice and defines the implementation contract for
recovery-law routing after the minimum case/recovery package boundary exists.

This gate does not implement runtime code, schema, migration, RLS, route, proxy,
auth, tenancy, billing, AI, UI, README, AGENTS, or broad architecture-document
changes.

`apps/web/src/proxy.ts` remains read-only, canonical `/member`, `/agent`,
`/staff`, and `/admin` routes remain fixed, clarity markers remain contractual,
and Paddle remains the V3 pilot billing provider.

## Source Inputs

| Evidence                                                     | Finding                                                                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-06-13-obr-dg04-t201-min-promotion.md`       | After verified `T-201-MIN`, the intended governed sequence proceeds to `T-208`, then `SVC-CORE-b` and `T-208b` or a blocker.                         |
| `T-201-MIN` closeout proof                                   | PR `#1027` / squash merge `536c21b3` created `domain-case` and `domain-recovery` package boundaries while keeping physical `claims` compatibility.   |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md` | `T-208` depends on completed `T-101` and `T-201`, and requires explicit recovery law plus recovery legal tenant distinct from membership and access. |
| `docs/plans/current-program.md`                              | `T-208/T-208b` is OBR-eligible because it directly improves legal correctness and claim/recovery safety.                                             |

## Decision

Promote `T-208` as the next bounded runtime architecture slice.

`T-208` is now promotable because `T-101` provides explicit
`incident_country_code` and `T-201-MIN` provides the `domain-recovery` boundary
needed to own recovery-law resolution without expanding `domain-claims`.

## Promoted Slice Contract

`T-208` must be limited to recovery-law routing and recovery legal-tenant
selection:

- Add a deterministic `domain-recovery` recovery-law resolver that derives
  `recovery_law` from explicit `incident_country_code`.
- Persist or expose `recovery_law` and `recovery_legal_tenant_id` at the
  case/recovery level using additive, nullable compatibility-safe storage if
  current schema evidence shows no existing storage.
- Keep `recovery_legal_tenant_id` distinct from membership `legal_tenant_id`,
  tenant `governing_law`, booking tenant, host, and future `access_tenant_id`.
- Route unsupported or out-of-network incident countries to a typed
  `no_network_or_unsupported_jurisdiction` outcome with guidance-only posture
  and a `no_network` decline reason.
- Include a per-jurisdiction note flag showing recovery and success-fee work may
  be regulated and must not be treated as final legal advice.
- Prove unsupported countries never silently assume home law, membership law,
  booking tenant, host, or access tenant.
- Keep `status` authoritative through M2 and preserve existing
  `domain-claims` compatibility imports.

## Non-Goals

- No `T-208b`, `SVC-CORE-b`, `T-105`, `T-204`, `T-408`, `T-209`, `T-302b`,
  M3, M4, M5, WS-F, OMG, DOM, dashboard redesign, or law-pack-loader work.
- No new `legal_entities` table or replacement entity model; use the current
  tenant-backed legal-entity foundation until the tracker promotes that work.
- No RLS/access-tenant migration, case-scoped grant, cross-jurisdiction handoff,
  billing, Paddle, invoice, success-fee collection, route, proxy, auth/session,
  tenancy, AI, README, AGENTS, or broad architecture-document changes.
- No counsel, regulated-activity, commercial-validation, or paid-acquisition
  readiness claim.

## Candidate Ranking

| Rank | Candidate                                     | Decision               | Rationale                                                                                                                             |
| ---- | --------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-208` recovery-law routing                  | Promote                | Directly improves legal correctness and recovery safety now that explicit incident country and package boundaries exist.              |
| 2    | `SVC-CORE-b` law-pack registry                | Next or blocker        | Needed before `T-208b`; do not combine with `T-208` because loader caching/schema validation is separate service-rule infrastructure. |
| 3    | `T-208b` no-fallback law-pack proof           | Blocked                | Depends on both `T-208` and `SVC-CORE-b`; record blocker after `T-208` if service-core prerequisites are not promoted and green.      |
| 4    | Finish needed `T-105` coverage                | Conditional            | Only needed if later `T-204` verification exposes missing event-family or audit-projection coverage.                                  |
| 5    | `T-204` success-fee billing bridge            | Later                  | Depends on `T-105` and `T-201`; billing/event semantics should wait until recovery law and any needed event coverage are proven.      |
| 6    | `T-408` membership/recovery invoicing binding | Later                  | Depends on `T-112`, `T-208`, and `T-204`; cannot precede recovery-law and success-fee bridge work.                                    |
| 7    | `T-209` cross-jurisdiction handoff            | Blocked until `T-302b` | Depends on `T-105`, `T-201`, and `T-302b`; case-scoped access semantics are not available.                                            |

## Acceptance Criteria

- `OBR-DG05` records the post-`T-201-MIN` decision and promotes only `T-208`.
- `current-program.md` and `current-tracker.md` point to `OBR-DG05` and the
  promoted `T-208` slice.
- `T-208b`, `SVC-CORE-b`, `T-105`, `T-204`, `T-408`, and `T-209` remain
  sequenced or blocked as recorded above.
- No runtime, schema, migration, RLS, route, proxy, auth, tenancy, billing-code,
  UI, AI, README, AGENTS, or broad architecture-document files are changed in
  this gate.
- Tier 0 docs/tracker verification passes: `git diff --check`,
  `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the canonical program/tracker references. Because this
gate makes no runtime or schema changes, rollback is documentation-only.
