# P24-DG01 Lint Warning Burn-Down Slice Selection

## Metadata

- Date: 2026-04-29
- Slice: `P24-DG01`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the first bounded lint-warning burn-down implementation slice after the completed `P23` responsiveness line.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

The next implementation slice must reduce warning count without changing route, query, auth, tenant, schema, business, or UI/UX contracts.

## Evidence Reviewed

| Evidence                                                            | Finding                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md` | P23 was the active bounded responsiveness tranche. `P23-DG05` promoted `P23-PERF06`, and PR `#585` has now consumed that promoted implementation slice. No further P23 implementation slice is repo-promoted.                                             |
| PR `#585`, merge commit `65a5b0c7317c3f507bd366e9050331e442838510`  | `P23-PERF06` added deterministic pending feedback and inert in-flight behavior to the canonical `/agent/clients` search surface and also enforced Node 24 tooling. Remote checks and post-merge focused sanity were green.                                |
| `pnpm --filter @interdomestik/web lint` on 2026-04-29               | Lint passes with `0` errors and `219` warnings. The warnings are concentrated in `189` `@typescript-eslint/no-explicit-any`, `30` `@typescript-eslint/no-unused-vars`, and `1` stale eslint-disable directive.                                            |
| `@typescript-eslint/no-explicit-any` warnings                       | This is the largest warning family, but it spans production route cores, server cores, tests, mocks, and framework adapter boundaries. A safe cleanup requires typed-contract review by surface and should not be bundled into the first burn-down slice. |
| `@typescript-eslint/no-unused-vars` warnings                        | This smaller warning family is mechanically bounded and mostly limited to unused imports, unused destructured values, unused props, unused local bindings, and intentionally ignored errors that do not need behavioral changes.                          |
| stale eslint-disable warning                                        | Exactly one stale disable is present in `apps/web/e2e/gate/subscription-contract.spec.ts`. Removing it is low risk and directly improves lint hygiene.                                                                                                    |

## Candidate Ranking

| Rank | Candidate                                                | Decision                                                                                                                                                     |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Unused symbols and stale eslint-disable cleanup          | Promote. This is the smallest low-risk warning family, has clear evidence, can be verified by lint-count reduction, and should not affect runtime contracts. |
| 2    | Test-only `no-explicit-any` cleanup                      | Do not promote first. Test mocks may need reusable typed helpers and should be sliced by test area after the mechanical warnings are removed.                |
| 3    | Production route/core `no-explicit-any` cleanup          | Do not promote first. These warnings may touch API, route, tenant, or adapter contracts and need typed-contract review by surface.                           |
| 4    | Global lint policy change or warning-to-error conversion | Not promoted. The current baseline is too noisy to flip policy safely without first burning down warnings by category.                                       |
| 5    | Broad formatting, modernization, or refactor cleanup     | Not promoted. This tranche is lint-warning debt reduction only, not a broad code quality or architecture campaign.                                           |

## Decision

Promote `P24-LINT01 Unused Symbols And Stale Suppressions` as the next bounded implementation slice.

## P24-LINT01 Acceptance Criteria

- Remove the stale eslint-disable directive reported by the current web lint run.
- Remove or intentionally underscore unused variables, imports, props, destructured values, and local bindings reported by `@typescript-eslint/no-unused-vars`.
- Preserve all runtime behavior, route shapes, query contracts, auth boundaries, tenant scoping, DTO shapes, UI/UX copy, and test semantics.
- Do not address `@typescript-eslint/no-explicit-any` in this slice except where directly incidental to deleting an unused symbol.
- Do not change lint configuration, TypeScript configuration, package versions, Node tooling, proxy behavior, canonical routes, auth, tenancy, schema, Stripe, CRM, agent workspace, product analytics, README, AGENTS, or architecture docs.
- Verify that `pnpm --filter @interdomestik/web lint` still exits with `0` errors and that the warning count drops by at least the currently identified stale-disable plus unused-symbol warnings.
- Run focused tests for any touched product or test files where behavior could plausibly be affected.
- Run docs gates and `pnpm verify-slice -- --static` before opening the PR.

## Suggested Branch

`codex/p24-lint01-unused-symbols-stale-suppressions`

## Verification Standard

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm --filter @interdomestik/web lint`
- `pnpm verify-slice -- --static`
- Remote PR checks, including Vercel, SonarCloud, E2E/finalizer/security/audit checks according to changed-file policy
