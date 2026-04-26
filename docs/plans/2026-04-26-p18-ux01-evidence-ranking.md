# P18-UX01 Evidence Ranking

## Slice

- Slice: `P18-UX01`
- Date: `2026-04-26`
- Owner: `web + product + qa`
- Purpose: rank repo-custodied pilot activation and trust evidence into exactly one bounded implementation recommendation before product code changes.

## Scope Constraints

This slice is evidence ranking only. It does not authorize changes to `apps/web/src/proxy.ts`, canonical routes, auth layering, tenancy architecture, Stripe, broad portal redesign, or unscoped product changes.

## Evidence Inputs

| Evidence area                        | Repo-custodied source                                                                                                                                                                                                                                                                                                                                | Signal strength                                                                                                                                                                   | Ranking | Use in decision                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Operational friction and progression | `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-expand-readiness-2026-04-15_day-1.md`, `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-expand-readiness-2026-04-15_day-3.md`, `docs/pilot/live-data/pilot-ks-expand-readiness-2026-04-15_day-1_claim-timeline-export.csv`, `docs/pilot/live-data/pilot-ks-expand-readiness-2026-04-15_day-3_claim-timeline-export.csv` | Strong. The same claim has same-day public timeline proof on day 1 and resolved-state progression by day 3.                                                                       | 1       | Authorizes a bounded implementation slice focused on making progress and latest public update clearer to returning members. |
| SLA and trust posture                | `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_pilot-ks-expand-readiness-2026-04-15.md`, `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-expand-readiness-2026-04-15.md`, `docs/pilot/PILOT_CLOSEOUT_pilot-ks-expand-readiness-2026-04-15.md`                                                                                                                             | Strong. Triage, public update, two-operating-day progression, privacy/RBAC, and incident thresholds are green for the bounded KS line.                                            | 2       | Supports trust-copy and status-clarity work, but not new routing, auth, or tenancy behavior.                                |
| Member return behavior               | `docs/pilot/PILOT_KPIS.md`, daily sheets, and live claim timeline exports                                                                                                                                                                                                                                                                            | Partial. The repo proves a member-visible public update and a resolved follow-up state, but does not contain product analytics proving return visits or repeated member sessions. | 3       | Allows a conservative member-return clarity hypothesis; does not authorize claims about measured return conversion.         |
| Activation drop-off and conversion   | `docs/pilot/PILOT_KPIS.md`, `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_pilot-ks-expand-readiness-2026-04-15.md`                                                                                                                                                                                                                                              | Partial. Claim start and claim submission are proven for a one-claim bounded cohort, but funnel drop-off analytics are not repo-custodied.                                        | 4       | Do not optimize a broad funnel. Limit the next slice to the existing post-submit/member-return surface.                     |
| Agent demo feedback                  | No repo-custodied agent demo feedback artifact found for the expand-readiness pilot.                                                                                                                                                                                                                                                                 | Weak / absent.                                                                                                                                                                    | 5       | Do not authorize agent-demo-driven UX changes in this tranche.                                                              |

## Ranking Judgment

The highest-confidence P18 evidence is not broad conversion data. It is the live operational proof that a member-submitted claim moved from intake to public timeline update and resolved progression while SLA, custody, and privacy boundaries stayed green. That is enough to improve trust and activation on the returning-member claim-progress surface, but it is not enough to redesign the funnel, add analytics claims, change agent workflows, or widen portal architecture.

## One Implementation Recommendation

Promote `P18-UX02 Member Claim Progress Clarity` as the next bounded implementation slice.

Recommended scope:

- Improve the existing member claim-progress surface so a returning member can quickly see the current claim state, latest member-visible update, and expected next action using existing read-model and public timeline data.
- Preserve current authorization, tenant scoping, canonical routes, and proxy behavior.
- Do not add schema, Stripe, new portals, broad dashboard redesign, agent-demo features, or product analytics instrumentation unless separately authorized.
- Add focused tests around the rendered member-facing states and any helper logic used to derive the displayed progress summary.

## Non-Recommendations

- Do not promote a broad activation-funnel redesign; drop-off data is not repo-custodied.
- Do not promote agent-demo UX work; no repo-custodied agent feedback artifact was found.
- Do not change routing, proxy, auth, tenancy, billing, or portal structure.
- Do not claim pilot conversion learning beyond the single bounded KS cohort evidence.

## Verification Plan For This Slice

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- pre-PR reviewer pool
- `pnpm verify-slice -- --required-gates`
