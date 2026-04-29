# P24-DG02 Explicit Any Slice Selection

## Metadata

- Date: 2026-04-29
- Slice: `P24-DG02`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the next bounded explicit-`any` lint-warning implementation slice after completed `P24-LINT01`.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

The next implementation slice must reduce explicit-`any` warnings without changing route, query, auth, tenant, schema, business, UI/UX, or access-control contracts.

## Evidence Reviewed

| Evidence                                                                                                                       | Finding                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                                            | `P24-DG01` and `P24-LINT01` are complete. Further P24 lint-warning implementation, especially explicit-`any` typed-contract cleanup, requires a new repo-canonical design gate before implementation.                                                                    |
| PR `#587`, merge commit `bc282887`                                                                                             | `P24-LINT01` removed the stale eslint-disable directive and all `@typescript-eslint/no-unused-vars` warnings without changing lint policy, route behavior, auth, tenancy, schema, Stripe, CRM, agent workspace, product analytics, README, AGENTS, or architecture docs. |
| `pnpm --filter @interdomestik/web lint` after `P24-LINT01`                                                                     | Lint passes with `0` errors and `188` warnings, all in `@typescript-eslint/no-explicit-any`.                                                                                                                                                                             |
| Warning distribution by file from `eslint --format json`                                                                       | The largest single-file explicit-`any` cluster is `apps/web/src/actions/claims/submit.test.ts` with `15` warnings. The next largest clusters are `11`, `9`, `8`, and multiple `7` warning files across tests and production cores.                                       |
| `apps/web/src/actions/claims/submit.test.ts`                                                                                   | The warnings are test-harness casts around mocked claim submission, rate limiting, session, and input data. The file already exercises the existing claim submit action wrapper and can be typed without changing runtime behavior.                                      |
| `apps/web/src/actions/claims/submit.core.ts` and `@interdomestik/domain-claims/claims/submit` claim submission domain boundary | The action wrapper has typed parameters and a typed domain dependency boundary that can be reused by the test file. No production route, query, auth, tenant, schema, or UI contract needs to change to type the test mocks.                                             |

## Candidate Ranking

| Rank | Candidate                                           | Decision                                                                                                                                                                                                                                                |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Claims submit test typed mocks                      | Promote. It is the largest remaining single-file explicit-`any` cluster, is test-only, has a clear typed wrapper contract, and can reduce the warning baseline without runtime behavior changes.                                                        |
| 2    | Admin claims list component test typed fixtures     | Do not promote first. It is also test-only, but the component fixture surface is broader and should follow after the action-wrapper test-harness cleanup proves the explicit-`any` pattern.                                                             |
| 3    | Leaderboard wrapper test typed mocks                | Do not promote first. It is smaller than the claim submit cluster and should be handled in a later wrapper-test slice.                                                                                                                                  |
| 4    | Member notes test cluster                           | Do not promote first. It is smaller and touches a different action family that should receive its own typed-contract review.                                                                                                                            |
| 5    | Production route/core explicit-`any` cleanup        | Do not promote first. Production cores may touch API, route, tenant, framework-adapter, or data contracts and require surface-specific design gates before implementation.                                                                              |
| 6    | Global lint policy flip or bulk explicit-`any` pass | Not promoted. The baseline is still too broad for a policy flip or mechanical sweep; explicit-`any` cleanup must stay bounded by typed-contract slices until the warning count is materially lower and contracts are proven file family by file family. |

## Decision

Promote `P24-LINT02 Claims Submit Test Typed Mocks` as the next bounded implementation slice.

## P24-LINT02 Acceptance Criteria

- Limit product-code changes to none unless a strictly type-only export is proven necessary; the expected implementation scope is `apps/web/src/actions/claims/submit.test.ts`.
- Remove all `@typescript-eslint/no-explicit-any` warnings from `apps/web/src/actions/claims/submit.test.ts`.
- Type the claim submit test session, input data, rate-limit mock adapter, and domain submit mock without weakening assertions or using replacement unsafe casts.
- Preserve claim submission wrapper behavior, idempotency request fingerprint behavior, rate-limit behavior, commercial launch-scope metadata, diaspora handoff forwarding, and domain validation error handling.
- Preserve route, query, auth, tenant, schema, business, UI/UX, and access-control contracts.
- Do not change lint configuration, TypeScript configuration, package versions, Node tooling, proxy behavior, canonical routes, auth, tenancy, schema, Stripe, CRM, agent workspace, product analytics, README, AGENTS, or architecture docs.
- Verify that `pnpm --filter @interdomestik/web lint` still exits with `0` errors and that the warning count drops from `188` to `173` if all `15` warnings in the file are removed.
- Run the focused unit test `pnpm --filter @interdomestik/web test:unit --run src/actions/claims/submit.test.ts`.
- Run docs gates and `pnpm verify-slice -- --static` before opening the implementation PR.

## Suggested Branch

`codex/p24-lint02-claims-submit-test-types`

## Verification Standard

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/claims/submit.test.ts`
- `pnpm --filter @interdomestik/web lint`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm verify-slice -- --static`
- Remote PR checks according to changed-file policy
