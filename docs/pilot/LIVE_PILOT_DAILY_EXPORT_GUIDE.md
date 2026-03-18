# Live Pilot Daily Export Guide

Use this guide at the end of each live pilot day to produce the canonical claim-cohort export that backs the daily sheet and the copied evidence index.

This guide exists to prevent the main failure mode from the rehearsal closeout: reaching Day 7 without defensible week-1 SLA evidence.

## Purpose

The daily export must prove, from the canonical live data source, that:

- real claims were created that day
- real `claim_stage_history` rows exist for those claims
- first staff triage can be timed
- first member-visible update can be timed

If the export does not prove those points, the day is not ready for canonical evidence recording.

## Pilot And File Naming

- Pilot ID: `pilot-ks-live-2026-03-18`
- Export folder: `docs/pilot/live-data/`
- Daily file pattern:

```text
docs/pilot/live-data/pilot-ks-live-2026-03-18_day-N_claim-timeline-export.csv
```

## Daily Time Windows

Use these exact day windows when exporting:

| Day | Date         | Start                 | End                   |
| --- | ------------ | --------------------- | --------------------- |
| 1   | `2026-03-18` | `2026-03-18 00:00:00` | `2026-03-19 00:00:00` |
| 2   | `2026-03-19` | `2026-03-19 00:00:00` | `2026-03-20 00:00:00` |
| 3   | `2026-03-20` | `2026-03-20 00:00:00` | `2026-03-21 00:00:00` |
| 4   | `2026-03-21` | `2026-03-21 00:00:00` | `2026-03-22 00:00:00` |
| 5   | `2026-03-22` | `2026-03-22 00:00:00` | `2026-03-23 00:00:00` |
| 6   | `2026-03-23` | `2026-03-23 00:00:00` | `2026-03-24 00:00:00` |
| 7   | `2026-03-24` | `2026-03-24 00:00:00` | `2026-03-25 00:00:00` |

## Canonical Export Query

Run this query against the canonical live pilot data source.

```sql
select
  c.id,
  c.tenant_id,
  c.branch_id,
  c."userId" as member_id,
  c."createdAt" as claim_created_at,
  first_value(h.created_at) over (
    partition by c.id
    order by h.created_at
  ) as submitted_at,
  c.status as current_status,
  h.claim_id,
  h.to_status,
  h.is_public,
  h.created_at as history_created_at
from claim c
left join claim_stage_history h
  on h.claim_id = c.id
 and h.tenant_id = c.tenant_id
where c.tenant_id = 'tenant_ks'
  and c."createdAt" >= timestamp :day_start
  and c."createdAt" < timestamp :day_end
order by c."createdAt", h.created_at;
```

The current repo schema does not store `submitted_at` on the claim row. Use the earliest timeline row for the claim as the exported `submitted_at` fallback and record that choice explicitly in the daily sheet.

That fallback is an inference. It is acceptable only if the export still allows a defensible triage denominator.

## Required Export Columns

The CSV or JSON export must include, at minimum:

- `id`
- `tenant_id`
- `branch_id`
- `member_id`
- `claim_created_at`
- `submitted_at` derived from the earliest timeline row
- `current_status`
- `claim_id`
- `to_status`
- `is_public`
- `history_created_at`

## How To Use The Export In The Daily Sheet

Fill the daily sheet in this order:

1. Record the export path in `Daily export path`.
2. Copy claim rows into `Claims Created Today`.
3. For each submitted claim, determine the first staff triage timestamp and fill `First-Triage SLA Proof`.
4. For each triaged claim, determine the first public update timestamp and fill `First Public Update SLA Proof`.
5. Record every late, missing, or ambiguous timestamp in `SLA Mismatch Log`.
6. Record the exact query or script used in `Evidence References`.

## Daily Go / No-Go Checks

Before writing canonical evidence, confirm all of the following:

- the export file exists in `docs/pilot/live-data/`
- at least one real claim row exists for the day, unless the day is the `PD07` closeout window and the daily sheet explicitly marks live traffic as optional
- at least one `claim_stage_history` row exists for at least one claim
- branch attribution is correct
- tenant attribution is correct
- triage timing is measurable for claims that entered the triage denominator
- public update timing is measurable for claims that entered the update denominator

## Immediate Pause Conditions

Pause the live pilot day if any of these are true:

- `0` real claims exist in the daily export for a claim-intake day
- claims exist but all timeline fields are empty
- claim rows are present but belong to the wrong tenant or branch
- timestamps are synthetic, copied, or otherwise non-canonical
- the daily export cannot support a defensible SLA numerator or denominator
- any privacy, RBAC, branch-isolation, or tenant-isolation leak is observed

If a day hits one of these conditions, keep the working sheet at `blocked` and do not write canonical evidence until the issue is corrected.

For `PD07`, treat `0` same-day claims as acceptable only when:

- the daily sheet records Day 7 live traffic as optional
- Days 1-6 exports remain usable
- the closeout includes a checked-in week-1 KPI/SLA rollup and linked weekly observability or decision rows

## End-Of-Day Checklist

1. Export the daily cohort from the canonical live DB.
2. Save it under `docs/pilot/live-data/` using the day-specific file name.
3. Fill `Claims Created Today`.
4. Fill `First-Triage SLA Proof`.
5. Fill `First Public Update SLA Proof`.
6. Fill `SLA Mismatch Log`.
7. Fill `Boundary And Privacy Spot-Checks`.
8. Fill `Observability Notes`.
9. Assign the day color and decision.
10. If evidence is complete, write the canonical rows:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-live-2026-03-18 ...
pnpm pilot:observability:record -- --pilotId pilot-ks-live-2026-03-18 ...
pnpm pilot:decision:record -- --pilotId pilot-ks-live-2026-03-18 ...
```

## Week-1 Closeout Rule

Day 7 must not reconstruct the week from memory.

The week-1 closeout must be computed from the daily exports and daily sheets. If `PD07` is a closeout-only day with optional traffic, a header-only Day 7 export is acceptable only when Days 1-6 carry the claim-bearing cohort and the repo also contains the checked-in week-1 KPI/SLA rollup plus the linked Day 7 executive-review artifacts. Otherwise, the week-1 SLA proof is incomplete and the final recommendation must stay bounded.
