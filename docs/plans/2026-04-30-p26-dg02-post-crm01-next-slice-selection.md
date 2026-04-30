# P26-DG02 Post-CRM01 Next Slice Selection

## Metadata

- Date: 2026-04-30
- Slice: `P26-DG02`
- Status: Complete
- Owner: `platform + product + design + qa`
- Purpose: close out completed `P26-CRM01` and decide whether repo-canonical evidence promotes another bounded P26 or CRM implementation slice.

## Scope Boundary

This is a design-gate and tracker-reconciliation slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                            | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#602`, merge commit `f6e3b01c5b8091b731c35dd9853c225fd2293574`  | `P26-CRM01 Agent Lead Detail Productization` completed the only implementation slice promoted by `P26-DG01`. The existing canonical `/agent/leads/[id]` detail surface now uses route locale for rendering and login redirects, localized detail/deal/activity copy, bounded stage and deal-status labels, and a disabled unavailable Create Deal affordance while preserving the existing route, tenant/agent read boundary, activity history, deals data shape, and lead action contracts. |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md` | `P26` is recorded as complete through `P26-DG01` and `P26-CRM01`. The tracker explicitly states that further P26/CRM/productization work is unpromoted until a future repo-canonical design gate identifies a concrete next slice.                                                                                                                                                                                                                                                           |
| `docs/plans/2026-04-30-p26-dg01-post-p25-next-tranche-selection.md` | The prior gate promoted exactly one bounded implementation slice on `/agent/leads/[id]`. It did not promote broad CRM redesign, agent-workspace redesign, broad SaaS redesign, product analytics expansion, monitoring console-noise cleanup, or additional lint/responsiveness cleanup.                                                                                                                                                                                                     |
| `docs/plans/2026-04-30-p25-dg02-post-ux01-next-slice-selection.md`  | The closest prior closeout pattern records completed implementation evidence and does not promote another implementation slice when no fresh bounded defect or evidence-backed candidate exists.                                                                                                                                                                                                                                                                                             |
| Completed `P19` CRM readiness line                                  | `P19` already closed tenant-boundary and read/mutation contract hardening on existing CRM surfaces. `P26-CRM01` consumed the concrete post-`P25` productization gap on lead detail. Remaining CRM work would need a new evidence artifact stronger than the current backlog references.                                                                                                                                                                                                      |
| PR `#605`, merge commit `0e9c702f28fa6ce2f6ec87beb6f89622b6165720`  | Repo QA MCP inspection tooling was improved after P26 closeout. That tooling helps execution and verification, but it is not itself product evidence for CRM, analytics, workspace, or route-surface implementation scope.                                                                                                                                                                                                                                                                   |
| Current repo search for `P27` and active pending slices             | No repo-canonical `P27` tranche or pending implementation slice is currently recorded.                                                                                                                                                                                                                                                                                                                                                                                                       |

## Selection Judgment

`P26-CRM01` consumed the only concrete implementation target promoted by `P26-DG01`. The merged lead-detail work addressed the named productization defects without widening scope into CRM IA, agent workspace, analytics, proxy, auth, tenancy, schema, or Stripe behavior. Current repo-canonical docs do not contain a new user-facing CRM defect, a new design artifact, or a measurement plan specific enough to promote another implementation slice.

The strongest next move is therefore this docs-only closeout gate: record that P26's promoted implementation work is complete, preserve the boundary that broad CRM and agent-workspace redesign remain unpromoted, and require a future bounded gate before any additional product or platform slice is opened.

## Candidate Ranking

| Rank | Candidate                                         | Decision                                                                                                                                                                                    |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P26-CRM01` closeout and post-CRM01 selection     | Promote as this docs-only gate. The tracker must record the completed implementation and the decision not to continue implementation without fresh bounded evidence.                        |
| 2    | Narrow follow-up on `/agent/leads/[id]`           | Do not promote now. PR `#602` addressed the specific hardcoded copy, locale, stage-label, and unbacked-action defects named by `P26-DG01`; no fresh bounded lead-detail defect is recorded. |
| 3    | Additional CRM productization                     | Do not promote now. Remaining CRM product work is not backed by a concrete repo-custodied slice target after lead-detail productization.                                                    |
| 4    | Broad CRM redesign                                | Do not promote. Prior gates repeatedly deferred broad CRM redesign without a stronger design artifact and a bounded implementation target.                                                  |
| 5    | Agent-workspace redesign                          | Do not promote. Prior gates found no repo-custodied agent-demo feedback artifact strong enough to justify broad workspace changes.                                                          |
| 6    | Product analytics expansion                       | Do not promote. The repo still lacks a measurement design artifact or product question specific enough to instrument.                                                                       |
| 7    | Monitoring `403` console cleanup                  | Do not promote from this gate. The observation remains console noise rather than a proven P26 CRM productization blocker.                                                                   |
| 8    | Repo QA MCP tooling                               | Do not promote as product work from this gate. PR `#605` improved agent execution tooling, but this gate is evaluating product/backlog evidence after P26.                                  |
| 9    | Broad SaaS redesign across portals and dashboards | Do not promote. A broad redesign would risk route, auth, tenant, CRM, dashboard, accessibility, and localization contract churn without a stronger repo-canonical design artifact.          |

## Decision

Do not promote a next P26 or CRM implementation slice from the current evidence.

Mark `P26-CRM01 Agent Lead Detail Productization` complete and close the active P26 implementation line as complete for now. Further CRM productization, broad CRM redesign, agent-workspace redesign, product analytics, observability cleanup, broad SaaS redesign, proxy, route, auth, tenancy, schema, Stripe, README, AGENTS, or architecture-doc work requires a new bounded repo-canonical design gate.

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
