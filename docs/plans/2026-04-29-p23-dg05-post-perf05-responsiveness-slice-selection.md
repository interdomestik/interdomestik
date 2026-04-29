# P23-DG05 Post-PERF05 Responsiveness Slice Selection

## Metadata

- Date: 2026-04-29
- Slice: `P23-DG05`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the next bounded `P23` implementation slice after `P23-PERF05` added deterministic pending feedback and inert in-flight controls to the admin users filters.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                                                   | Finding                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                                        | `P23` remains active as the bounded post-go-live responsiveness tranche. `P23-PERF05` is complete, and further P23 implementation work requires a new bounded design gate before implementation.                                                                                            |
| PR `#583`, merge commit `9d7f6583cc7a4aa1deffd15796127b9c4311394d`                                                         | `P23-PERF05` consumed the canonical `/admin/users` search, assignment, Link-backed role-tab, pagination, and viewport responsiveness gap while preserving route, query, auth, tenant, and access-control contracts.                                                                         |
| `apps/web/src/app/[locale]/(agent)/agent/clients/_core.entry.tsx`                                                          | `/agent/clients` is an active canonical agent surface. It server-renders the agent client list from the `search` query through `getAgentUsers({ search })` and composes the existing `AgentUsersFilters` control.                                                                           |
| `apps/web/src/components/agent/agent-users-filters.tsx`                                                                    | Agent clients search is URL-backed and active. It has debounce, controlled input state, `useTransition`, and a spinner, but still lacks the full P23 deterministic contract: explicit region busy state, screen-reader status feedback, inert in-flight search input, and same-query proof. |
| `apps/web/src/components/agent/agent-users-filters.test.tsx`                                                               | Existing tests only prove that the input renders and carries the expected class. They do not prove query preservation, pending feedback, inert in-flight behavior, or same-query no-op behavior.                                                                                            |
| `apps/web/src/features/agent/claims/components/AgentClaimsProPage.tsx`                                                     | Agent workspace claims filtering is local client state through `OpsFiltersBar`; drawer selection uses URL state, but this is not the same server search/filter transition gap as the already-addressed P23 surfaces.                                                                        |
| `apps/web/src/components/agent/agent-claims-filters.tsx` and `apps/web/src/components/agent/agent-claims-filters.test.tsx` | The legacy agent claims filter component has the weak URL-push pattern, but current route search still shows no active import into an active route. Promoting an unused component remains lower-confidence than an active canonical agent clients surface.                                  |
| `apps/web/src/components/ops/OpsFiltersBar.tsx`                                                                            | Shared operations filter controls already gained pending hooks through prior P23 work. Broad shared control redesign remains out of scope; any future implementation should stay local or use existing helpers only where directly needed.                                                  |

## Candidate Ranking

| Rank | Candidate                                                                                          | Decision                                                                                                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Agent clients search responsiveness                                                                | Promote. `/agent/clients` is an active canonical agent surface with server-query-backed search. Existing spinner feedback is useful, but it lacks the deterministic P23 pending, inertness, region busy, accessibility-status, query-preservation, and same-query proof contract. |
| 2    | Agent workspace claim drawer selection responsiveness                                              | Do not promote now. The remaining behavior is local filtering plus drawer URL selection, not a server search/filter transition gap.                                                                                                                                               |
| 3    | Legacy agent claims filters                                                                        | Do not promote now. The weak URL-push pattern exists, but the component is not currently wired into an active route.                                                                                                                                                              |
| 4    | Shared filter component redesign                                                                   | Not promoted as a standalone slice. Future implementation may reuse existing small helpers if directly needed for `/agent/clients`, but broad shared control redesign is out of scope.                                                                                            |
| 5    | Broad UI/UX redesign, CRM redesign, agent-workspace redesign, or product analytics instrumentation | Not promoted. The tracker explicitly forbids broad redesign or analytics expansion without a separate repo-canonical design gate and stronger evidence.                                                                                                                           |

## Decision

Promote `P23-PERF06 Agent Clients Search Responsiveness` as the next bounded implementation slice.

## P23-PERF06 Acceptance Criteria

- Add deterministic local pending feedback for the existing canonical `/agent/clients` search transition.
- Preserve current agent session and role access behavior, query semantics, client list behavior, tenant context, readiness markers, route shape, and visual hierarchy.
- Keep the active search control inert while an in-flight search transition is pending, and avoid redundant pending state for same-query actions.
- Preserve existing `search` query context and clear-search behavior.
- Add accessible pending status feedback and region busy semantics for the search/list filter region where applicable.
- Authorized agent happy paths remain behavior-compatible.
- Add focused component/unit proof for the agent clients search responsiveness contract, including query preservation, pending feedback, in-flight inertness, clear-search behavior, and same-query no-op behavior.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, portal structure, schema, Stripe posture, CRM, agent-workspace, product analytics, README, AGENTS, or architecture docs.

## Suggested Branch

`codex/p23-perf06-agent-clients-search-responsiveness`

## Verification Standard

- Focused component/unit tests first.
- Changed-file lint and web type-check.
- Deterministic local gates appropriate to the changed files.
- `pnpm verify-slice -- --static`.
- Pre-PR reviewer pool.
- Fix all must-fix findings.
- `pnpm verify-slice -- --required-gates`.
- After merge, sync `main` and run a post-merge validation pass on the merged commit.
