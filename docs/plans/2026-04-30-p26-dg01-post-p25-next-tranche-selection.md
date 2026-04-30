# P26-DG01 Post-P25 Next Tranche Selection

## Metadata

- Date: 2026-04-30
- Slice: `P26-DG01`
- Status: Complete
- Owner: `platform + product + design + qa`
- Purpose: select the next bounded post-`P25` implementation slice after public commercial entry polish closed.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                              | Finding                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                                   | `P25` is complete and `P25-DG02` explicitly promotes no same-tranche follow-up. Any further public-product, CRM, agent-workspace, analytics, broad SaaS redesign, lint, responsiveness, observability, proxy, route, auth, tenancy, schema, Stripe, README, AGENTS, or architecture-doc work requires a new bounded repo-canonical design gate.                                              |
| `docs/plans/2026-04-30-p25-dg02-post-ux01-next-slice-selection.md`                                    | Broad CRM redesign, agent-workspace redesign, product analytics expansion, and broad SaaS redesign remained unpromoted after public commercial entry polish because they needed a separate bounded gate.                                                                                                                                                                                     |
| `docs/plans/2026-04-26-p19-dg01-next-tranche-selection.md` through completed `P19-CRM03`              | P19 closed CRM readiness and tenant-boundary hardening on existing CRM surfaces. It did not implement broad CRM redesign, but it did establish that `/agent/crm`, `/agent/leads`, CRM lead detail, CRM reads, dashboard KPI reads, and legacy CRM mutations are repo-backed surfaces that can support later bounded CRM productization.                                                      |
| `apps/web/src/app/[locale]/(agent)/agent/leads/[id]/_core.ts` and `_core.test.ts`                     | The existing lead-detail read model is already tenant-scoped and agent-scoped. That makes lead-detail productization safer than inventing new CRM routes, schema, or tenant boundaries.                                                                                                                                                                                                      |
| `apps/web/src/features/agent/leads/components/AgentLeadDetailV2Page.tsx`                              | The existing lead-detail page renders hardcoded English labels, redirects unauthenticated sessions to `/auth/login` instead of a locale-preserving canonical login path, keeps an unbacked `Create Deal` button visible, and uses an explicit translation cast suppression for lead stages. These are concrete product-quality defects on an existing CRM surface, not broad redesign scope. |
| `apps/web/src/messages/*/agent.json` and `apps/web/src/messages/*/agent-crm.json`                     | Localized agent CRM message files already exist. The next CRM slice can extend existing localization keys rather than introducing a new design system or route family.                                                                                                                                                                                                                       |
| `apps/web/src/features/agent/leads/components/AgentLeadsProPage.tsx` and existing agent leads actions | Existing lead-list actions already support bounded status updates and conversion behavior. The detail page should expose only backed CRM actions or clearly non-clickable future-state copy, preserving current action contracts.                                                                                                                                                            |
| Completed `P23`, `P24`, and `P25` tranches                                                            | Responsiveness, lint-warning zero baseline, and public commercial entry polish are complete. Repeating those lines is lower priority than productizing an existing CRM surface that is already tenant-scoped but still exposes visible polish and action-contract gaps.                                                                                                                      |

## Selection Judgment

The next implementation slice should be domain-CRM before any broad SaaS redesign. Broad SaaS redesign remains too large and would risk route, auth, tenant, dashboard, CRM, and localization churn without a stronger design artifact. By contrast, the existing agent lead-detail surface has concrete repo-custodied evidence: tenant-scoped reads are already in place, tests already cover the boundary, localized message infrastructure exists, and the page still exposes hardcoded copy plus an unbacked primary action.

The strongest bounded next step is therefore not a new CRM system, a new agent workspace, or a broad visual redesign. It is a focused CRM productization slice on the existing canonical `/agent/leads/[id]` detail surface.

## Candidate Ranking

| Rank | Candidate                                 | Decision                                                                                                                                                                                                           |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Agent lead-detail CRM productization      | Promote. Existing route, read core, tests, activity feed, deals data, localization files, and visible action/copy gaps make this the narrowest commercially useful CRM slice after P25.                            |
| 2    | Broad CRM redesign                        | Do not promote now. P19 deliberately stopped at bounded CRM readiness; this gate has concrete evidence for one lead-detail surface, not a complete CRM IA or workflow redesign.                                    |
| 3    | Broad SaaS/public-product redesign        | Do not promote. P25 polished public commercial entry. A broad SaaS redesign would be larger, less bounded, and more likely to disturb canonical routes, auth, tenant, and dashboard contracts.                     |
| 4    | Agent-workspace redesign                  | Do not promote now. Prior gates found no repo-custodied agent-demo feedback artifact strong enough to justify a broad workspace redesign, and this gate has stronger evidence on the existing lead-detail surface. |
| 5    | Product analytics expansion               | Do not promote now. Analytics remains useful, but this gate has no measurement design artifact or product question specific enough to instrument.                                                                  |
| 6    | Monitoring `403` console cleanup          | Do not promote now. The live console observation is not a proven user-facing blocker and should be handled by a separate observability or production-noise gate if prioritized.                                    |
| 7    | Additional lint or responsiveness cleanup | Do not promote now. P23 and P24 closed the currently promoted responsiveness and lint-warning lines; no fresh regression is present in the repo-canonical evidence.                                                |

## Decision

Open `P26 Agent CRM Productization` as the next tranche and promote exactly one bounded implementation slice:

`P26-CRM01 Agent Lead Detail Productization`

## P26-CRM01 Acceptance Criteria

- Scope the implementation to the existing canonical `/agent/leads/[id]` lead-detail surface and directly supporting localized message keys, tests, and backed action affordances.
- Preserve the existing lead-detail read model, tenant-scoped and agent-scoped access-control behavior, activity-history behavior, deal data shape, and existing agent lead action contracts.
- Use the locale from the route boundary so unauthenticated redirects preserve canonical localized login behavior.
- Replace hardcoded lead-detail UI copy with localized messages across the supported agent locales.
- Remove the explicit lead-stage translation cast suppression by using a typed or otherwise bounded stage-label mapping.
- Remove, disable, or replace the unbacked `Create Deal` button so the detail page does not expose a clickable primary action without an existing backed route or server action.
- Add or update focused tests for locale-preserving redirect behavior, localized/copy contract behavior, backed-or-inert action behavior, and preservation of tenant/agent read boundaries.
- Run a real-site browser validation path for `/agent/leads/[id]` where available, including desktop and mobile viewport behavior.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename or bypass canonical routes.
- Do not refactor routing, auth, tenancy architecture, schema, Stripe posture, broad CRM IA, broad SaaS design, agent workspace, product analytics, README, AGENTS, or architecture docs.

## Suggested Branch

`codex/p26-crm01-agent-lead-detail-productization`

## Verification Standard

- Focused unit/component tests for changed lead-detail and CRM action/copy behavior.
- Real-site browser validation for the canonical `/agent/leads/[id]` surface when test data is available.
- `git diff --check`
- `pnpm --filter @interdomestik/web lint`
- `pnpm --filter @interdomestik/web type-check`
- Docs gates if tracker/program docs are touched.
- `pnpm verify-slice -- --static`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
