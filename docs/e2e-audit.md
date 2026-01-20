# E2E Drift Audit (Branches V2)

## Observed Failure Patterns

- Actions menu interaction fails intermittently (delete/edit menu not visible).
- Screen anchors were missing or too low-level, leading to ambiguous failures.
- Layout is cards in V2; tests were previously table-bound.

## Root Causes (Current Scope)

- Dropdown menu content is rendered in a portal, so global selectors can target hidden menu items.
- Screen-level anchors were not treated as server-rendered invariants.
- Cleanup relied on UI interaction without a portal-aware selector strategy.

## System Invariants

1. Route invariant: tests must verify `/[locale]/admin/branches` before screen actions.
2. Anchor invariant: each screen must expose a stable root test ID.
3. UI contract invariant: tests interact through adapters, not layout-specific selectors.
4. Menu invariant: portal menus must be queried through the open state container.

## Actions + DoD

- Screen adapter: add layout detection + menu scoping.
  - DoD: branching spec uses adapter and reports layout in logs.
- UI anchors: add `branches-screen`, `branch-item`, menu action IDs.
  - DoD: screen loads deterministically on both tenants.
- Portal menu scoping: use open-state container to target menu items.
  - DoD: cleanup/edit/delete operations pass in both tenants.
