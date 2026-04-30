# P25-DG01 Post-P24 Next Tranche Selection

## Metadata

- Date: 2026-04-30
- Slice: `P25-DG01`
- Status: Complete
- Owner: `platform + product + design + qa`
- Purpose: select the next bounded post-`P24` implementation slice after web lint reached a zero-warning baseline.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                                                         | Finding                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                                              | `P23` is complete as the live responsiveness tranche, `P24-LINT04` is complete, and `pnpm --filter @interdomestik/web lint` now exits with `0` errors and `0` warnings. No next implementation slice is currently promoted.                                                                                                                                                                                |
| `docs/plans/2026-04-27-p21-qa01-v1-live-surface-revalidation.md`                                                                 | Launch-critical public, member, agent, CRM, staff, admin, tenant-host, role-boundary, unified-agent, and Paddle production-posture surfaces were revalidated before post-v1 product expansion. The safe post-live follow-up list explicitly names cosmetic dashboard polish, non-critical empty-state copy improvements, broader CRM product expansion, agent-workspace redesign, and analytics expansion. |
| `docs/plans/2026-04-28-p22-go04-launch-operations-acceptance.md` and release-gate evidence                                       | Production go-live operations reached `GO`, so the next tranche can be post-live product-quality work rather than another launch-readiness blocker pass.                                                                                                                                                                                                                                                   |
| `docs/plans/2026-04-29-p23-dg05-post-perf05-responsiveness-slice-selection.md` and `P23-PERF06`                                  | The last promoted responsiveness gap on canonical agent-client search is complete. Further responsiveness work requires a new bounded gate and should not turn into broad UI/UX redesign by default.                                                                                                                                                                                                       |
| `docs/plans/2026-04-29-p24-dg04-explicit-any-zero-baseline-selection.md` and `P24-LINT04`                                        | The lint-warning burn-down line is complete for the current warning categories. Continuing lint work is not the strongest next tranche unless a new warning category or regression appears.                                                                                                                                                                                                                |
| `docs/plans/2026-04-26-p19-dg01-next-tranche-selection.md` through `P19-CRM03`                                                   | Existing CRM read and mutation tenant-boundary contracts are complete. Broad CRM or agent-workspace redesign remains explicitly deferred until stronger repo-custodied product evidence exists.                                                                                                                                                                                                            |
| Existing public acquisition surfaces in `apps/web/src/app/[locale]/page.tsx`, `/pricing`, `/services`, and Free Start components | The codebase already has localized public entry, pricing, services, coverage, Free Start, and claim-pack surfaces. That makes public commercial entry polish narrower and more evidence-backed than a broad portal or CRM redesign.                                                                                                                                                                        |

## Selection Judgment

The repo has completed the launch-readiness, production go-live, live responsiveness, and lint-warning stabilization lines. The strongest remaining post-v1 product-quality gap is no longer a blocking runtime contract. It is commercial polish on the surfaces that a buyer or claimant sees first.

Broad CRM and agent-workspace redesign remain real strategic candidates, but the repo still lacks the agent-demo feedback artifact that prior gates required before authorizing broad redesign. Product analytics expansion is also useful, but current evidence does not make instrumentation the next limiter. A focused public commercial-entry polish slice gives the product the most immediate commercial-quality lift while preserving the existing route, auth, tenant, billing, and access-control contracts.

## Candidate Ranking

| Rank | Candidate                                             | Decision                                                                                                                                                                                                                                                             |
| ---- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Public commercial entry polish                        | Promote. Existing public home, pricing, services, and Free Start/claim-pack surfaces are launch-critical, already localized, and safe to improve without route, auth, tenant, schema, CRM, or analytics expansion.                                                   |
| 2    | Broad CRM redesign                                    | Do not promote now. P19 closed bounded CRM readiness, and prior gates require a later evidence-backed design gate before broad CRM product redesign.                                                                                                                 |
| 3    | Agent-workspace redesign                              | Do not promote now. Prior gates found no repo-custodied agent-demo feedback artifact strong enough to justify broad workspace redesign.                                                                                                                              |
| 4    | Product analytics expansion                           | Do not promote now. Analytics remains useful, but P18 and P21 both avoid treating analytics as a prerequisite for the next product-quality step without fresh evidence.                                                                                              |
| 5    | Additional lint or responsiveness cleanup             | Do not promote now. P23 and P24 closed the currently promoted responsiveness and lint-warning lines; further work in those categories requires a new concrete regression or bounded evidence source.                                                                 |
| 6    | Broad SaaS redesign across all portals and dashboards | Do not promote. Commercial polish should start with the public entry surfaces and proven launch claims. A broad redesign would be too large and would risk route, auth, tenant, CRM, and dashboard contract churn without a stronger repo-canonical design artifact. |

## Decision

Promote `P25-UX01 Public Commercial Entry Polish` as the next bounded implementation slice.

## P25-UX01 Acceptance Criteria

- Improve the existing public commercial entry path across the localized home page, pricing, services, and Free Start/claim-pack entry surfaces.
- Keep the first-viewport value proposition, Free Start path, membership CTA, coverage/referral boundaries, annual billing terms, success-fee framing, and routing-only hotline disclaimers coherent and scan-friendly.
- Preserve existing canonical routes, query semantics, locale behavior, and commercial contract content.
- Preserve existing Paddle posture and pricing checkout contracts.
- Preserve existing Free Start claim-pack generation behavior and data contracts.
- Add or update focused component tests and, where appropriate, a browser validation path for desktop and mobile public entry behavior.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename canonical routes.
- Do not refactor auth, routing, tenancy architecture, schema, Stripe posture, CRM, agent workspace, product analytics, README, AGENTS, or architecture docs.
- Avoid broad portal redesign; keep the slice limited to public commercial entry polish on existing surfaces and components.

## Suggested Branch

`codex/p25-ux01-public-commercial-entry-polish`

## Verification Standard

- Focused component tests for changed public-entry components.
- Real-site browser validation for the localized public home, pricing, services, and Free Start entry behavior at desktop and mobile widths.
- `git diff --check`
- `pnpm --filter @interdomestik/web lint`
- `pnpm --filter @interdomestik/web type-check`
- Relevant focused unit tests.
- Docs gates if tracker/program docs are touched.
- `pnpm verify-slice -- --static`
- Required gates where appropriate before PR merge.
