# P19-DG01 Next Tranche Selection

## Slice

- Slice: `P19-DG01`
- Date: `2026-04-26`
- Owner: `platform + product + qa`
- Purpose: promote exactly one bounded post-`P18` implementation slice from repo-backed evidence before CRM or agent-workspace product code changes are authorized.

## Scope Constraints

This is a design-gate and tracker-promotion slice only. It does not authorize changes to `apps/web/src/proxy.ts`, canonical routes, auth layering, tenancy architecture, Stripe posture, schema, portal structure, product analytics instrumentation, broad CRM redesign, or broad agent-workspace redesign.

## Inputs

| Input                                                                                                             | Use in decision                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md`                                                                                   | Confirms `P18` is complete and explicitly states CRM and agent-workspace redesign were not implemented in P18 and require a later design gate before implementation.                   |
| `docs/plans/current-tracker.md`                                                                                   | Confirms `P18`, `P18-DG01`, `P18-UX01`, `P18-UX02`, `P18-DG02`, and `P18-UX03` are complete, leaving no pending promoted child slice after the P18 closeout.                           |
| `docs/plans/2026-03-15-pilot-readiness-blueprint-v1.md`                                                           | Names post-pilot experience optimization inputs, including agent demo feedback and operational friction, while warning against widening scope before repo-backed evidence supports it. |
| `docs/plans/2026-04-26-p18-ux01-evidence-ranking.md`                                                              | Records that no repo-custodied agent-demo feedback artifact was found, so broad agent-demo UX or CRM redesign is not evidence-backed yet.                                              |
| `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` and `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts` | Show an existing canonical `/agent/crm` surface and read model, making route-boundary and tenant-scoped read-contract hardening a narrower candidate than new CRM design.              |
| `apps/web/src/app/[locale]/(agent)/agent/leads/[id]/_core.ts`                                                     | Shows an existing CRM lead-detail read model that can be hardened without adding new routes, schemas, portals, or workspace redesign.                                                  |
| `packages/database/src/schema/crm.ts`                                                                             | Confirms `crm_leads` and `crm_deals` carry tenant identifiers, so tenant-scoped read contracts can be enforced in existing read models using current schema.                           |

## Selection Judgment

P18 completed the two evidence-backed member trust and activation improvements available from the pilot closeout artifacts. The remaining CRM and agent-workspace topics are real, but the repo does not yet contain enough agent-demo feedback to justify a broad redesign.

The strongest bounded next step is therefore not a new CRM experience. It is read-contract hardening for the existing agent CRM surfaces. The codebase already has `/agent/crm`, CRM lead-detail read models, and tenant-bearing CRM tables. That supports a small implementation slice that makes existing reads explicitly tenant-scoped and proves the route-boundary session and tenant identity contract, without changing canonical routes, proxy behavior, auth architecture, tenancy architecture, schema, or portal shape.

## Candidate Ranking

| Rank | Candidate                                       | Judgment                                                                                                                                                         |
| ---- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Agent CRM tenant-scoped read contracts          | Strongest. Existing CRM page, lead-detail core, and tenant-bearing CRM tables make this a bounded implementation slice with security and professionalism value.  |
| 2    | Broad CRM or agent-workspace redesign           | Not promoted. The live program requires a later design gate, and no repo-custodied agent-demo feedback artifact exists to justify broad UX or workflow redesign. |
| 3    | Product analytics or activation instrumentation | Not promoted. P18 explicitly avoided analytics claims, and the current repo evidence does not authorize widening into instrumentation.                           |
| 4    | Additional member trust or activation UX        | Not promoted. P18 consumed the strongest member claim-detail progress and trust/SLA evidence, and further work needs a new evidence source.                      |

## Promoted Implementation Slice

Promote `P19-CRM01 Agent CRM Tenant-Scoped Read Contracts` as the next bounded implementation slice.

Recommended scope:

- Use the repo's established agent session and tenant helper pattern at the existing route boundary for `/agent/crm` and the existing CRM lead-detail route entry path.
- Pass tenant identity into the existing CRM stats and lead-detail read cores.
- Filter tenant-bearing CRM reads by tenant id and preserve existing authorized happy-path behavior.
- Add focused route/core tests for missing tenant identity and tenant-scoped CRM read contracts.
- Keep `apps/web/src/proxy.ts`, canonical routes, auth layering, tenant architecture, schema, Stripe posture, portal structure, product analytics, broad CRM redesign, and broad agent-workspace redesign unchanged.

Non-recommendations:

- Do not rename `/agent`, `/agent/crm`, or lead-detail routes.
- Do not implement a new CRM workflow, agent dashboard redesign, or agent-demo feature.
- Do not introduce new database schema or new tenant architecture.
- Do not touch `apps/web/src/proxy.ts`.

## Verification Plan

- Focused unit tests for the CRM route/core surfaces changed by `P19-CRM01`.
- `git diff --check`
- Targeted `@interdomestik/web` lint and type-check for product-code slices.
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- pre-PR reviewer pool
- `pnpm verify-slice -- --required-gates`
