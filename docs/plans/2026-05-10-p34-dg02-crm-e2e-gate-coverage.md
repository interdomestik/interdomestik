---
status: design-review
date: 2026-05-10
slice: P34-DG02
title: CRM E2E Gate Coverage Selection
owner: platform + product + qa
phase: Phase C
---

# P34-DG02 CRM E2E Gate Coverage Selection

## Decision

`P34-DG02` is the post-`P34-CRM12` selection gate for the remaining P34 production-readiness
evidence gap.

The next bounded implementation slice is:

`P34-CRM13 CRM E2E Gate Coverage`

This gate promotes CRM13 because the P34 roadmap's production-readiness gate requires focused E2E
gate coverage for support-handoff and agent CRM flows. The support-handoff reply/follow-up flow is
already covered in the existing gate suite. Agent CRM follow-up currently has focused golden
coverage, but the canonical blocking gate lane does not yet prove the CRM12 schedule/due/complete
path.

## Inputs

| Input                                                        | Relevance                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-09-p34-domain-crm-production-roadmap.md` | Names focused E2E gate coverage for support-handoff and agent CRM flows as a production-readiness condition.                                      |
| `P34-CRM10`                                                  | Added staff needs-follow-up behavior after member replies on the existing staff support-handoff surface.                                          |
| `apps/web/e2e/gate/staff-support-handoffs.spec.ts`           | Already covers member reply, staff needs-follow-up attention filtering, staff follow-up, and the terminal member reply contract in the gate lane. |
| `P34-CRM12`                                                  | Added agent lead follow-up scheduling/completion and due follow-up surfacing on existing agent CRM pages.                                         |
| `apps/web/e2e/golden/agent-lead-detail.spec.ts`              | Proves the lead-detail follow-up behavior outside the canonical gate lane, leaving the gate-readiness gap.                                        |

## Residual Ranking

| Rank | Candidate                                                               | Decision          | Rationale                                                                                                          |
| ---: | ----------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
|    1 | Agent CRM follow-up gate coverage                                       | Promote           | Smallest remaining P34 production-readiness gap; covers existing behavior without product redesign or schema work. |
|    2 | Support-handoff gate coverage                                           | Already satisfied | The gate suite already covers the bounded member-reply and staff-follow-up loop.                                   |
|    3 | Broad CRM E2E matrix                                                    | Defer             | Too wide for the remaining readiness gap and would mix unrelated CRM surfaces.                                     |
|    4 | Full conversation threads, attachments, SLA timers, campaigns, cron/NPS | Reject            | Explicitly outside P34 scope.                                                                                      |

## Promoted Slice

`P34-CRM13 CRM E2E Gate Coverage`

Implementation scope:

- add one focused gate-path Playwright spec for the existing agent CRM follow-up workflow;
- wire the spec into the actual PR gate matrix by ensuring `gate-mk-contract` includes the default
  `gate/**/*.spec.ts` match set;
- seed a temporary tenant-owned CRM lead and deal for the current gate project;
- prove an agent can schedule a follow-up from `/agent/leads/[id]`;
- prove the scheduled follow-up appears on `/agent/crm` as due work;
- prove opening and completing the follow-up clears the due queue;
- prove same-tenant future follow-ups and other-tenant due follow-ups do not appear in the current
  agent's due queue;
- keep the spec locale-neutral by using stable test IDs and seeded IDs rather than translated
  strings for assertions;
- keep the spec aligned to the gate convention with `--workers=1`; IDs include `workerIndex`,
  retry, and timestamp defensively;
- clean up the exact runtime-seeded `crm13-follow-up-*` lead/deal/activity rows for the current
  test after every run so `seed-contract.spec.ts` baseline assertions are not contaminated and
  parallel project runs do not delete each other's rows;
- add only stable `data-testid` and `data-lead-id` markers needed for locale-neutral gate
  assertions.

Allowed touch points:

- `apps/web/e2e/gate/**`;
- `apps/web/playwright.config.ts`;
- existing agent CRM and lead-detail page markup for stable test selectors;
- `docs/plans/current-program.md`;
- `docs/plans/current-tracker.md`;
- this design-gate document.

Must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes;
- auth provider/session layering;
- tenancy architecture;
- schema or migrations;
- Stripe;
- README, AGENTS, or architecture docs;
- CRM product behavior beyond selector-only markup.

## Verification Plan

Focused:

- `NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web build:ci`
- `pnpm --filter @interdomestik/web exec playwright test e2e/gate/agent-crm-follow-up.spec.ts --project=gate-ks-sq --project=gate-mk-mk --workers=1`
- `pnpm --filter @interdomestik/web exec playwright test e2e/gate/agent-crm-follow-up.spec.ts --project=gate-ks-sq --project=gate-mk-contract --workers=1`
- `pnpm seed:assert-e2e`

Program and static:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`

Required gates before merge:

- `pnpm verify-slice -- --required-gates`

CRM13 is accepted only when the actual PR-gate run shows the new spec executing on both
`gate-ks-sq` and `gate-mk-contract` and passing.
