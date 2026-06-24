# OBR-DG32 Post-T-307 Next Authority

Date: 2026-06-24

## Classification

Classified as `promotion/design-gate` / Tier 0 because this gate updates only
repo current-authority planning records after the completed `T-307` closeout. It
does not change runtime source, tests, dependencies, schema/RLS/migrations,
proxy, routes, auth/session/tenancy runtime, billing/product UI, README, AGENTS,
or implementation-worker state.

## Inputs

- `T-307` implementation PR `#1191` merged at
  `33c8bde2ad397e5a2af448a9f7806596e186fb7c`.
- `T-307` closeout PR `#1192` merged at
  `14cfb959d5583deff1e021c8dfd163c4607e9613`.
- Post-closeout main health at `14cfb959` is green for CI `28115601701`
  including `validation-surface`, `audit`, `static`, `unit`, `ai-eval`, and
  DB-backed `e2e-gate`; Sonar Main Gate `28115601745`; Secret Scan/gitleaks
  `28115601756`; and CodeQL / Push on main `28115600961` with Actions and
  JavaScript/TypeScript analyses. CD/Vercel is deployment-only evidence.
- Current resolver on clean `origin/main` at `14cfb959` returned
  `blocked_requires_current_authority`, `activeSlice=null`, reason
  `umbrella_without_concrete_promoted_slice`.

## Candidate Screen

| Candidate                    | Decision | Rationale                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T-502`                      | Promote  | Smallest unblocked M5 continuation after `T-307`: consolidate to the four canonical portal layout groups, actively retire `legacy/` and duplicate agent layouts, remove remaining per-country host branching, keep one protected-route gate, and prove consolidated-layout behavior on `ida.localhost`. Dependencies `T-307` and `T-109` are complete. |
| Direct destructive `T-503`   | Park     | Still destructive schema/status removal. Requires fresh release/destructive-migration proof and explicit risk review before promotion.                                                                                                                                                                                                                 |
| Broad M3/M4/M5               | Park     | Umbrella work is not a concrete governed slice.                                                                                                                                                                                                                                                                                                        |
| Dependabot `#1128` / `#1106` | Park     | Out of scope unless separately promoted and current-head reviewed.                                                                                                                                                                                                                                                                                     |

## Promotion

This gate promotes exactly one next governed implementation slice: `T-502`.

Future `T-502` is limited to the canonical tracker acceptance:

- consolidate to exactly four portal layout groups;
- actively delete `legacy/`, `legacy/agent`, and duplicate `(dashboard)/agent`
  route/layout surfaces rather than merely unrouting them;
- collapse duplicate client layout components to the four shells with static
  proof of zero orphaned client layout;
- preserve canonical `/member`, `/agent`, `/staff`, and `/admin` routes;
- preserve contractual `*-page-ready` clarity markers;
- keep one protected-route gate;
- remove per-country host branching;
- prove consolidated-layout behavior on `ida.localhost`.

Because this is route/layout/proxy-adjacent M5 work, the future implementation
worker must classify it as Tier 3 unless narrower repo evidence proves otherwise.
`apps/web/src/proxy.ts` remains read-only unless a specific edit is freshly
authorized with risk review.

## Non-Goals

This gate does not authorize direct destructive `T-503`, schema/RLS/migrations,
billing/product UI, additional entity migration, Operational Brain runtime/live
AI, Dependabot work, README, AGENTS, broad M3/M4/M5, broad architecture rewrites,
or any implementation work before this gate merges and post-merge main health is
green.

## Verification

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs /Users/arbenlila/.codex/worktrees/f711/interdomestik-crystal-home`
  should resolve exactly `T-502` after this gate.
