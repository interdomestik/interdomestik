# P25-DG02 Post-UX01 Next Slice Selection

## Metadata

- Date: 2026-04-30
- Slice: `P25-DG02`
- Status: Complete
- Owner: `platform + product + design + qa`
- Purpose: close out completed `P25-UX01` and decide whether repo-canonical evidence promotes another bounded P25 implementation slice.

## Scope Boundary

This is a design-gate and tracker-reconciliation slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, CRM redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                           | Finding                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#596`, merge commit `81343427da8f950ae05376695e8cde69555d2ffe` | `P25-UX01 Public Commercial Entry Polish` completed the promoted implementation slice. The localized public home, pricing, services, and Free Start/claim-pack entry surfaces now use a consistent Free Start path, reduced-motion support, finish-intake pending/inert behavior, mobile header touch target sizing, sticky mobile CTA safe-area handling, and Vercel preview deploy suppression through `apps/web/vercel.json`. |
| Live production deployment `dpl_6TPzUNRKAHNGLjApVATsQSdocZ3J`      | The merged work is live on the production aliases, including `https://www.interdomestik.com` and `https://interdomestik.com`.                                                                                                                                                                                                                                                                                                    |
| Live browser validation on the localized public home page          | The header and final CTA route to the on-page Free Start intake, the Free Start category guard focuses the validation alert, and the Free Start completion path produces the completed state with a membership follow-up CTA when test data is entered.                                                                                                                                                                          |
| Live browser validation on `/pricing`                              | The public pricing hero CTA routes to `/{locale}#free-start-intake`, preserving the existing annual billing, success-fee, refund, coverage, and checkout contract content.                                                                                                                                                                                                                                                       |
| Live browser validation on `/services`                             | The service page Free Start CTA routes to `/{locale}#free-start-intake`, and the service call CTA uses the localized `hero.callNow` copy with `tel:+38349900600`. Verified visible strings include `Free Consultation`, `Бесплатна консултација`, `Besplatna konsultacija`, and `Konsultim Falas`.                                                                                                                               |
| Vercel PR check behavior after `apps/web/vercel.json`              | Preview deployments for PRs are canceled by the ignored build step while production builds remain allowed. The PR `#596` Vercel status passed as `Canceled by Ignored Build Step`.                                                                                                                                                                                                                                               |
| Console observations during live validation                        | The live pages still emit `/api/monitoring` `403` console noise and font preload warnings. These were not user-facing CTA, routing, or intake blockers in validation and are not enough evidence for a P25 implementation slice without a separate bounded gate.                                                                                                                                                                 |
| `P25-DG01` deferred candidates                                     | Broad CRM redesign, agent-workspace redesign, product analytics expansion, additional lint/responsiveness cleanup, and broad SaaS redesign remain unpromoted without stronger repo-custodied evidence.                                                                                                                                                                                                                           |

## Selection Judgment

`P25-UX01` consumed the only implementation slice promoted by `P25-DG01`. The live production validation did not identify a concrete public-entry defect that requires a same-tranche follow-up implementation. The service CTA Copilot fix is live, the restored localized service strings render, the Free Start path works, and the Vercel preview-skip configuration prevents repeated preview builds while leaving production deploys available.

The remaining candidates are either strategic product lanes that prior gates explicitly deferred, or observations that need a separate bounded evidence gate before implementation. The current repo-canonical evidence therefore supports closing the active P25 implementation line rather than promoting another implementation slice immediately.

## Candidate Ranking

| Rank | Candidate                                         | Decision                                                                                                                                                                                                              |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P25-UX01` closeout and post-UX01 selection       | Promote as this docs-only gate. The tracker must record the completed implementation and the decision not to continue implementation without fresh bounded evidence.                                                  |
| 2    | Narrow public-entry follow-up                     | Do not promote now. Live validation did not expose a concrete CTA, route, locale, or intake defect after PR `#596`.                                                                                                   |
| 3    | Monitoring `403` console cleanup                  | Do not promote from this gate. The observation is console noise from `/api/monitoring`, not a proven user-facing commercial-entry blocker. It needs a separate observability or production-noise gate if prioritized. |
| 4    | Broad CRM redesign                                | Do not promote. P19 closed bounded CRM readiness, and prior gates require a later evidence-backed design gate before broad CRM product redesign.                                                                      |
| 5    | Agent-workspace redesign                          | Do not promote. Prior gates found no repo-custodied agent-demo feedback artifact strong enough to justify broad workspace redesign.                                                                                   |
| 6    | Product analytics expansion                       | Do not promote. Analytics remains useful, but this gate has no measurement design artifact or explicit product question to instrument.                                                                                |
| 7    | Broad SaaS redesign across portals and dashboards | Do not promote. A broad redesign would risk route, auth, tenant, CRM, dashboard, and accessibility contract churn without a stronger repo-canonical design artifact.                                                  |

## Decision

Do not promote a next P25 implementation slice from the current evidence.

Mark `P25-UX01 Public Commercial Entry Polish` complete and close the active P25 commercial-product polish line as complete for now. Further public-product, CRM, agent-workspace, analytics, broad SaaS redesign, lint, responsiveness, observability, proxy, route, auth, tenancy, schema, Stripe, README, AGENTS, or architecture-doc work requires a new bounded repo-canonical design gate.

## Verification Standard

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
