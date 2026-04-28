# P23-DG03 Post-PERF03 Responsiveness Slice Selection

## Metadata

- Date: 2026-04-29
- Slice: `P23-DG03`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the next bounded `P23` implementation slice after `P23-PERF03` added deterministic pending feedback to the admin claims filters.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                                                | Finding                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                                     | `P23` remains active as the bounded post-go-live responsiveness tranche. `P23-PERF01`, `P23-PERF02`, and `P23-PERF03` are complete; further P23 work requires a new bounded design gate before implementation.                                                                 |
| `apps/web/src/components/admin/claims/claims-filters.tsx`                                                               | `P23-PERF03` consumed the admin claims filter-control gap. The existing admin claims filters now expose pending feedback, busy state, active/pending inertness, overlapping filter blocking, and same-query search no-op behavior.                                             |
| `apps/web/src/components/dashboard/claims/claims-filters.tsx`                                                           | The canonical member claims filters still call `router.push` for status and search changes without local pending feedback, active-filter inertness, overlapping-navigation blocking, or same-query no-op behavior. Search currently pushes a URL update on every input change. |
| `apps/web/src/components/dashboard/claims/member-claims-table.tsx`                                                      | The member claims table fetches through React Query and shows a generic table loading state, but pagination links and filter-triggered query changes do not share a deterministic local control contract that tells members their action is in progress.                       |
| `apps/web/src/app/[locale]/(app)/member/claims/_core.entry.tsx`                                                         | `/member/claims` is an existing canonical member surface with session and role gating already in place. The remaining gap is client-side control responsiveness, not access control, route structure, or data model behavior.                                                  |
| `apps/web/src/features/agent/claims/components/AgentClaimsProPage.tsx`                                                  | Agent workspace claims filtering is local in-memory state through `OpsFiltersBar`; it is not a server transition/search-param gap and is lower risk than the member claims surface.                                                                                            |
| `apps/web/src/app/[locale]/(agent)/agent/claims/page.tsx` and `apps/web/src/app/[locale]/(agent)/agent/claims/_core.ts` | The legacy agent claims page is a grouped server-rendered list with simple links into the agent workspace; it does not expose the same active search/filter queue contract.                                                                                                    |
| `apps/web/src/components/admin/users-filters.tsx`                                                                       | Admin users filters have a similar URL-push shape, but they are not as launch-critical as claim handling and are outside the already-ranked P23 claims-operations responsiveness path.                                                                                         |
| `apps/web/src/components/ops/OpsFiltersBar.tsx`                                                                         | The shared operations filter bar already has pending and search-disabled props from P23-PERF03. A future implementation may reuse existing patterns, but broad shared filter-bar redesign remains out of scope.                                                                |

## Candidate Ranking

| Rank | Candidate                                                                                          | Decision                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Member claims filter and pagination responsiveness                                                 | Promote. `/member/claims` is a canonical live member surface; filters still push URL changes without deterministic local pending feedback, active-filter inertness, overlap blocking, or same-query no-op behavior. |
| 2    | Admin users filter responsiveness                                                                  | Do not promote now. The URL-push pattern is real, but claim surfaces have stronger live-traffic and support-pressure relevance than admin user directory filtering.                                                 |
| 3    | Agent workspace claims responsiveness                                                              | Do not promote now. Agent workspace claims filtering is local client state, and drawer selection is not the same search/filter transition gap.                                                                      |
| 4    | Legacy agent claims grouped-list responsiveness                                                    | Do not promote now. The surface is simpler, link-based, and lower priority than the canonical member claims queue.                                                                                                  |
| 5    | Shared filter component redesign                                                                   | Not promoted as a standalone slice. The next implementation may use small local or shared helper changes if they directly support `/member/claims`, but broad shared control redesign is out of scope.              |
| 6    | Broad UI/UX redesign, CRM redesign, agent-workspace redesign, or product analytics instrumentation | Not promoted. The tracker explicitly forbids broad redesign or analytics expansion without a separate repo-canonical design gate and stronger evidence.                                                             |

## Decision

Promote `P23-PERF04 Member Claims Filter Responsiveness` as the next bounded implementation slice.

## P23-PERF04 Acceptance Criteria

- Add deterministic local pending feedback for the existing canonical `/member/claims` status, search, and pagination transitions where current feedback is absent or weak.
- Preserve current member session and role access behavior, query semantics, API contract, table DTO, tenant/data-access behavior, readiness markers, route shape, and visual hierarchy.
- Keep active and pending filter/page controls inert where applicable, and avoid redundant pending state for same-query actions.
- Authorized member happy paths remain behavior-compatible.
- Add focused component/unit proof for the member claims filter and pagination responsiveness contract, including active-filter inertness or overlap prevention where applicable.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, portal structure, schema, Stripe posture, CRM, agent-workspace, product analytics, README, AGENTS, or architecture docs.

## Suggested Branch

`codex/p23-perf04-member-claims-filter-responsiveness`

## Verification Standard

- Focused component/unit tests first.
- Changed-file lint and web type-check.
- Deterministic local gates appropriate to the changed files.
- `pnpm verify-slice -- --static`.
- Pre-PR reviewer pool.
- Fix all must-fix findings.
- `pnpm verify-slice -- --required-gates`.
- After merge, sync `main` and run a post-merge validation pass on the merged commit.
