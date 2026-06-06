---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT07 Auth RLS Protected Route Alert Surface Inventory - 2026-06-06

> Status: Input document. This record inventories current repo and read-only provider evidence for
> auth/session, RLS or tenant-boundary, and protected-route alert surfaces after `ENT-ALERT06`. It
> does not create Sentry rules, change alert destinations, generate production traffic, edit runtime
> code, or claim full enterprise readiness.

## Identity

- Exercise id: `ENT-ALERT07-2026-06-06`
- Environment inspected: `production`
- Sentry org/project observed from local dotenv: `human-p5` / `interdmestik-nextjs`
- Executor: Codex local repo operator
- Decision owner: platform
- Production traffic affected: no

## Method

The inventory used repo search plus read-only Sentry API and repo-owned drift checks. No alert
rule, threshold, owner, destination, issue, telemetry tag, runtime route, tenant data, or production
traffic was changed.

Commands:

```bash
node scripts/run-with-dotenv.mjs pnpm sentry:alerts:check --json
node scripts/run-with-dotenv.mjs python3 <sentry_api.py> list-issues --time-range 14d --query "is:unresolved auth"
node scripts/run-with-dotenv.mjs python3 <sentry_api.py> list-issues --time-range 14d --query "is:unresolved tenant"
node scripts/run-with-dotenv.mjs python3 <sentry_api.py> list-issues --time-range 14d --query "is:unresolved rls"
node scripts/run-with-dotenv.mjs python3 <sentry_api.py> list-issues --time-range 14d --query "is:unresolved /member"
node scripts/run-with-dotenv.mjs python3 <sentry_api.py> list-issues --time-range 14d --query "is:unresolved /agent"
node scripts/run-with-dotenv.mjs python3 <sentry_api.py> list-issues --time-range 14d --query "is:unresolved /staff"
node scripts/run-with-dotenv.mjs python3 <sentry_api.py> list-issues --time-range 14d --query "is:unresolved /admin"
node scripts/run-with-dotenv.mjs node --input-type=module '<redacted read-only Sentry alert-rules inventory>'
```

The Sentry issues endpoint rejected `30d` with `Invalid stats_period`; the maximum accepted window
through this API route was `14d`. It also rejected a combined protected-route `OR` query, so the
canonical route searches were run one route at a time. No event detail, stack trace, raw request,
mailbox body, private destination id, secret, or raw PII was written to this record.

## Provider Rule Inventory

Read-only Sentry alert-rule inventory for project `interdmestik-nextjs` returned exactly three
metric rules, all D07:

| Rule id | Rule name                                        | Query                              | Trigger actions           |
| ------- | ------------------------------------------------ | ---------------------------------- | ------------------------- |
| `18664` | `[D07] SLO1 Paddle webhook processing burn rate` | `slo_alert:d07.webhook.processing` | critical `1`; warning `1` |
| `18665` | `[D07] SLO2 Document download burn rate`         | `slo_alert:d07.document.download`  | critical `1`; warning `1` |
| `18666` | `[D07] SLO3 Core API latency p95 (/api/claims)`  | `slo_alert:d07.api.claims.latency` | critical `1`; warning `1` |

The repo-owned D07 drift check reported:

- missing: `[]`
- changed: `[]`
- unchanged: all three D07 rules above

No dedicated Sentry alert rule was found for auth/session, RLS or tenant-boundary, `/member`,
`/agent`, `/staff`, or `/admin` failure modes.

## Provider Issue Surface Inventory

Read-only unresolved issue searches over the supported `14d` window found observable issue signals,
but observable issues are not the same as routed alert rules:

| Category     | Query evidence                                 | Inventory result                                                                                  |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Auth/session | `is:unresolved auth`                           | Three unresolved `POST /api/auth/[...all]` issues were returned.                                  |
| Tenant/RLS   | `is:unresolved tenant` and `is:unresolved rls` | The same auth-route tenant lookup/RLS URL issues plus one RLS role assertion issue were returned. |
| `/member`    | `is:unresolved /member`                        | Two unresolved member-surface issues were returned, including one RLS role assertion issue.       |
| `/agent`     | `is:unresolved /agent`                         | No unresolved issues returned.                                                                    |
| `/staff`     | `is:unresolved /staff`                         | No unresolved issues returned.                                                                    |
| `/admin`     | `is:unresolved /admin`                         | No unresolved issues returned.                                                                    |

