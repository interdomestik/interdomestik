# P38-DG20 Routing Admin UX Design Review

Status: complete
Slice: `P38-DG20`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-16
Authority: completed design gate. This document promotes exactly one implementation slice.
Promoted implementation slice: `P38-CRM09 Routing Admin UX And Rule Management`

## Decision

`P38-CRM08 Routing Persistence And Cursor Adapter` is complete through PR `#785`, merge commit
`3475283a26cde1d80f88b463b77adb619e00ae55`, with durable routing rules, cursors, assignment audit,
tenant RLS, composite tenant references, compare-and-swap cursor updates, idempotent audit inserts,
and CRM07 SQL adapters. Notion sync is recorded at
`https://www.notion.so/362036cff1f8811c92cdfe3aa10eff18`.

DG20 promotes `P38-CRM09 Routing Admin UX And Rule Management` because CRM08 made routing rules
durable but left operators with no bounded admin surface to inspect or edit those rules. CRM09 is
limited to the existing `/admin/crm` route and must not apply rules to leads automatically.

Deferred candidates:

| Candidate                              | Decision                                               |
| -------------------------------------- | ------------------------------------------------------ |
| Controlled routing application service | Defer until rule management is proven.                 |
| `P38-CRM25 Routing Audit Retention`    | Defer; audit growth matters after rule control exists. |
| `P38-CRM10` / `P38-CRM11`              | Defer; independent deal cleanup/nullability work.      |

## Promoted Scope

CRM09 may add an admin-only routing rules panel to the existing `/admin/crm` page. It must preserve
the existing reporting, charting, observability, alerting, backfill, and branch-manager reporting
surfaces and keep the root `admin-crm-page-ready` marker.

Allowed implementation work:

- Add `getAdminCrmRoutingRulesCore({ actor })` as an admin-only sibling to the existing reporting
  and branch-manager cores.
- Reuse CRM08 persistence and `apps/web/src/lib/domain-crm/routing-repository.ts`; add only thin
  write-path methods or an additive repository-port extension.
- Add server actions for create, update, enable/disable, archive, and reorder. Reorder is
  server-side dense priority normalization, not drag-and-drop in the first slice.
- Validate with strict typed schemas before writes and return typed reason codes.
- Localize `admin-crm.routing.*` copy for `sq`, `en`, `sr`, and `mk`.
- Render routing markers from `ADMIN_CRM_ROUTING_MARKER_PREFIX = 'admin-crm-routing-'`.
- Add focused route-core, action, component, PII, i18n, DB-access, and targeted E2E proof.

Forbidden implementation work:

- No `apps/web/src/proxy.ts`, canonical route, auth/session, tenancy, or route-authority changes.
- No new route, sidebar item, sidebar IA, automatic routing, lead ownership transfer, cursor UI,
  routing audit viewer, or audit-retention job.
- No breaking change to the existing CRM07 routing repository methods.
- No schema/RLS migration except at most one narrow additive `(tenant_id, ...)` admin-list index.
- No Stripe, README, AGENTS.md, or broad architecture docs.

## Authorization And Data Contract

CRM09 follows the DG13/CRM20 `/admin/crm` split. Admin-like actors may read and mutate routing
rules. Branch-manager actors must stay on the existing branch-manager reporting path and must not
receive routing controls, markers, action payloads, or write access. Server actions must re-derive
the session actor before parsing the request body; unauthenticated, tenantless, roleless,
branch-manager, staff, agent, and member callers fail closed with `forbidden` before repository
access.

The UI may manage only CRM07/CRM08-supported rule fields: optional `branchId`; optional
`source`/`leadType`/UTM filters; optional UTC effective window; `round_robin`, `least_loaded`, or
`manual_only`; `enabled`; non-negative `priority`; `agentIds`; optional capacity caps; optional
fallback agent/rule; and archive state through the archive action. Tenant ID and row IDs are
server-derived.

Validation must reject invalid strategies, negative priority/caps, inverted windows, non-manual
empty agent pools, duplicate agent IDs, cross-tenant agents, branch-incompatible agents or
fallbacks, self-referential fallback rules, archived fallback rules, overlong strings, unknown
fields, not-found rows, repository failures, and duplicate reorder IDs. Expected failures return a
typed action result instead of throwing across the action boundary.

Route-core output is aggregate-only and PII-safe: rule ID, enabled/archived state, tenant-or-branch
scope, filters, effective window, strategy, priority, agent-pool count, capacity caps, fallback IDs,
and `updatedAt`. It must not include lead/contact/member names, staff or agent names, email, phone,
notes, descriptions, subjects, activity text, claim text, deal names, or free-text PII.

## UX And Test Bar

The first slice must cover loading/pending, empty, validation-error, generic-error, disabled,
success, archived, duplicate-submit, and reorder states. Controls must be keyboard reachable with
visible focus and mobile-safe layout. Prefer explicit move-up/move-down or numeric priority controls.

Required proof:

- Admin can inspect, create, update, enable/disable, archive, and reorder rules on `/admin/crm`.
- Branch-manager keeps the existing reporting surface and sees no routing markers or controls.
- Unauthorized, tenantless, cross-tenant, and cross-branch attempts fail closed.
- PII-shape tests cover route-core output, rendered labels, and action messages.
- i18n tests cover every `admin-crm.routing.*` key across all four locales.
- `pnpm check:db-access` either has no new entries or records justified adapter-boundary entries.
- Targeted E2E `@admin-crm-routing-rules` covers admin mutation flow and branch-manager exclusion.

## Resolved Review Questions

- Include reorder in CRM09 because priority is the main incident-response lever.
- Keep validation colocated with the route core unless logic is clearly domain-pure and reusable.
- Prefer an additive `CrmRoutingRepository` write extension if the port remains the single boundary.
- Use opaque agent IDs in CRM09; reserve a friendly labeled picker for a later UX slice.
- Keep branch-scoped rule editing admin-only in CRM09; revisit branch-manager editing later.

## Verification Plan

Design-gate PR proof:

```bash
git diff --check
pnpm plan:status
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
pnpm ci:local:quick
```

Implementation PR proof after CRM09 starts must include focused domain/web route/action/component
tests, i18n checks, DB-access guard, RLS/migration checks if an index is added, static slice
verification, `pnpm ci:local:pr`, targeted `@admin-crm-routing-rules` E2E, `pnpm pr:verify`,
`pnpm security:guard`, `pnpm e2e:gate`, and Playwright MCP or least-risk browser validation for
admin behavior, branch-manager exclusion, mobile layout, keyboard/focus, duplicate-submit
prevention, and representative validation failures.
