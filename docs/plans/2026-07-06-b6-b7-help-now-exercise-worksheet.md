---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-06
related:
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
  - docs/manual/runbook-content-pack-hotfix.md
  - docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md
  - docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md
  - docs/plans/ent-alert15-help-now-public-surface-alert-coverage-2026-07-05.md
  - docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md
---

# B6/B7 Help Now Exercise Worksheet

> Status: worksheet only. This does not complete B6, complete B7, mutate any
> provider, start runtime implementation, expose MK content, or authorize
> `MOB-01b`. It exists so the staging hotfix exercise and alert proof can be
> run consistently when the operators are ready.

## Purpose

Close the remaining operational proof gap for non-dark Help Now exposure:

- B6: prove the content-pack hotfix and re-darken path on staging.
- B7: prove public Help Now alert coverage and acknowledgement without writing
  secrets, PII, private alert destinations, or production traffic details to the
  repo.

`MOB-01b` stays blocked until this worksheet is completed with evidence, the MK
L2 package is signed, and current authority later promotes exactly `MOB-01b`.

Reviewer/operator-facing Albanian return instructions are consolidated in
`docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md`.

## Execution Rule

Use the Interdomestik slice-runner skill for gate, authority, verification, PR,
or implementation work. The skill is advisory workflow machinery. Repo
`AGENTS.md`, `docs/plans/current-program.md`,
`docs/plans/current-tracker.md`, resolver state, and merged gate records remain
the actual authority.

## Owner Assignment

| Role                        | Required for        | Named owner | Evidence required                                            |
| --------------------------- | ------------------- | ----------- | ------------------------------------------------------------ |
| Accountable owner           | B6/B7 disposition   | Arben Lila  | Sign-off line in this worksheet                              |
| Staging deployment operator | B6                  | TBD         | Deployed SHA, run URL, and propagation timings               |
| Content fact owner          | B6                  | TBD         | Pack row or correction scenario approved for staging test    |
| L2 reviewer/counsel         | B6 blocker clearing | TBD         | Hotfix disposition or explicit hold                          |
| Alert owner                 | B7                  | TBD         | Provider rule inventory and acknowledgement proof            |
| Support escalation owner    | B7 before exposure  | TBD         | Escalation path recorded without private destination details |

TBD owner cells are blockers. B6/B7 cannot be marked done until every required
owner is named or a documented blocker replaces the missing owner.

## Preconditions

| Check          | Required result                                                                               | Evidence                                   |
| -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Resolver state | `blocked_requires_current_authority` / `activeSlice=null`, unless a later gate supersedes it  | command output or current-program citation |
| Runtime safety | No production exposure, no public flag flip, no provider mutation without explicit approval   | operator note                              |
| Staging target | Staging deployment SHA known                                                                  | SHA / CD run URL                           |
| Test country   | MK or a staging-only test pack path selected                                                  | country / pack id                          |
| Secret hygiene | No secrets, raw PII, private alert destination, cookies, tokens, or member data in the record | reviewer check                             |

## B6 Staging Hotfix Exercise

Owner intake:
`docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md`
is the assignment record for the B6 staging operator. B6 cannot pass while that
operator is `TBD`.

Record the first staging exercise here or copy this section into a dated
append-only record.

```md
# B6 Content-Pack Hotfix Exercise - YYYY-MM-DD

- Country / pack:
- Environment:
- Staging deployment SHA:
- CD/deploy run:
- Executed by:
- Accountable owner:
- Content fact owner:
- L2 reviewer/counsel:

## Scenario

- Trigger simulated:
- Severity:
- Expected first action:
- Production traffic affected: no
- Customer data accessed: no

## Evidence Table

| Step                           | Expected proof                                  | Result | Evidence link / SHA / URL |
| ------------------------------ | ----------------------------------------------- | ------ | ------------------------- |
| Open hotfix record             | country, pack hash, trigger, severity, owner    |        |                           |
| Re-darken affected pack        | public route returns dark/placeholder state     |        |                           |
| Patch staging test content     | config/content change reviewed for staging only |        |                           |
| Manifest/hash updated          | before/after version and hash recorded          |        |                           |
| Staging deploy observed        | deploy SHA and run URL recorded                 |        |                           |
| Public route verified          | supported locale route returns expected state   |        |                           |
| SW/cache revalidation verified | stale content clears after manifest/hash bump   |        |                           |
| No member/session data cached  | inspection/test output linked                   |        |                           |
| Rollback/re-darken verified    | dark state returns after rollback/re-darken     |        |                           |

## Timings

- Deploy complete:
- Updated content first observed:
- Stale content cleared:
- Re-darken first observed:

## Decision

- B6 result: pass / fail / blocked
- Blocking findings:
- Non-blocking findings:
- Follow-up owner:
- Release owner sign-off:
```

## B7 Alert Coverage Exercise

Preflight:
`docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md` records that
route/server errors may be observable through existing Sentry request capture,
but SW/cache/manifest/funnel/dark-state alert coverage is not proven by current
repo evidence. Treat that preflight as the starting state for the alert owner.

Owner intake:
`docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md`
is the assignment record for the B7 alert owner. B7 cannot pass while that owner
is `TBD`.

Record the first alert proof here or copy this section into a dated append-only
record.

```md
# B7 Help Now Alert Coverage Exercise - YYYY-MM-DD

- Environment:
- Provider/project:
- Public route checked:
- Deployed SHA:
- Executed by:
- Alert owner:
- Accountable owner:

## Provider Inventory

| Failure mode                 | Provider rule id / monitor | Query or signal | Warning action | Critical action | Owner | Result |
| ---------------------------- | -------------------------- | --------------- | -------------- | --------------- | ----- | ------ |
| Public route error           |                            |                 |                |                 |       |        |
| Pack manifest failure        |                            |                 |                |                 |       |        |
| Service-worker/cache failure |                            |                 |                |                 |       |        |
| Cache-guard violation        |                            |                 |                |                 |       |        |
| Funnel pipeline failure      |                            |                 |                |                 |       |        |
| Dark-state drift             |                            |                 |                |                 |       |        |

## Synthetic Staging Proof

- Production traffic affected: no
- Synthetic method:
- Trigger id/time:
- First provider event observed:
- First notification received:
- Acknowledged by:
- Acknowledged time:
- Triage destination recorded privately: yes / no
- Public evidence location:

## Safety Check

- Secrets exposed in this record: no
- Raw PII or customer data exposed: no
- Private alert destination exposed: no
- Runtime/provider mutation authorized separately: yes / no / not needed

## Decision

- B7 result: pass / fail / blocked
- Blocking findings:
- Non-blocking findings:
- Follow-up owner:
- Owner sign-off:
```

## Completion Rule

B6 is complete only when the B6 record has a `pass` result, all required owners
are named, propagation timings are measured, and rollback/re-darken proof is
linked.

B7 is complete only when the B7 record has a `pass` result, every required
failure mode has a provider rule/monitor or explicit blocker, one staging-safe
synthetic signal is observed, one alert is received and acknowledged, and the
record contains no secrets or PII.

If either result is `fail` or `blocked`, `MOB-01b` remains blocked and the next
current-authority discussion must cite the failure signature.
