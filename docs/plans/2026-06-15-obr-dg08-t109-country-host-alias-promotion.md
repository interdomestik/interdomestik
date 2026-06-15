# OBR-DG08 T-109 Country Host Alias Promotion Gate

Status: complete
Slice: `OBR-DG08`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-15
Authority: explicit post-`T-308` runtime-selection and reauthorization gate.

## Scope Boundary

This is a design-gate and promotion slice only. It closes the post-`T-308`
selection gate and promotes exactly one next implementation goal from the
canonical architecture tracker: `T-109`.

This gate does not implement runtime code, schema, migration, RLS, route, proxy,
auth/session behavior, billing, AI, UI, README, AGENTS, or broad architecture
changes.

`apps/web/src/proxy.ts` remains read-only in this gate. The follow-on `T-109`
implementation must preserve canonical `/member`, `/agent`, `/staff`, and
`/admin` routes, contractual clarity markers, Supabase Auth / better-auth /
`@interdomestik/shared-auth` layering, and Paddle-only V3 pilot billing.

## Source Inputs

| Evidence                                                                                                                    | Finding                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md`                                                                                             | `T-308` is complete via ADR-05/ADR-09 closeout, `OBR-DG08` is the active reauthorization gate, and broad M3 / `ARCH-FINAL` / runtime work remains unpromoted unless this gate explicitly authorizes one bounded follow-on. |
| `docs/plans/current-tracker.md`                                                                                             | `OBR-DG08` may only decide whether exactly one bounded follow-on can be promoted; it authorizes no runtime work by itself.                                                                                                 |
| `docs/plans/architecture-finalization-tracker-2026-05-29.md`                                                                | `T-109` follows the completed `T-108-MIN` public/no-tenant proof and is the smallest ida-host/session-context continuation before `T-114`, `T-302`, `T-302b`, and `T-209`.                                                 |
| `docs/architecture/adr-05-attribution-read-only.md` and `docs/architecture/adr-09-role-separation-governance-boundaries.md` | The ADR closeout records attribution and role boundaries but does not promote tenant-context, routing, access-tenant, RLS, billing, or product work.                                                                       |

## Decision

Promote `T-109` as the next bounded implementation goal.

`T-109` is selected because the completed `T-108-MIN` proof established `ida.*`
as a real public/no-tenant context, while later tenant-context work still needs
the country-host alias discipline before canonical dashboard/auth setup and
four-context tenant resolution can safely proceed. This keeps the next step
bounded to host-as-alias drift reduction and does not promote broad M3.

`T-209` remains blocked on `T-302b`. `T-302b` remains blocked on the access-tenant
chain. `T-302` remains blocked until the ida/session setup path is explicitly
prepared through its prerequisites.

## Promoted Slice Contract

`T-109` must be limited to country-host alias discipline:

- Keep `ks`, `mk`, `al`, and `pilot` country hosts working as compatibility
  aliases.
- Treat country-host resolution as a booking/default hint, not tenant authority
  for new dashboard/auth flows.
- Block or guard new per-country host branching so future work does not revive
  host-as-tenant behavior.
- Preserve `ida.*` as the neutral public/no-tenant context established by
  `T-108-MIN`.
- Preserve existing canonical routes and clarity markers.
- Add focused proof for alias compatibility and the no-new-host-tenant-branch
  convention.
- If implementation evidence shows `apps/web/src/proxy.ts` must change, stop
  before editing it and record the narrow routing/access-control justification.

## Non-Goals

- No `T-110`, `T-114`, `T-115`, `T-302`, `T-302b`, `T-302c`, `T-302d`,
  `T-303`, `T-305`, `T-305b`, `T-307`, full M3, `T-209`, `T-202`, M5, AI
  posture, UI/UX overhaul, WS-F/G/H, OMG, DOM, CRM expansion, or product work.
- No route rename, live-login flip, country-host redirect, proxy rewrite,
  auth/session architecture change, tenancy architecture change, schema,
  migration, RLS, billing/Paddle change, AI behavior, UI implementation,
  README, AGENTS, or broad architecture-document change in this gate.
- No claim that `ARCH-FINAL` is itself an implementation slice.

## Candidate Ranking

| Rank | Candidate                                                          | Decision | Rationale                                                                                                  |
| ---- | ------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| 1    | `T-109` country-host alias discipline                              | Promote  | Smallest canonical follow-on after `T-108-MIN`; reduces host-as-tenant drift before `T-114` and `T-302`.   |
| 2    | `T-110` host telemetry                                             | Defer    | Useful observability, but does not unblock the canonical dashboard/auth setup path as directly as `T-109`. |
| 3    | `T-114` `ida.localhost` Playwright/local setup                     | Blocked  | Depends on the alias discipline in `T-109`; should not be promoted first.                                  |
| 4    | `T-302` four-context tenant resolver                               | Blocked  | Requires the ida/session setup chain; promoting it now would create broad M3 fallthrough.                  |
| 5    | `T-302b` access-tenant isolation and case-scoped grants            | Blocked  | Requires `T-302`, completed `T-301`, and handoff semantics; not available yet.                             |
| 6    | `T-209` cross-jurisdiction handoff                                 | Blocked  | Still requires `T-302b`; case-scoped access-grant semantics are not ready.                                 |
| 7    | Broad `ARCH-FINAL`, M3/M5/AI/UI/WS-F/G/H/OMG/DOM/product expansion | Reject   | Not a bounded implementation slice and not authorized by this gate.                                        |

## Acceptance Criteria

- `OBR-DG08` records the post-`T-308` decision.
- Exactly one next implementation goal is promoted: `T-109`.
- `T-209`, `T-302`, `T-302b`, broad M3, `ARCH-FINAL`, M5, and product expansion
  remain blocked or rejected unless separately reauthorized.
- `current-program.md`, `current-tracker.md`, and the architecture tracker record
  the `OBR-DG08` decision without changing runtime files.
- Tier 0 docs/tracker verification passes: `git diff --check`,
  `pnpm docs:verify`, `pnpm plan:status`, `pnpm plan:audit`, and
  `pnpm track:audit`.

## Rollback

Revert this document and the canonical program/tracker references. Because this
gate makes no runtime or schema changes, rollback is documentation-only.
