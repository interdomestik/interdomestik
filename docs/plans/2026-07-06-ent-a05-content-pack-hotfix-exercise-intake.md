---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-06
related:
  - docs/manual/runbook-content-pack-hotfix.md
  - docs/plans/2026-07-06-b6-b7-help-now-exercise-worksheet.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
  - docs/product/2026-07-05-mk-help-now-signature-package/05-operational-release-hold.md
---

# ENT-A05 Content-Pack Hotfix Exercise Intake

> Status: B6 owner/proof intake only. This document appoints nobody until a
> real operator fills the owner acceptance section. It does not mutate
> `apps/web/public/help-now-packs/content-packs.v1.json`, change service-worker
> behavior, deploy staging, expose MK, flip a runtime flag, or authorize
> `MOB-01b`.

## Purpose

`ENT-A05` / B6 is blocked because Interdomestik has a hotfix runbook, but not a
completed staging exercise proving that a Help Now country pack can be corrected,
revalidated through cache/service-worker behavior, and re-darkened safely.

This record turns B6 into one concrete operator assignment:

```text
name the B6 operator -> run one staging-only hotfix/re-darken exercise -> record pass/fail/block
```

Albanian operator-facing return instructions are available at
`docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md`.

## Current State

| Item                                      | State                                                  |
| ----------------------------------------- | ------------------------------------------------------ |
| Accountable program owner                 | Arben Lila until delegated                             |
| B6 staging operator                       | `TBD`                                                  |
| Content fact owner                        | `TBD`                                                  |
| Reviewer/counsel hotfix disposition owner | `TBD`                                                  |
| Manifest path                             | `apps/web/public/help-now-packs/content-packs.v1.json` |
| Current manifest version                  | `mob-01-help-now-dark-packs-2026-07-04-v1`             |
| Service-worker cache name                 | `interdomestik-help-now-v1`                            |
| Current public exposure                   | all listed country packs remain `dark`                 |
| B6 disposition                            | blocked                                                |

## Owner Acceptance

Leave unknown fields blank rather than guessing.

| Field                                                 | Value                |
| ----------------------------------------------------- | -------------------- |
| Staging operator name                                 | `TBD`                |
| Role / team                                           | `TBD`                |
| Can identify deployed staging SHA                     | `yes / no / blocked` |
| Can run or request staging deploy safely              | `yes / no / blocked` |
| Can inspect Help Now route on staging                 | `yes / no / blocked` |
| Can verify SW/cache behavior without user/member data | `yes / no / blocked` |
| Can re-darken or verify dark state on staging         | `yes / no / blocked` |
| Acceptance date                                       | `TBD`                |
| Operator signature or written approval reference      | `TBD`                |

## Required Exercise Coverage

`B6` can pass only if every row has `proven` or an explicit `blocked` result.

| Exercise area             | Required evidence                                           | Result | Evidence reference |
| ------------------------- | ----------------------------------------------------------- | ------ | ------------------ |
| Hotfix record opened      | country/pack, trigger, severity, owner, before hash         | `TBD`  | `TBD`              |
| Re-darken path            | affected route shows dark/placeholder state                 | `TBD`  | `TBD`              |
| Staging-only correction   | test content or manifest change is bounded to staging proof | `TBD`  | `TBD`              |
| Manifest version/hash     | before/after version and hash recorded                      | `TBD`  | `TBD`              |
| Staging deployment        | SHA and deploy/CD run recorded                              | `TBD`  | `TBD`              |
| Public route verification | supported locale route returns expected state               | `TBD`  | `TBD`              |
| SW/cache revalidation     | stale content clears after manifest/hash bump               | `TBD`  | `TBD`              |
| Cache safety              | no member/session/local incident data in SW cache           | `TBD`  | `TBD`              |
| Rollback/re-darken        | dark state returns after rollback/re-darken                 | `TBD`  | `TBD`              |
| Timing                    | deploy, update observed, stale cleared, re-darken observed  | `TBD`  | `TBD`              |

## Safe Exercise Rules

Allowed in this repo record:

- staging deployment SHA and CI/CD run URL;
- public route path such as `/sq/help-now` or `/mk/help-now`;
- content-pack version/hash;
- browser/cache inspection summary;
- screenshot or trace path that contains no private user data;
- operator name, reviewer name, and dated decision.

Forbidden in this repo record:

- production secrets, cookies, tokens, DSNs, raw request headers;
- member ids, tenant ids, claim ids, document ids, payment ids;
- local incident bundle contents, uploaded files, photos, or free-text reports;
- private staging credentials, private destination URLs, or mailbox contents.

## Proof Intake

Copy this section into a dated append-only record once the operator runs the
staging exercise.

```md
# ENT-A05 B6 Content-Pack Hotfix Exercise - YYYY-MM-DD

## Identity

- Country / pack:
- Environment:
- Staging deployment SHA:
- CD/deploy run:
- Executed by:
- Accountable owner:
- Content fact owner:
- Reviewer/counsel:

## Manifest

- Manifest path:
- Version before:
- Hash before:
- Version after:
- Hash after:
- Public exposure before:
- Public exposure after:

## Scenario

- Trigger simulated:
- Severity:
- Expected first action:
- Production traffic affected: no
- Customer/member data accessed: no

## Evidence

| Step                           | Result | Evidence |
| ------------------------------ | ------ | -------- |
| Hotfix record opened           |        |          |
| Re-darken affected pack        |        |          |
| Patch staging test content     |        |          |
| Manifest/hash updated          |        |          |
| Staging deploy observed        |        |          |
| Public route verified          |        |          |
| SW/cache revalidation verified |        |          |
| Cache safety verified          |        |          |
| Rollback/re-darken verified    |        |          |

## Timings

- Deploy complete:
- Updated content first observed:
- Stale content cleared:
- Re-darken first observed:

## Decision

- B6 result: pass / fail / blocked
- Blocking findings:
- Follow-up owner:
- Release owner sign-off:
```

## Completion Rule

`ENT-A05` remains blocked until this record or a dated follow-up record names a
B6 operator and proves the staging exercise safely.

If the operator cannot prove SW/cache revalidation or rollback/re-darken behavior
without unsafe data exposure, the correct disposition is `blocked`. Do not mark
B6 done from a runbook-only record.
