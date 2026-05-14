# P38-DG08 Post-CRM05 Closeout And Next Slice Selection

Status: complete  
Slice: `P38-DG08`  
Date: 2026-05-14  
Promoted implementation slice: `P38-CRM12 Reporting Dashboard UI`

## Inputs

- `P38-CRM05 Reporting Read-Models And Forecast Snapshots` is complete through PR `#756`,
  merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.
- CRM05 added the reporting domain namespace, app-side reporting repository, additive
  `crm_pipeline_snapshots` persistence, deterministic derivation tests, PII-shape regression, and
  remote proof with SonarCloud, Copilot/pr-finalizer, Pilot Gate, unit, and E2E green.
- `P38-DG07` reserved `P38-CRM12 Reporting Dashboard UI` and
  `P38-CRM13 Forecast Snapshot Scheduler` after CRM05.

## Decision

Promote exactly one bounded implementation slice:

`P38-CRM12 Reporting Dashboard UI`

CRM05 created the read-model and adapter foundation specifically so dashboard surfaces can stop being
counter-only and start showing credible funnel, velocity, weighted pipeline, win-rate, and leaderboard
signals. The next shippable slice should consume those read models on existing CRM dashboard surfaces
before scheduled snapshot generation, routing persistence, or cleanup gates.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                                                               |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P38-CRM12 Reporting Dashboard UI`                 | Promote now. It is the direct user-visible unlock from CRM05 and validates the read-model contracts against real dashboard ergonomics. |
| 2    | `P38-CRM13 Forecast Snapshot Scheduler`            | Defer. Useful after dashboards exist; CRM05 already provides manual/adapter snapshot persistence without cron behavior.                |
| 3    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Defer. Routing remains important, but dashboard professionalism now has the data foundation it was waiting for.                        |
| 4    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Requires more reader confidence and explicit retirement proof.                                                                  |
| 5    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null evidence and backfill confidence.                                                                 |

## Implementation Scope For P38-CRM12

Allowed:

- Existing `/agent/crm` dashboard surface and co-located server/read-model wrappers.
- Existing app-side `domain-crm` reporting repository consumption.
- Existing `agent-crm` messages and focused component/unit tests.
- Optional admin/staff aggregate-only CRM dashboard read wiring if the existing route already has a
  CRM dashboard surface; otherwise keep admin/staff CRM reporting out of the first UI slice.
- E2E or focused route proof that preserves `agent-crm-page-ready`.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names or access-control architecture.
- Auth/session layering or tenant isolation architecture.
- New CRM schema/migrations, scheduled jobs, cron workers, snapshot generation automation, routing
  persistence, routing admin UX, legacy deal column retirement, CRM04 nullability tightening, Stripe,
  README, AGENTS.md, or broad architecture docs.

## Contract Expectations

- Dashboard queries must go through the CRM05 reporting repository/domain read-model boundary, not
  ad hoc SQL in route components.
- Agent-scoped dashboard output must stay agent-owned; peer-relative leaderboard or branch aggregate
  comparisons for agents remain out of scope unless the existing authorization contract explicitly
  permits them.
- Display multi-currency metrics grouped by currency. Do not convert currencies in the UI slice.
- Preserve PII discipline: aggregate reporting widgets must not expose email, phone, notes, raw
  activity description, or unrelated lead/contact names.
- Preserve clarity markers, especially `agent-crm-page-ready`, and keep route behavior compatible
  with existing gate specs.

## Verification Plan

- `pnpm --filter @interdomestik/web test:unit --run <touched CRM dashboard tests>`
- `pnpm --filter @interdomestik/domain-crm test:unit --run src/reporting/index.test.ts`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm check:db-access`
- `pnpm verify-slice -- --static`
- Before PR/merge: `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`
- `interdomestik_qa.scope_audit` with docs plus explicitly authorized CRM dashboard/reporting paths.

## Promotion / Sign-Off

| Slice                                                    | Status   | Authority                | Notes                                                                |
| -------------------------------------------------------- | -------- | ------------------------ | -------------------------------------------------------------------- |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | complete | PR `#756`                | Merge commit `e9cc7eef34c6b1ce29be2aeb492cb5a299fe9190`.             |
| `P38-CRM12 Reporting Dashboard UI`                       | promoted | `P38-DG08`               | Consume CRM05 read models on existing dashboard surfaces.            |
| `P38-CRM13 Forecast Snapshot Scheduler`                  | reserved | post-dashboard           | Cron/worker snapshot generation remains deferred.                    |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | future gate              | Still valid, but not selected ahead of CRM reporting UI.             |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-routing-persistence | Requires routing persistence first.                                  |
| `P38-CRM10 Legacy Deal Column Retirement`                | reserved | later gate               | Requires normalized-reader confidence and explicit retirement proof. |
| `P38-CRM11 Deal Nullability Tightening`                  | reserved | later gate               | Requires production zero-null evidence.                              |
