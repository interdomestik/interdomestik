# P23-DG04 Post-PERF04 Responsiveness Slice Selection

## Metadata

- Date: 2026-04-29
- Slice: `P23-DG04`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the next bounded `P23` implementation slice after `P23-PERF04` added deterministic pending feedback to the member claims filters and pagination controls.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                                                             | Finding                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                                                  | `P23` remains active as the bounded post-go-live responsiveness tranche. `P23-PERF01` through `P23-PERF04` are complete; further P23 implementation work requires a new bounded design gate before implementation.                                                                                                                                                   |
| `apps/web/src/components/dashboard/claims/claims-filters.tsx` and `apps/web/src/components/dashboard/claims/member-claims-table.tsx` | `P23-PERF04` consumed the canonical member claims search, status, and pagination responsiveness gap with deterministic pending feedback, inert in-flight controls, overlap blocking, and same-query no-op coverage.                                                                                                                                                  |
| `apps/web/src/app/[locale]/admin/users/_core.entry.tsx`                                                                              | `/admin/users` is an existing canonical admin surface with server-side search, role, and assignment query handling, Link-backed role tabs, and user assignment operations.                                                                                                                                                                                           |
| `apps/web/src/components/admin/users-filters.tsx`                                                                                    | The admin users search and assignment controls still call `router.push` for URL-backed transitions, while role switching is driven by the surrounding Link-backed tabs when role badges are hidden. Together, the active controls still lack deterministic pending feedback, active-filter inertness, overlapping-navigation blocking, or same-query no-op behavior. |
| `apps/web/src/components/admin/users-table.tsx`                                                                                      | The admin users table preserves list query context into profile and alert links and has assignment mutation feedback, but the surrounding list filter transitions still lack the P23 pending/inert navigation contract.                                                                                                                                              |
| `apps/web/src/app/[locale]/(agent)/agent/clients/_core.entry.tsx` and `apps/web/src/components/agent/agent-users-filters.tsx`        | Agent clients search is an active route, but it already has debounce, controlled input state, `useTransition`, and spinner feedback for search-only transitions. It is a weaker next candidate than admin users because there are no role or assignment filter transitions.                                                                                          |
| `apps/web/src/features/agent/claims/components/AgentClaimsProPage.tsx`                                                               | Agent workspace claims filtering is local client state through `OpsFiltersBar`; drawer selection uses URL state, but this is not the same server search/filter transition gap.                                                                                                                                                                                       |
| `apps/web/src/components/agent/agent-claims-filters.tsx`                                                                             | The legacy agent claims filter component has the weak URL-push pattern, but current route search shows no active import of `AgentClaimsFilters`; promoting an unused component would be lower-confidence than an active admin surface.                                                                                                                               |
| `apps/web/src/components/ops/OpsFiltersBar.tsx`                                                                                      | Shared operations filter controls already gained pending hooks through P23-PERF03. A future implementation may reuse existing patterns locally, but broad shared control redesign remains out of scope.                                                                                                                                                              |

## Candidate Ranking

| Rank | Candidate                                                                                          | Decision                                                                                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Admin users filter responsiveness                                                                  | Promote. `/admin/users` is an active canonical operator surface, and its search and assignment router transitions plus Link-backed role tabs still lack deterministic pending feedback, active-filter inertness, overlap blocking, and same-query no-op behavior. |
| 2    | Agent clients search responsiveness                                                                | Do not promote now. It is active and useful, but it is search-only and already has debounce plus transition spinner feedback.                                                                                                                                     |
| 3    | Agent workspace claim drawer selection responsiveness                                              | Do not promote now. The remaining behavior is local filtering plus drawer URL selection, not a server search/filter transition gap.                                                                                                                               |
| 4    | Legacy agent claims filters                                                                        | Do not promote now. The weak URL-push pattern exists, but the component is not currently wired into an active route.                                                                                                                                              |
| 5    | Shared filter component redesign                                                                   | Not promoted as a standalone slice. Future implementation may use small local or shared helper changes if directly needed for `/admin/users`, but broad shared control redesign is out of scope.                                                                  |
| 6    | Broad UI/UX redesign, CRM redesign, agent-workspace redesign, or product analytics instrumentation | Not promoted. The tracker explicitly forbids broad redesign or analytics expansion without a separate repo-canonical design gate and stronger evidence.                                                                                                           |

## Decision

Promote `P23-PERF05 Admin Users Filter Responsiveness` as the next bounded implementation slice.

## P23-PERF05 Acceptance Criteria

- Add deterministic local pending feedback for the existing canonical `/admin/users` search, role, and assignment filter transitions where current feedback is absent or weak.
- Preserve current admin session and role access behavior, query semantics, user list behavior, assignment visibility, tenant context preservation, readiness markers, route shape, and visual hierarchy.
- Keep active and pending role, assignment, and search controls inert where applicable, and avoid redundant pending state for same-query actions.
- Preserve existing profile and alert-link query-context behavior from the users table.
- Authorized admin happy paths remain behavior-compatible.
- Add focused component/unit proof for the admin users filter responsiveness contract, including active-filter inertness or overlap prevention where applicable.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, portal structure, schema, Stripe posture, CRM, agent-workspace, product analytics, README, AGENTS, or architecture docs.

## Suggested Branch

`codex/p23-perf05-admin-users-filter-responsiveness`

## Verification Standard

- Focused component/unit tests first.
- Changed-file lint and web type-check.
- Deterministic local gates appropriate to the changed files.
- `pnpm verify-slice -- --static`.
- Pre-PR reviewer pool.
- Fix all must-fix findings.
- `pnpm verify-slice -- --required-gates`.
- After merge, sync `main` and run a post-merge validation pass on the merged commit.
