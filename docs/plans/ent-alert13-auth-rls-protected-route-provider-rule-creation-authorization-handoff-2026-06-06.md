---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT13 Auth RLS Protected Route Provider Rule Creation Authorization Handoff - 2026-06-06

> Status: Input document. This record captures the authorization and apply-boundary prerequisites
> for creating the missing `[ENT]` Sentry provider rules after `ENT-ALERT12`. It does not create,
> update, delete, route, mute, or acknowledge provider rules.

## Identity

- Slice id: `ENT-ALERT13-2026-06-06`
- Source drift evidence: `ENT-ALERT12 Auth RLS Protected Route Provider Drift Check Evidence`
- Environment considered: production
- Provider considered: Sentry project `interdmestik-nextjs`
- Executor: Codex local repo operator
- Decision owner: platform
- Production traffic generated: no

Slug note: `interdmestik-nextjs` is the live `SENTRY_PROJECT` value used by `ENT-ALERT09` through
`ENT-ALERT12`. This record preserves that provider slug instead of normalizing it.

## Current Evidence

Read-only catalog command:

```bash
node scripts/sentry-enterprise-alerts.mjs catalog --json
```

Read-only provider drift command:

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

The non-zero exit code remains expected because no `[ENT]` provider rules exist yet.

## Authorization State

| Requirement                                          | Evidence in this slice                     | Disposition          |
| ---------------------------------------------------- | ------------------------------------------ | -------------------- |
| Read-only Sentry token and org/project configuration | present                                    | sufficient for drift |
| Enterprise provider apply command in repo            | absent; script supports catalog/check only | mutation blocked     |
| Write-scoped enterprise mutation token               | not proven                                 | mutation blocked     |
| Approved enterprise alert owner                      | `SENTRY_ENTERPRISE_ALERT_OWNER` missing    | mutation blocked     |
| Approved warning/critical destination action JSON    | alert action env vars missing              | routing blocked      |
| Provider-returned immutable rule ids                 | none returned                              | no ids to record     |
| `auth_session` runtime telemetry tag                 | implemented by `ENT-ALERT10`               | rule can be prepared |
| `protected_route` runtime telemetry tag              | implemented by `ENT-ALERT10`               | rule can be prepared |
| `tenant_boundary` runtime telemetry tag              | pending runtime slice                      | coverage unclaimed   |

This slice therefore does not have enough authorization or routing evidence to mutate provider
state. Creating provider rules without destination actions or owner confirmation would also fail the
alert-routing proof requirement because it would not prove routed notification behavior.

## Apply-Boundary Prerequisites

Before any future repo or operator thread creates the missing `[ENT]` provider rules, it must record
all of the following:

- Named platform approval for production Sentry alert mutation.
- A write-scoped Sentry token proof that verifies `alerts:read` and `alerts:write` without printing
  the token.
- The exact Sentry org, project, and environment to mutate.
- A redacted owner value or explicit owner-omission approval.
- Redacted warning and critical destination action shapes for both labels.
- A dry-run payload diff showing create/update/no-op decisions before apply.
- A post-apply read-only drift check that records provider-returned rule ids.
- A routed notification or provider-supported acknowledgement exercise for at least one applied
  rule before claiming alert-routing proof.

The future apply path must keep provider queries limited to the low-cardinality `ENT-ALERT09`
contract. It must not include tenant ids, user ids, branch ids, claim ids, document ids, emails,
cookies, tokens, URLs, raw paths, hostnames, request bodies, private route parameters, or private
destination identifiers in docs or provider queries.

## Decision

Provider rule creation is blocked, not failed:

- The checked-in enterprise alert catalog is valid.
- The read-only drift check proves the three `[ENT]` rules are missing.
- The current repo script intentionally has no enterprise apply command.
- The local environment lacks enterprise owner and action-destination evidence.
- The tenant-boundary runtime tag is still pending, so that coverage remains unclaimed even after a
  future provider-rule apply.

No provider mutation, destination change, notification exercise, synthetic event, or production
traffic generation was attempted.

## Required Follow-Up

The next repo-owned enterprise alert slice should be:

`ENT-ALERT14 Tenant Boundary Runtime Tagging Design Gate`

That slice should define the smallest safe runtime-tagging design for deterministic tenant-boundary
or RLS failure paths before implementation. It should identify exact failure surfaces, forbidden
private identifiers, tests, gate impact, and rollback boundaries. It should not change runtime code
until the design is reviewed and accepted under the Phase C architecture/auth/tenancy constraints.

## Non-Goals

- No Sentry provider rule creation, update, deletion, destination mutation, routed notification
  acknowledgement, or provider apply command.
- No production traffic generation, synthetic provider event, tenant-data probing, or live fixture
  exercise.
- No runtime auth/session, tenancy, routing, schema, RLS, billing, product UI, proxy, README,
  AGENTS, or broad architecture-doc change.
- No claim that Interdomestik is fully enterprise-ready.
