---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT12 Auth RLS Protected Route Provider Drift Check Evidence - 2026-06-06

> Status: Input document. This record captures the first read-only provider drift check after
> `ENT-ALERT11`. It does not create, update, delete, or route Sentry provider rules; mutate alert
> destinations; generate traffic; or claim enterprise alert coverage.

## Identity

- Slice id: `ENT-ALERT12-2026-06-06`
- Source catalog contract: `ENT-ALERT11 Auth RLS Protected Route Provider Alert Catalog Contract`
- Environment checked: production
- Provider checked: Sentry project `interdmestik-nextjs`
- Executor: Codex local repo operator
- Decision owner: platform
- Production traffic generated: no

Slug note: the checked `SENTRY_PROJECT` value is `interdmestik-nextjs`, matching the live slug
recorded by `ENT-ALERT09` through `ENT-ALERT11`. This record intentionally uses the provider slug
returned by the read-only check rather than normalizing it to the product name.

## Read-Only Provider Check

Command:

```bash
node scripts/sentry-enterprise-alerts.mjs check --json
```

Result:

- mode: `remote-check`
- exit code: `1`
- project: `interdmestik-nextjs`
- environment: `production`
- missing:
  - `[ENT] Auth/session failure coverage`
  - `[ENT] Protected route failure coverage`
  - `[ENT] Tenant boundary or RLS failure coverage`
- changed: `[]`
- unchanged: `[]`
- remote enterprise rules: `[]`

The non-zero exit code is expected for this evidence attempt because the read-only drift check found
missing enterprise provider rules. It is not a local script failure.

## Coverage Disposition

| Catalog rule                                    | Runtime status      | Provider drift result | Coverage claim |
| ----------------------------------------------- | ------------------- | --------------------- | -------------- |
| `[ENT] Auth/session failure coverage`           | implemented         | missing               | not proven     |
| `[ENT] Protected route failure coverage`        | implemented         | missing               | not proven     |
| `[ENT] Tenant boundary or RLS failure coverage` | pending runtime tag | missing               | not proven     |

No provider rule ids were returned, so this record intentionally does not invent immutable provider
references. The tenant-boundary category remains unclaimed because runtime tagging is still pending
and provider rule existence is also missing.

## Safety Properties

- The command used the checked-in read-only `check` mode only.
- No Sentry provider rule was created, updated, deleted, routed, acknowledged, or muted.
- No alert destination was changed.
- No synthetic event or production traffic was generated.
- No tenant id, user id, branch id, claim id, document id, email, cookie, token, URL, raw path,
  request body, private route parameter, or private destination id was recorded.
- `apps/web/src/proxy.ts`, canonical routes, auth/session behavior, tenancy resolution, schema, RLS,
  billing, product UI, README, AGENTS, and broad architecture docs were unchanged.

## Required Follow-Up

The next repo-owned enterprise alert slice should be:

`ENT-ALERT13 Auth RLS Protected Route Provider Rule Creation Authorization Handoff`

That slice should record the exact authorization, owner, routing, and apply-boundary prerequisites
needed before creating the missing `[ENT]` provider rules. It should not mutate provider state unless
the required authorization and destination evidence are present. If provider mutation remains
unauthorized, it should produce a blocker record instead of simulating rule creation.

## Non-Goals

- No Sentry provider rule creation, update, deletion, destination mutation, or routed notification
  acknowledgement.
- No production traffic generation, synthetic provider event, tenant-data probing, or live fixture
  exercise.
- No runtime auth/session, tenancy, routing, schema, RLS, billing, product UI, proxy, README,
  AGENTS, or broad architecture-doc change.
- No claim that Interdomestik is fully enterprise-ready.
