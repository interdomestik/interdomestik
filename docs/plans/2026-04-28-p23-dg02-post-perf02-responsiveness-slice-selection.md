# P23-DG02 Post-PERF02 Responsiveness Slice Selection

## Metadata

- Date: 2026-04-28
- Slice: `P23-DG02`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the next bounded `P23` implementation slice after `P23-PERF02` added staff claims queue route loading and deterministic search/filter pending feedback.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                                             | Finding                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                                  | `P23` remains active as the bounded post-go-live responsiveness tranche. `P23-PERF01`, `P23-DG01`, and `P23-PERF02` are complete; further P23 work requires bounded slice promotion rather than broad UI/UX redesign.                                                                             |
| `apps/web/src/app/[locale]/(staff)/staff/claims/_core.entry.tsx`, `staff-claims-controls.tsx`, and `loading.tsx`     | `P23-PERF02` consumed the rank-1 staff claims queue gap. Staff claims now has a route-level loading skeleton, explicit pending feedback for search/filter transitions, and blocked overlapping primary navigations.                                                                               |
| `apps/web/src/components/admin/claims/claims-filters.tsx`                                                            | The canonical admin claims queue uses client-side `router.replace` for status tabs, assignment filters, origin filters, and search changes without an explicit pending/disabled contract. Search updates route state on every change, so slow server transitions can still look inert or jittery. |
| `apps/web/src/app/[locale]/admin/claims/loading.tsx`                                                                 | The admin claims route already has route-level loading feedback, so the remaining weakness is the filter-control pending contract rather than the route skeleton itself.                                                                                                                          |
| `apps/web/src/components/ops/OpsFiltersBar.tsx`                                                                      | The shared operations filter bar exposes tabs and search inputs but does not currently model pending state. A future implementation should be narrow and avoid changing unrelated operation surfaces unless a small backward-compatible prop extension is the least risky path.                   |
| `apps/web/src/app/[locale]/(agent)/agent/crm/loading.tsx` and `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` | Agent CRM already has route-level loading and is a KPI/read surface rather than the highest-volume operations queue. Broad CRM redesign remains explicitly out of scope.                                                                                                                          |
| `apps/web/src/app/[locale]/(agent)/agent/claims/page.tsx`                                                            | Agent claims navigation is simpler and already benefits from the authenticated shell feedback; no search/filter queue contract is present to harden before admin operations.                                                                                                                      |
| `apps/web/src/components/dashboard/claims/member-claims-table.tsx`                                                   | Member claims pagination and data loading are valid later candidates, but member/admin shells already received P23-PERF01 coverage and staff/admin operations are more launch-critical.                                                                                                           |

## Candidate Ranking

| Rank | Candidate                                                                                          | Decision                                                                                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Admin claims filter responsiveness                                                                 | Promote. The admin claims queue is launch-critical, already has route loading, and still has weak local pending semantics for search, status, assignment, and origin transitions.                  |
| 2    | Member claims pagination and filter responsiveness                                                 | Do not promote now. Valid later candidate, but the member shell already received P23-PERF01 coverage and admin operations have higher launch-critical review density.                              |
| 3    | Agent claims navigation responsiveness                                                             | Do not promote now. Agent claims has simpler navigation, no active search/filter queue controls, and shared shell feedback already applies.                                                        |
| 4    | Agent CRM responsiveness                                                                           | Do not promote now. Agent CRM has route-level loading; broad CRM redesign and agent-workspace redesign remain deferred unless a later design gate promotes them.                                   |
| 5    | Shared `OpsFiltersBar` redesign                                                                    | Not promoted as a standalone slice. A future admin implementation may use a small backward-compatible prop extension if necessary, but a broad shared operations-control redesign is out of scope. |
| 6    | Broad UI/UX redesign, CRM redesign, agent-workspace redesign, or product analytics instrumentation | Not promoted. The tracker explicitly forbids broad redesign or analytics expansion without a separate repo-canonical design gate and stronger evidence.                                            |

## Decision

Promote `P23-PERF03 Admin Claims Filter Responsiveness` as the next bounded implementation slice.

## P23-PERF03 Acceptance Criteria

- Add deterministic pending feedback for the existing canonical `/admin/claims` status, assignment, origin, and search transitions where current feedback is absent or weak.
- Preserve current admin session, role access, query semantics, list DTO, tenant/data-access behavior, readiness markers, route shape, and visual hierarchy.
- Avoid route-loading duplication; `/admin/claims/loading.tsx` already exists, so the implementation should focus on local control feedback and overlapping-transition behavior.
- Authorized admin happy paths remain behavior-compatible.
- Add focused component/unit proof for the admin claims filter responsiveness contract, including active-filter inertness or overlap prevention where applicable.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, portal structure, schema, Stripe posture, CRM, agent-workspace, product analytics, README, AGENTS, or architecture docs.

## Suggested Branch

`codex/p23-perf03-admin-claims-filter-responsiveness`

## Verification Standard

- Focused component/unit tests first.
- Changed-file lint and web type-check.
- Deterministic local gates appropriate to the changed files.
- `pnpm verify-slice -- --static`.
- Pre-PR reviewer pool.
- Fix all must-fix findings.
- `pnpm verify-slice -- --required-gates`.
- After merge, sync `main` and run a post-merge validation pass on the merged commit.
