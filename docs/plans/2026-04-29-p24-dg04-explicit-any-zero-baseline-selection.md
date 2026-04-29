# P24-DG04 Explicit Any Zero Baseline Selection

## Metadata

- Date: 2026-04-29
- Slice: `P24-DG04`
- Status: Complete
- Owner: `platform + web + qa`
- Purpose: select the next explicit-`any` lint-warning implementation slice after completed `P24-LINT03`.

## Scope Boundary

This design gate authorizes exactly one implementation slice: `P24-LINT04 Web Explicit Any Zero Baseline`.

The implementation slice is limited to removing the remaining `@typescript-eslint/no-explicit-any` warnings reported by `pnpm --filter @interdomestik/web lint` while preserving current runtime behavior and lint policy. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering, tenancy architecture, database schema, Stripe, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

Type changes in production files must be contract-preserving: use existing imported contracts where available, local structural types where the file already owns the adapter boundary, and `unknown` or `Record<string, unknown>` where the value is intentionally opaque.

## Evidence Reviewed

| Evidence                                                            | Finding                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md` | `P24-DG03` and `P24-LINT03` are complete. Further P24 explicit-`any` implementation requires a new repo-canonical design gate before implementation.                                                                                                                            |
| PR `#592`, merge commit `5190b471b2f4a33ecb51273672c51f879a234110`  | `P24-LINT03` removed all `11` explicit-`any` warnings from `apps/web/src/components/admin/claims/claims-list.test.tsx` without production-code changes.                                                                                                                         |
| `pnpm --filter @interdomestik/web lint` after `P24-LINT03`          | Lint reports `0` errors and `162` warnings, all in `@typescript-eslint/no-explicit-any`.                                                                                                                                                                                        |
| Warning distribution by file                                        | The remaining warnings are spread across wrapper tests, route/API cores, feature read adapters, and component view adapters. The largest single-file clusters have `9`, `8`, and `7` warnings; no single remaining file is large enough to materially close the baseline alone. |
| User directive on 2026-04-29                                        | The explicit product-management direction is to resume until lint warnings are `0`, provided repository contracts remain intact.                                                                                                                                                |

## Candidate Ranking

| Rank | Candidate                             | Decision                                                                                                                                                                                                                      |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Web explicit-`any` zero baseline      | Promote. The remaining baseline is now a single warning family, the user direction is to reach zero warnings, and the gate can keep the implementation constrained to contract-preserving typing without lint-policy changes. |
| 2    | Test-only wrapper cluster             | Do not promote separately. It is lower risk, but stopping there would leave the production warning tail and fail the requested zero-warning outcome.                                                                          |
| 3    | Production route/core cluster         | Do not promote separately. It must be included only as type-boundary cleanup with focused verification, not as behavior or architecture work.                                                                                 |
| 4    | Lint policy flip or suppression sweep | Not promoted. The desired outcome must come from real typing, not disabling `@typescript-eslint/no-explicit-any`, broad suppressions, or a weaker lint baseline.                                                              |

## Decision

Promote `P24-LINT04 Web Explicit Any Zero Baseline` as the next bounded implementation slice.

## P24-LINT04 Acceptance Criteria

- Remove every remaining `@typescript-eslint/no-explicit-any` warning reported by `pnpm --filter @interdomestik/web lint`.
- Preserve `0` lint errors and reduce total web lint warnings from `162` to `0`.
- Do not change lint configuration, TypeScript configuration, package versions, Node tooling, `apps/web/src/proxy.ts`, canonical routes, auth, tenancy, schema, Stripe, CRM, agent workspace, product analytics, README, AGENTS, or architecture docs.
- Preserve route, query, auth, tenant, schema, business, UI/UX, and access-control contracts.
- Prefer existing DTOs, inferred function parameter/return types, local structural types, `unknown`, and `Record<string, unknown>` over broad casts.
- Run focused tests for materially touched test/action/API/component families.
- Run `pnpm --filter @interdomestik/web lint`, `pnpm --filter @interdomestik/web type-check`, docs gates, `pnpm verify-slice -- --static`, and required gates before merge.

## Suggested Branch

`codex/p24-lint04-explicit-any-zero-baseline`

## Verification Standard

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- Focused tests for changed action, API, and component families
- `pnpm --filter @interdomestik/web lint`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm verify-slice -- --static`
- `pnpm verify-slice -- --required-gates`
- Remote PR checks according to changed-file policy
