---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-06
related:
  - docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md
  - docs/plans/ent-alert15-help-now-public-surface-alert-coverage-2026-07-05.md
  - docs/plans/2026-07-06-b6-b7-help-now-exercise-worksheet.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
---

# ENT-A06 Alert Owner Assignment And Proof Intake

> Status: owner/proof intake only. This document appoints nobody until a real
> operator fills and signs the owner acceptance section. It does not mutate
> Sentry, PostHog, Vercel, service-worker behavior, provider rules, alert
> destinations, runtime code, or public Help Now exposure.

## Purpose

`ENT-A06` / B7 is blocked because Interdomestik does not yet have durable proof
that public Help Now alert coverage exists and reaches a named owner.

This record turns the next human action into one concrete assignment:

```text
name the B7 alert owner -> inspect provider coverage -> record safe proof -> pass/fail/block B7
```

Albanian owner-facing return instructions are available at
`docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md`.

## Current State

| Item                      | State                      |
| ------------------------- | -------------------------- |
| Accountable program owner | Arben Lila until delegated |
| B7 alert owner            | `TBD`                      |
| Provider/project slug     | `TBD`                      |
| Provider proof            | missing                    |
| Synthetic event proof     | missing                    |
| Routed notification proof | missing                    |
| Acknowledgement proof     | missing                    |
| B7 disposition            | blocked                    |

## Owner Acceptance

The B7 alert owner accepts responsibility for proving or blocking the alert
coverage below. Leave unknown fields blank rather than guessing.

| Field                                                           | Value                                                |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| Alert owner name                                                | `TBD`                                                |
| Role / team                                                     | `TBD`                                                |
| Provider access level                                           | `read-only / rule-admin / destination-admin / other` |
| Provider/project slug verified                                  | `TBD`                                                |
| Can inspect rule queries                                        | `yes / no / blocked`                                 |
| Can inspect alert actions without exposing private destinations | `yes / no / blocked`                                 |
| Can trigger provider-supported test notification safely         | `yes / no / blocked`                                 |
| Can confirm receipt/acknowledgement metadata                    | `yes / no / blocked`                                 |
| Acceptance date                                                 | `TBD`                                                |
| Owner signature or written approval reference                   | `TBD`                                                |

## Required Coverage

The owner must fill every row with `proven`, `safe substitute`, or `blocked`.
`B7` can pass only if every required mode has acceptable evidence and at least
one routed notification is observed and acknowledged.

| Failure mode                           | Required evidence                                                                     | Result | Evidence reference |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ------ | ------------------ |
| Public route error                     | Sentry/provider rule or monitor for `/:locale/help-now` route/server errors           | `TBD`  | `TBD`              |
| Pack manifest failure                  | Rule/monitor or documented safe substitute for missing/invalid/stale manifest         | `TBD`  | `TBD`              |
| Service-worker install/control failure | Rule/monitor, browser monitor, or documented blocker                                  | `TBD`  | `TBD`              |
| Cache-save/cache-guard failure         | Rule/monitor or release-check substitute plus explicit blocker for missing live alert | `TBD`  | `TBD`              |
| Anonymous funnel failure               | PostHog/provider dashboard alert or safe substitute                                   | `TBD`  | `TBD`              |
| Dark-state drift                       | Provider alert, release check, or explicit blocker tied to country-pack sign-off      | `TBD`  | `TBD`              |

## Safe Provider Proof Rules

Allowed in this repo record:

- provider name and non-secret project slug;
- sanitized rule id or rule name;
- query summary using low-cardinality terms only;
- trigger time, first notification time, acknowledgement time;
- owner name or role;
- public evidence path or internal ticket id without private body text.

Forbidden in this repo record:

- DSNs, API tokens, cookies, raw URLs with user parameters, IP addresses;
- emails, phone numbers, private channel URLs, or private destination ids;
- tenant ids, user ids, claim ids, document ids, payment ids;
- raw request bodies, mailbox contents, uploaded document names, or free-text
  incident notes.

## Proof Intake

Copy this section into a dated append-only record once the owner runs the
provider exercise.

```md
# ENT-A06 B7 Owner Proof - YYYY-MM-DD

## Identity

- Alert owner:
- Provider/project:
- Environment:
- Staging deployment SHA:
- Public route checked:
- Accountable owner:

## Inventory Result

| Failure mode                                 | Result | Safe rule id/name or blocker | Evidence reference |
| -------------------------------------------- | ------ | ---------------------------- | ------------------ |
| Public route error                           |        |                              |                    |
| Pack manifest failure                        |        |                              |                    |
| Service-worker install/control failure       |        |                              |                    |
| Cache-save/cache-guard failure               |        |                              |                    |
| Anonymous funnel failure or safe substitute  |        |                              |                    |
| Dark-state drift or release-check substitute |        |                              |                    |

## Notification Proof

- Production traffic affected: no
- Synthetic method:
- Trigger/event id:
- Trigger/event time:
- First notification received:
- Acknowledged by:
- Acknowledged time:
- Triage destination stored outside repo: yes/no

## Safety Review

- Secrets in repo record: no
- Raw PII/customer data in repo record: no
- Private destination in repo record: no
- High-cardinality tags used: no
- Unsafe production traffic used: no

## Decision

- B7 result: pass / fail / blocked
- Blocking findings:
- Follow-up owner:
- Owner sign-off:
```

## Completion Rule

`ENT-A06` remains blocked until this record or a dated follow-up record names a
B7 alert owner and proves all required coverage safely.

If the owner cannot prove SW/cache/manifest/funnel/dark-state coverage from the
provider, the correct disposition is `blocked`, followed by a later
current-authority request for a minimal instrumentation slice. Do not mark B7
done from route-error coverage alone.
