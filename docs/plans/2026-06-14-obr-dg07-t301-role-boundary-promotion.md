# OBR-DG07 T-301 Role Boundary Promotion Gate

Status: complete
Slice: `OBR-DG07`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-14
Authority: explicit post-`T-408` runtime-selection and reauthorization gate.

## Scope Boundary

This is a design-gate and promotion slice only. It closes the post-`T-408`
selection gate and promotes exactly one next implementation goal from the
canonical architecture tracker: `T-301`.

This gate does not implement runtime code, schema, migration, RLS, route, proxy,
auth/session behavior, billing, AI, UI, README, AGENTS, or broad architecture
changes.

`apps/web/src/proxy.ts` remains read-only, canonical `/member`, `/agent`,
`/staff`, and `/admin` routes remain fixed, clarity markers remain contractual,
and Paddle remains the V3 pilot billing provider.

## Source Inputs

| Evidence                                                             | Finding                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#1051` / squash merge `037fa75099a0f9e33e84605613eb8d65c5f991d8` | `T-408` completed Paddle membership invoicing/webhook snapshot binding and recovery success-fee invoicing by `recovery_legal_tenant_id`.                                                                                                                         |
| PR `#1052` / squash merge `afc3afb0e6d3daba4403db45ec6c068c8dcbeb01` | The tracker already records `T-408` closeout evidence and makes `OBR-DG07` the active governed goal.                                                                                                                                                             |
| `docs/plans/current-program.md`                                      | Operating-Business Readiness permits promotion only for work that directly improves legal/entity correctness, billing/revenue correctness, claim/recovery safety, tenant/privacy safety, auditability, public trust/pricing clarity, or commercial KPI evidence. |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md`         | `T-209` remains blocked on `T-302b`; `T-301` depends only on completed `T-006` and `T-006b` and directly improves least privilege, auditability, and tenant/privacy safety.                                                                                      |

## Decision

Promote `T-301` as the next bounded implementation goal.

This is the explicit reauthorization required by the Operating-Business
Readiness rule for a single M3 task. `T-301` is the smallest unblocked M3 entry
point that directly improves tenant/privacy safety and auditability through role
boundary de-collapse, separation-of-duties constraints, and audited
break-glass expectations.

`T-209` is not promotable yet because it still depends on `T-302b`.

## Promoted Slice Contract

`T-301` must be limited to role-boundary and governance proof:

- Separate technical `super_admin` from global governance and legal-entity
  administration responsibilities.
- Add or harden explicit `global_support` and `auditor` role/capability
  boundaries without granting broad admin mutation power.
- Prove `super_admin` cannot self-approve fees, payments, terms, or comparable
  governance/legal-entity decisions.
- Require break-glass use to carry reason, expiry, and audit evidence
  proportional to the existing auth/session layering.
- Preserve Supabase Auth as identity/session system of record, better-auth as
  orchestrator, and `@interdomestik/shared-auth` as the provider-agnostic
  boundary.
- Add focused tests and guard proof for the changed authz/role contracts.

## Non-Goals

- No `T-209` implementation.
- No `T-302`, `T-302b`, `T-302c`, `T-302d`, `T-303`, `T-304`, `T-305`,
  `T-305b`, `T-306`, `T-307`, or full M3 promotion.
- No `T-202`, M5, ida-host (`T-108/109/110/114`), AI posture chain, M1 UI/UX
  overhaul, WS-F/G/H, OMG, DOM, CRM expansion, or structural-only work.
- No route, proxy, canonical-route, auth/session architecture, tenancy
  architecture, schema/migration/RLS, billing/Paddle, AI, UI, README, AGENTS, or
  broad architecture-document changes.
- No new operational roles beyond the bounded `T-301` role-boundary proof unless
  a future gate supplies named owner/process evidence.

## Candidate Ranking

| Rank | Candidate                                                  | Decision | Rationale                                                                                                                |
| ---- | ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | `T-301` role de-collapse and governance boundaries         | Promote  | Unblocked by completed `T-006` and `T-006b`; directly improves least privilege, auditability, and tenant/privacy safety. |
| 2    | `T-209` cross-jurisdiction handoff                         | Blocked  | Still requires `T-302b`; case-scoped access-grant semantics are not available yet.                                       |
| 3    | `T-302b` access-tenant isolation and case-scoped grants    | Blocked  | Requires `T-302`, `T-301`, and the handoff semantics; not the smallest unblocked entry point.                            |
| 4    | `T-202` lifecycle read authority                           | Reject   | Structural state-machine authority work remains unpromoted under the OBR rule.                                           |
| 5    | M3/M5/ida-host/AI/UI/WS-F/G/H/OMG/DOM/structural-only work | Reject   | Not promoted except for the explicit `T-301` reauthorization in this gate.                                               |

## Acceptance Criteria

- `OBR-DG07` records `T-408` closeout with PR `#1051` evidence.
- `T-209` remains blocked on `T-302b`.
- Exactly one next implementation goal is promoted: `T-301`.
- `current-program.md`, `current-tracker.md`, and the architecture tracker
  record `OBR-DG07` as complete and `T-301` as the active next implementation
  goal.
- Tier 0 docs/tracker verification passes: `git diff --check`,
  `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the canonical program/tracker references. Because this
gate makes no runtime or schema changes, rollback is documentation-only.
