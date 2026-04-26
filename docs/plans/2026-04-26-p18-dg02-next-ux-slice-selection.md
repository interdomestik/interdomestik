# P18-DG02 Next UX Slice Selection

## Slice

- Slice: `P18-DG02`
- Date: `2026-04-26`
- Owner: `web + product + qa`
- Purpose: promote exactly one next bounded `P18` implementation slice after `P18-UX02` completed the rank-1 operational-progression recommendation from `P18-UX01`.

## Scope Constraints

This is a design-gate and tracker-promotion slice only. It does not authorize changes to `apps/web/src/proxy.ts`, canonical routes, auth layering, tenancy architecture, Stripe posture, schema, portal structure, broad dashboard design, analytics claims, or agent-demo-driven changes.

## Inputs

| Input                                                                       | Use in decision                                                                                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-04-26-p18-ux01-evidence-ranking.md`                        | Confirms `P18-UX02` consumed the rank-1 operational-friction recommendation and leaves SLA/trust posture as the strongest remaining repo-custodied signal.                        |
| `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_pilot-ks-expand-readiness-2026-04-15.md` | Records triage SLA `<4h` met at `1h 40m`, public update SLA `<24h` met at `<1h`, no Sev1/Sev2 incident posture, green E2E/security posture, and met privacy/RBAC rerun threshold. |
| `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-expand-readiness-2026-04-15.md`      | Records all tracked SLAs hit, 100% progression within 2 operating days, privacy/RBAC/multi-tenant boundaries passed, and 0 critical data/security incidents.                      |
| `docs/pilot/PILOT_CLOSEOUT_pilot-ks-expand-readiness-2026-04-15.md`         | Records the closeout proof that the bounded KS line met triage and public-update thresholds, kept clean custody, and passed corrected-baseline privacy/RBAC rerun.                |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`         | Confirm `P18` is active, `P18-DG01`, `P18-UX01`, and `P18-UX02` are complete, and no pending child slice remains.                                                                 |

## Selection Judgment

`P18-UX02` addressed the highest-confidence member-progress clarity gap by exposing current state, latest member-visible update, and expected next action on the canonical member claim detail surface.

The strongest remaining repo-custodied P18 evidence is SLA and trust posture. The pilot rollup and closeout prove that triage and public-update thresholds were met, no critical data/security incidents occurred, and privacy/RBAC boundaries held. That supports a bounded member-facing trust/SLA clarity slice, but it does not support broad funnel optimization, new analytics claims, agent-demo UX changes, or any route/auth/tenancy/schema work.

## Promoted Implementation Slice

Promote `P18-UX03 Member Trust And SLA Clarity` as the next bounded implementation slice.

Recommended scope:

- Use existing member-visible claim, timeline, SLA/status, support, and readiness data on existing canonical member surfaces.
- Make trust posture clearer for a returning member by showing what timing or handling assurance applies, what has already happened, and where to get help if action is needed.
- Keep all displayed claims conservative and derived from existing app data or localized static copy already supported by repo-custodied pilot proof.
- Preserve `apps/web/src/proxy.ts`, canonical routes, auth layering, tenant scoping, database schema, Stripe posture, portal structure, and broad dashboard design.
- Add focused tests for the rendered member-facing trust/SLA states and any helper logic used to derive them.

Non-recommendations:

- Do not promote a broad activation-funnel redesign; funnel drop-off analytics remain partial.
- Do not promote agent-demo feedback work; no repo-custodied agent-demo feedback artifact exists.
- Do not add product analytics instrumentation in this slice.
- Do not change routing, proxy, auth, tenancy, schema, billing, or portal structure.

## Verification Plan

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- pre-PR reviewer pool
- `pnpm verify-slice -- --required-gates`
