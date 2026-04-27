# P20-DG01 v1.0.0 Release Declaration Gate

## Metadata

- Date: 2026-04-27
- Slice: `P20-DG01`
- Status: Complete
- Owner: `platform + product + qa`
- Purpose: select the next bounded post-`P19` slice after CRM readiness and tenant-boundary hardening closed the final known v1.0.0 readiness line.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes, package-version changes, deployment changes, `apps/web/src/proxy.ts` changes, canonical route renames, auth layering changes, tenancy architecture changes, schema changes, Stripe reintroduction, product analytics instrumentation, broad CRM redesign, or broad agent-workspace redesign.

## Evidence Reviewed

| Evidence                                                                               | Finding                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                    | `P11`, `P13`, `P15`, `P16`, `P17`, `P18`, and `P19` are complete, and `P19` explicitly closes the bounded CRM readiness and tenant-boundary hardening line for v1.0.0. No pending active tracker slice remains after `P19-CRM03`. |
| `package.json`, `apps/web/package.json`, and workspace package manifests               | The repository version authority still records `0.1.0`; no canonical package or app manifest has been moved to `1.0.0`.                                                                                                           |
| `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-expand-readiness-2026-04-15.md`                 | The bounded expand-readiness executive review records an `expand` recommendation after stable operating evidence, clean custody, and strict metric checks.                                                                        |
| `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_pilot-ks-expand-readiness-2026-04-15.md`            | The repo-backed rollup records met SLA, progression, decision, privacy, and incident thresholds, and states that expansion is defendable.                                                                                         |
| `docs/pilot/V1_0_0_BOUNDED_CONTINUATION_PLAN.md` and `docs/pilot/V1_0_0_NEXT_STEPS.md` | The v1.0.0 line requires explicit bounded approval and evidence custody rather than implicit continuation.                                                                                                                        |
| Completed PR evidence through `#549` and tracker closeouts through `#550`              | Production professionalism, route/API boundary contracts, CRM read/write tenant contracts, and tracker/Notion closeout evidence are green.                                                                                        |

## Selection Judgment

The repo has now closed the known v1.0.0 readiness blockers that were promoted after the April production-professionalism rereviews and the CRM readiness gates. The remaining gap is not another feature implementation. It is release authority: the canonical program still says the `v0.1.0` production rebaseline is active, and every package manifest still declares `0.1.0`.

The next slice should therefore be a narrow release declaration and version-authority slice. It should reconcile the program state, version surfaces, and release evidence into an explicit v1.0.0 declaration without reopening product scope or bundling backlog CRM/product work.

## Candidate Ranking

| Rank | Candidate                                        | Decision                                                                                                                                                                                 |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | v1.0.0 release declaration and version authority | Promote. The readiness work is complete, but canonical phase and package version authority still say `0.1.0`; this is the smallest remaining release-governance gap.                     |
| 2    | Broad CRM or agent-workspace redesign            | Do not promote. `P19` explicitly closed the bounded CRM readiness line and deferred broad CRM/agent-workspace work to post-v1.0.0 unless a later design gate promotes it.                |
| 3    | Product analytics instrumentation                | Do not promote. Analytics remains useful backlog work, but no current readiness evidence makes it a blocker for release declaration.                                                     |
| 4    | Additional member trust or activation UX         | Do not promote. `P18` consumed the strongest repo-custodied member trust and activation evidence; further UX work requires a new evidence source and should not block release authority. |
| 5    | Additional tenant-boundary hardening outside CRM | Do not promote here. Adjacent hardening candidates can enter a later backlog gate, but the known v1.0.0 professionalism and CRM boundary lines are complete and green.                   |

## Decision

Promote `P20-RG01 v1.0.0 Release Declaration And Version Authority` as the next bounded implementation slice.

## P20-RG01 Acceptance Criteria

- Update canonical release/program authority to state the v1.0.0 release declaration decision and evidence basis.
- Reconcile package/app version authority from `0.1.0` to `1.0.0` only where the repo already treats that manifest as release-version authority.
- Add or update a focused release-declaration artifact that links the relevant completed gates, pilot expand-readiness evidence, PR evidence, and verification commands.
- Preserve current product behavior and routes.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, schema, Stripe posture, CRM product workflows, agent-workspace structure, or product analytics.
- Run focused manifest/static checks first, then deterministic local gates, `pnpm verify-slice -- --static`, reviewer pool, and `pnpm verify-slice -- --required-gates` before PR merge.

## Suggested Branch

`codex/p20-rg01-v1-release-declaration-version-authority`

## Verification Standard

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- pre-PR reviewer pool
- `pnpm verify-slice -- --required-gates`
