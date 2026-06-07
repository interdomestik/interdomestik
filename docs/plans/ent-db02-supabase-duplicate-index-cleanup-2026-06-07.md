---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-07
superseded_by:
---

# ENT-DB02 Supabase Duplicate Index Cleanup - 2026-06-07

> Status: Implementation evidence record. This records a narrow repo-owned response to live
> Supabase Performance Advisor duplicate-index findings. It does not rewrite RLS policies, run load
> tests, change runtime code, or claim full enterprise readiness.

## Identity

- Slice id: `ENT-DB02`
- Environment inspected: linked Supabase project `Interdomestik`
- Advisor source: `supabase db advisors --linked --type performance -o json`
- Production data affected from this thread: no row data changed; the migration drops redundant
  secondary indexes only
- Runtime, auth, tenancy, routing, billing, product UI, proxy, README, and AGENTS changed: no

## Finding

Supabase Performance Advisor reported five `duplicate_index` warnings:

- `public.branches`: `idx_branches_tenant`, `idx_branches_tenant_id`
- `public.claim`: `idx_claim_agent_id`, `idx_claims_agent`
- `public.claim`: `idx_claim_branch_id`, `idx_claims_branch`
- `public.subscriptions`: `idx_memberships_agent`, `idx_subscriptions_agent_id`
- `public.subscriptions`: `idx_memberships_branch`, `idx_subscriptions_branch_id`

Read-only Postgres inspection confirmed each pair has the same BTREE definition over the same
single column. The canonical retained names are the names still declared by the current Drizzle
schema:

- `idx_branches_tenant`
- `idx_claims_agent`
- `idx_claims_branch`
- `idx_memberships_agent`
- `idx_memberships_branch`

## Implemented Fix

`packages/database/drizzle/0074_drop_duplicate_legacy_indexes.sql` drops only the legacy duplicate
index names:

- `idx_branches_tenant_id`
- `idx_claim_agent_id`
- `idx_claim_branch_id`
- `idx_subscriptions_agent_id`
- `idx_subscriptions_branch_id`

The migration does not drop constraints, unique indexes, tables, columns, policies, functions, or
runtime code.

## Verification Plan

- `pnpm db:migrations:check-journal`
- `git diff --check`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `pnpm security:guard`
- live post-apply advisor proof after merge/apply:
  `supabase db advisors --linked --type performance -o json`

## Residual Risk

This closes only the five duplicate-index warnings once the migration is applied to the linked
database. The broader `auth_rls_initplan` warnings remain a separate database-performance blocker
because they require policy rewrites across many tenant-isolated tables.
