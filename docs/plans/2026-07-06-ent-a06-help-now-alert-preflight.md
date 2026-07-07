---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-06
related:
  - docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md
  - docs/plans/ent-alert15-help-now-public-surface-alert-coverage-2026-07-05.md
  - docs/plans/2026-07-06-b6-b7-help-now-exercise-worksheet.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
---

# ENT-A06 Help Now Alert Preflight

> Status: B7 preflight record only. This document does not mutate Sentry,
> PostHog, Vercel, service-worker behavior, runtime code, provider rules, or
> public Help Now exposure. It records what can and cannot be proven before a
> real alert owner runs the provider exercise.

## Classification

Classified as `documentation/external-tracker-only` because this preflight
inspects existing files and creates an operator evidence record. It does not
change product behavior, provider configuration, alerts, routing, auth,
tenancy, schema, RLS, billing, or service-worker code.

## Authority Boundary

Current authority still requires:

- `ENT-A06` alert coverage proof before non-dark `MOB-01b`;
- no runtime implementation while resolver state is
  `blocked_requires_current_authority` / `activeSlice=null`;
- no provider mutation unless the alert owner records the provider action
  outside this preflight and links safe evidence back into the repo.

## Inspected Surfaces

| Surface                | File                                              | Finding                                                                                                                                        |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Server Sentry init     | `apps/web/src/sentry.server.config.ts`            | Sentry initializes only in production with a real DSN and non-automated environment.                                                           |
| Edge Sentry init       | `apps/web/src/sentry.edge.config.ts`              | Same production/real-DSN guard as server config.                                                                                               |
| Next request errors    | `apps/web/src/instrumentation.ts`                 | `onRequestError` delegates to `Sentry.captureRequestError`, so route/server errors may reach Sentry when production Sentry is enabled.         |
| Help Now offline save  | `apps/web/src/features/help-now/offline.ts`       | Offline save returns `saved`, `unsupported`, or `failed`; it does not emit a Sentry event.                                                     |
| Help Now SW cache      | `apps/web/public/sw.js`                           | Service worker caches Help Now public routes and manifest with network-first fallback; caught cache/fetch failures are not reported to Sentry. |
| Help Now content packs | `apps/web/src/features/help-now/content-packs.ts` | All country packs are dark unless `exposure !== dark` and `l2SignOff !== null`.                                                                |
| Help Now analytics     | `apps/web/src/features/help-now/analytics.ts`     | Anonymous events use a low-cardinality allowlist through PostHog, not Sentry.                                                                  |

## Coverage Preflight Result

| Required B7 failure mode               | Current observable path                                                                                 | Preflight result                                                             | Next action                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Public route error                     | Next request error capture can send server/render failures to Sentry when production Sentry is enabled. | Partially observable, provider proof still missing.                          | Alert owner must verify provider project slug, rule/query, synthetic staging event, and acknowledgement.                    |
| Pack manifest failure                  | Manifest path exists at `/help-now-packs/content-packs.v1.json`; no dedicated provider event was found. | Not yet observable as a dedicated B7 signal.                                 | Either prove an existing provider monitor can detect manifest failures or request a later authorized instrumentation slice. |
| Service-worker install/control failure | Service-worker failures are handled locally; no provider event was found.                               | Not observable from repo evidence.                                           | Needs provider/browser-monitor proof or a later authorized instrumentation slice.                                           |
| Cache-save/cache-guard failure         | `cacheFreshResponse` catches cache write failures silently and tests guard allowed cache shape.         | Guard has test proof; live alert signal is missing.                          | Provider proof cannot be claimed from tests alone; alert owner must supply monitor or blocker.                              |
| Anonymous funnel failure               | Help Now events use PostHog allowlisted analytics.                                                      | Observable in analytics if PostHog is configured, but no alert proof exists. | Alert owner must provide dashboard/monitor alert or document safe substitute.                                               |
| Dark-state drift                       | Code requires `exposure !== dark` plus `l2SignOff`; no provider alert found.                            | Release/test guard exists, provider alert missing.                           | Treat as release-check coverage until a provider alert or explicit blocker is recorded.                                     |

## Operator Packet For B7 Owner

The alert owner should fill this section in a dated copy or append-only update.
Do not paste private channel URLs, DSNs, tokens, emails, phone numbers, raw
request paths with user parameters, cookies, IP addresses, claim IDs, document
IDs, or payment data.

```md
# ENT-A06 B7 Provider Proof - YYYY-MM-DD

## Identity

- Provider:
- Organization/project slug:
- Environment:
- Staging deployment SHA:
- Public route checked:
- Executed by:
- Alert owner:
- Accountable owner:

## Provider Inventory

| Failure mode                                 | Rule/monitor exists? | Safe rule id/name | Signal/query summary | Action destination recorded privately? | Owner | Result |
| -------------------------------------------- | -------------------- | ----------------- | -------------------- | -------------------------------------- | ----- | ------ |
| Public route error                           | yes/no               |                   |                      | yes/no                                 |       |        |
| Pack manifest failure                        | yes/no               |                   |                      | yes/no                                 |       |        |
| Service-worker install/control failure       | yes/no               |                   |                      | yes/no                                 |       |        |
| Cache-save/cache-guard failure               | yes/no               |                   |                      | yes/no                                 |       |        |
| Anonymous funnel failure or safe substitute  | yes/no               |                   |                      | yes/no                                 |       |        |
| Dark-state drift or release-check substitute | yes/no               |                   |                      | yes/no                                 |       |        |

## Synthetic Proof

- Production traffic affected: no
- Synthetic method:
- Trigger/event id:
- Trigger/event time:
- Provider event observed:
- First notification received:
- Acknowledged by:
- Acknowledged time:
- Triage destination stored outside repo: yes/no
- Public evidence location:

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

## Current B7 Disposition

`ENT-A06` remains **blocked**, not complete.

Reason: route/server errors may be observable through existing Sentry request
capture, but the current repo evidence does not prove provider/project slug,
rule inventory, SW/cache/manifest/funnel/dark-state alert coverage, synthetic
staging event, routed notification, or acknowledgement.

Next owner intake:
`docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md`.

This is the correct pre-runtime conclusion: do not start `MOB-01b` until the
owner intake and provider proof above are completed, or a later
current-authority gate promotes a minimal instrumentation slice to close the
missing observability.
