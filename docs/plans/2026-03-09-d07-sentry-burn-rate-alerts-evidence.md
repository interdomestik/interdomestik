# D07 Sentry Burn-Rate Alerts Evidence

## Scope

D07 covers the three committed Sentry alert surfaces from `docs/SLOS.md`:

1. SLO1 Paddle webhook processing burn rate
2. SLO2 Document download burn rate
3. SLO3 Core API latency p95 for `/api/claims`

## Repo-Owned Operating Surface

The checked-in D07 surface now lives in:

- `scripts/sentry-alerts-lib.mjs`
- `scripts/sentry-alerts.mjs`
- `scripts/sentry-alerts.test.mjs`
- `apps/web/src/app/api/webhooks/paddle/[entity]/route.ts`
- `apps/web/src/app/api/documents/[id]/download/route.ts`
- `apps/web/src/app/api/claims/route.ts`

The root package exposes:

- `pnpm sentry:alerts:check`
- `pnpm sentry:alerts:apply`

## Stable Sentry Query Tags

The route handlers now emit stable `slo_alert` tags for the D07 rules:

- `d07.webhook.processing`
- `d07.document.download`
- `d07.api.claims.latency`

These tags give the alert rules a repo-owned query surface instead of relying on mutable UI search strings.

## Initial Remote Inspection Result

Command run on 2026-03-09:

```bash
node scripts/run-with-dotenv.mjs pnpm sentry:alerts:check --json
```

Observed result:

- project: `interdmestik-nextjs`
- environment: `production`
- remote D07 rules present: `0`
- missing rules:
  - `[D07] SLO1 Paddle webhook processing burn rate`
  - `[D07] SLO2 Document download burn rate`
  - `[D07] SLO3 Core API latency p95 (/api/claims)`

## Live Rule Provisioning

Live rule creation and updates were completed on 2026-03-09 through the authenticated Sentry browser session because the local API token did not expose `alerts:write`.

Provisioned rules:

- `18664` `[D07] SLO1 Paddle webhook processing burn rate`
  - dataset: `events_analytics_platform`
  - aggregate: `failure_rate()`
  - query: `slo_alert:d07.webhook.processing`
  - environment: `production`
- `18665` `[D07] SLO2 Document download burn rate`
  - dataset: `events_analytics_platform`
  - aggregate: `failure_rate()`
  - query: `slo_alert:d07.document.download`
  - environment: `production`
- `18666` `[D07] SLO3 Core API latency p95 (/api/claims)`
  - dataset: `events_analytics_platform`
  - aggregate: `p95(transaction.duration)`
  - query: `slo_alert:d07.api.claims.latency`
  - environment: `production`

## Final Remote Inspection Result

Command run on 2026-03-09:

```bash
node scripts/run-with-dotenv.mjs pnpm sentry:alerts:check --json
```

Observed result:

- project: `interdmestik-nextjs`
- environment: `production`
- missing rules: `0`
- changed rules: `0`
- unchanged rules:
  - `[D07] SLO1 Paddle webhook processing burn rate` (`18664`)
  - `[D07] SLO2 Document download burn rate` (`18665`)
  - `[D07] SLO3 Core API latency p95 (/api/claims)` (`18666`)

## Write-Scoped Apply Notes

Remote apply is implemented, but the local token still cannot mutate rules directly from the repo without a write-scoped replacement.

The local dotenv surface provides:

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_TRACES_SAMPLE_RATE`

The local dotenv surface does not yet provide:

- `SENTRY_ALERT_ACTIONS_JSON`
- `SENTRY_ALERT_ACTIONS_WARNING_JSON`
- `SENTRY_ALERT_ACTIONS_CRITICAL_JSON`

The Sentry auth token currently exposes:

- `alerts:read`
- `event:read`
- `org:read`
- `project:read`
- `project:releases`

The token does not expose:

- `alerts:write`

That means future repo-driven apply is blocked by token scope even if action JSON is provided.

Observed apply attempt on 2026-03-09:

```bash
SENTRY_ALERT_ACTIONS_JSON='[{"type":"email","targetType":"specific","targetIdentifier":"admin@interdomestik.dev"}]' \
node scripts/run-with-dotenv.mjs pnpm sentry:alerts:apply --json
```

Result:

- failed before rule creation
- explicit blocker: `Sentry auth token is missing required scopes: alerts:write`

## Verification

Implemented and verified locally:

- `node --test scripts/sentry-alerts.test.mjs`
- `node --test scripts/package-e2e-scripts.test.mjs`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/webhooks/paddle/[entity]/route.test.ts'`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/api/documents/[id]/download/route.test.ts'`
- `pnpm --filter @interdomestik/web test:unit --run src/app/api/claims/route.test.ts`
- `node scripts/run-with-dotenv.mjs pnpm sentry:alerts:check --json`

Operationally completed:

- the three committed D07 rules are present in Sentry
- the repo-owned drift check reports `missing = 0` and `changed = 0`
- D07 is complete; `D08` is the remaining committed `P-1` item
