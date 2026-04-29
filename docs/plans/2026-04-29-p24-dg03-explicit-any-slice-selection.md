# P24-DG03 Explicit Any Slice Selection

## Metadata

- Date: 2026-04-29
- Slice: `P24-DG03`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the next bounded explicit-`any` lint-warning implementation slice after completed `P24-LINT02`.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

The next implementation slice must reduce explicit-`any` warnings without changing route, query, auth, tenant, schema, business, UI/UX, or access-control contracts.

## Evidence Reviewed

| Evidence                                                                                                                                                              | Finding                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                                                                                   | `P24-DG02` and `P24-LINT02` are complete. Further P24 explicit-`any` implementation requires a new repo-canonical design gate before implementation.                                                                                                                                                           |
| PR `#590`, merge commit `67dc4a99e1e072bfee019f400c859cdf3d2f5a94`                                                                                                    | `P24-LINT02` removed all `15` explicit-`any` warnings from `apps/web/src/actions/claims/submit.test.ts` without changing production code, lint policy, TypeScript configuration, route behavior, auth, tenancy, schema, Stripe, CRM, agent workspace, product analytics, README, AGENTS, or architecture docs. |
| `pnpm --filter @interdomestik/web exec eslint . --format json` after `P24-LINT02`                                                                                     | Lint reports `0` errors and `173` warnings, all in `@typescript-eslint/no-explicit-any`.                                                                                                                                                                                                                       |
| Warning distribution by file from ESLint JSON                                                                                                                         | The largest remaining single-file explicit-`any` cluster is `apps/web/src/components/admin/claims/claims-list.test.tsx` with `11` warnings. The next largest clusters have `9`, `8`, and multiple `7` warnings across test and production files.                                                               |
| `apps/web/src/components/admin/claims/claims-list.test.tsx`                                                                                                           | The warnings are test-harness mock prop and translation-param casts around `ClaimsList`. The file already imports `ClaimsListV2Row` and uses a DTO fixture that can be typed without changing runtime behavior.                                                                                                |
| `apps/web/src/components/admin/claims/claims-list.tsx`, `apps/web/src/components/admin/claims/claims-list-row.tsx`, and `apps/web/src/server/domains/claims/types.ts` | `ClaimsList` has a typed `ClaimsListV2Dto` prop and row fixtures can use the existing `ClaimsListV2Row` contract. The child UI, routing, icon, and translation mocks can be typed locally in the test without changing production components.                                                                  |

## Candidate Ranking

| Rank | Candidate                                           | Decision                                                                                                                                                                                                                                                |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Admin claims list component test typed fixtures     | Promote. It is the largest remaining single-file explicit-`any` cluster, is test-only, already has a local typed DTO/row contract, and can reduce the warning baseline without product behavior changes.                                                |
| 2    | Leaderboard wrapper test typed mocks                | Do not promote first. It is test-only but smaller, and should receive its own action-wrapper typed-contract review after the largest remaining test fixture cluster is consumed.                                                                        |
| 3    | Member notes update test typed mocks                | Do not promote first. It is smaller and touches a separate action family that should be handled in a focused member-notes design gate.                                                                                                                  |
| 4    | Admin analytics wrapper test typed mocks            | Do not promote first. It is a viable test-only candidate, but smaller than the admin claims list fixture cluster and depends on a different admin analytics wrapper contract.                                                                           |
| 5    | Production route/core explicit-`any` cleanup        | Do not promote first. Production cores may touch API, route, tenant, framework-adapter, or data contracts and require surface-specific design gates before implementation.                                                                              |
| 6    | Global lint policy flip or bulk explicit-`any` pass | Not promoted. The baseline is still too broad for a policy flip or mechanical sweep; explicit-`any` cleanup must stay bounded by typed-contract slices until the warning count is materially lower and contracts are proven file family by file family. |

## Decision

Promote `P24-LINT03 Admin Claims List Test Typed Fixtures` as the next bounded implementation slice.

## P24-LINT03 Acceptance Criteria

- Limit product-code changes to none; the expected implementation scope is `apps/web/src/components/admin/claims/claims-list.test.tsx`.
- Remove all `@typescript-eslint/no-explicit-any` warnings from `apps/web/src/components/admin/claims/claims-list.test.tsx`.
- Type the mocked routing `Link`, UI component mocks, and translation params without weakening assertions or introducing replacement unsafe casts.
- Keep the existing `ClaimsList` fixture aligned with `ClaimsListV2Dto` and `ClaimsListV2Row`.
- Preserve admin claims list rendering behavior, grouping behavior, empty-state behavior, pagination rendering, stuck-state warning rendering, and claimant/branch/category assertion coverage.
- Preserve route, query, auth, tenant, schema, business, UI/UX, and access-control contracts.
- Do not change lint configuration, TypeScript configuration, package versions, Node tooling, proxy behavior, canonical routes, auth, tenancy, schema, Stripe, CRM, agent workspace, product analytics, README, AGENTS, or architecture docs.
- Verify that `pnpm --filter @interdomestik/web lint` still exits with `0` errors and that the warning count drops from `173` to `162` if all `11` warnings in the file are removed.
- Run the focused unit test `pnpm --filter @interdomestik/web test:unit --run src/components/admin/claims/claims-list.test.tsx`.
- Run docs gates and `pnpm verify-slice -- --static` before opening the implementation PR.

## Suggested Branch

`codex/p24-lint03-admin-claims-list-test-types`

## Verification Standard

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm --filter @interdomestik/web test:unit --run src/components/admin/claims/claims-list.test.tsx`
- `pnpm --filter @interdomestik/web lint`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm verify-slice -- --static`
- Remote PR checks according to changed-file policy