The relevant provider issue references are sanitized to short ids only:

- `INTERDMESTIK-NEXTJS-A`: `DATABASE_URL_RLS` identical to `DATABASE_URL`, culprit
  `POST /api/auth/[...all]`
- `INTERDMESTIK-NEXTJS-B`: same RLS URL posture failure, culprit `POST /api/auth/[...all]`
- `INTERDMESTIK-NEXTJS-D`: auth tenant lookup query failure, culprit `POST /api/auth/[...all]`
- `INTERDMESTIK-NEXTJS-E`: `RlsConnectionRoleAssertionError`, culprit member page server component
- `INTERDMESTIK-NEXTJS-C`: member claim-detail server component render error

## Repo Release-Gate And Telemetry Inventory

Repo evidence provides release-time proof signals, but it does not currently prove routed
production alert coverage for the `ENT-ALERT06` categories:

- `scripts/sentry-alerts-lib.mjs` defines only the three D07 `slo_alert:*` alert queries.
- `apps/web/src/app/api/webhooks/paddle/[entity]/route.ts`,
  `apps/web/src/app/api/documents/[id]/download/route.ts`, and
  `apps/web/src/app/api/claims/route.ts` set the checked-in D07 `slo_alert` tags.
- `apps/web/src/instrumentation.ts`, `apps/web/src/instrumentation-client.ts`,
  `apps/web/src/sentry.server.config.ts`, and `apps/web/src/sentry.edge.config.ts` configure
  Sentry request/error capture when enabled.
- `docs/SLOS.md` names `/api/auth/*` in the core API latency surface, but no checked-in alert
  catalog entry covers `/api/auth/*`.
- `pnpm db:rls:test:required` runs the required RLS integration suite, including critical-table
  RLS coverage.
- `packages/database/test/critical-rls-tables.test.ts` checks RLS is enabled on `claim`,
  `claim_messages`, `crm_task_history`, `crm_tasks`, `documents`, and `user`.
- `packages/database/test/rls-role-assertion.test.ts` proves fail-closed RLS role posture handling.
- `scripts/release-gate/config.ts` defines canonical RBAC target markers for `member`, `agent`,
  `staff`, and `admin`; `scripts/release-gate/run.ts` executes P0 role and cross-tenant gates.

## Gap Matrix

| Required category      | Observable today                        | Dedicated provider alert today | Release proof today                          | Result      |
| ---------------------- | --------------------------------------- | ------------------------------ | -------------------------------------------- | ----------- |
| Auth/session           | Yes, unresolved auth-route issues exist | No                             | Auth route tests and release-gate login flow | Gap remains |
| RLS or tenant-boundary | Yes, RLS role posture issues exist      | No                             | Required RLS tests and role assertion tests  | Gap remains |
| Protected route member | Yes, unresolved member issues exist     | No                             | P0 canonical route marker checks             | Gap remains |
| Protected route agent  | No unresolved issue found in 14d query  | No                             | P0 canonical route marker checks             | Gap remains |
| Protected route staff  | No unresolved issue found in 14d query  | No                             | P0 canonical route marker checks             | Gap remains |
| Protected route admin  | No unresolved issue found in 14d query  | No                             | P0 canonical route marker checks             | Gap remains |

## Result

- Decision: inventory complete
- Alert coverage proven by this slice: no
- Sentry or production telemetry mutated: no
- Runtime/auth/tenancy/routing/schema/RLS/UI/proxy changed: no
- Blocking finding: the provider has issue visibility for some auth/RLS/member failures, but no
  dedicated alert rule inventory proves warning or critical routed coverage for auth/session, RLS or
  tenant-boundary, or canonical protected-route failures.
- Non-blocking finding: the existing release gates remain useful correlation evidence, but they
  cannot substitute for provider alert rules and acknowledged routed notifications.

## Recommended Next Proof

The next repo-owned enterprise-hardening slice should be:

`ENT-ALERT08 Auth RLS Protected Route Alert Rule Design`

That slice should define the smallest provider-rule and telemetry-tagging plan needed to cover the
three `ENT-ALERT06` categories from the current inventory. It should decide whether existing issue
fingerprints are enough for the first alert rules or whether bounded runtime tagging is required
before configuration. It should not create or mutate Sentry rules, send test notifications, generate
production traffic, probe tenant data, or edit auth, tenancy, routing, schema, RLS, product UI,
proxy, README, AGENTS, or broad architecture docs.
