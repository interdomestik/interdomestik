---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-07
superseded_by:
---

# ENT-DB02 Supabase Duplicate Index Cleanup - 2026-06-07

> Status: Implementation and live-apply evidence record. This records a narrow repo-owned response
> to live Supabase Performance Advisor duplicate-index findings. It does not rewrite RLS policies,
> run load tests, change runtime code, or claim full enterprise readiness.

## Identity

- Slice id: `ENT-DB02`
- Environment inspected: linked Supabase project `Interdomestik`
- Advisor source: `supabase db advisors --linked --type performance -o json`
- Production data affected from this thread: no row data changed; PR `#990` and live apply on
  2026-06-07 updated index metadata only by dropping redundant secondary indexes
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

## Live Apply Evidence

PR `#990` landed as squash merge commit `883fb31f83d4a93b9a01be695cde942036ede8d6`.
After merge, `supabase db push --linked --yes` was run from the repository root and reported the
linked Supabase CLI migration table was already up to date; it did not apply Drizzle-owned migration
`0074` because that file lives under `packages/database/drizzle` rather than `supabase/migrations`.
The live apply therefore used the same five `DROP INDEX IF EXISTS` statements from
`packages/database/drizzle/0074_drop_duplicate_legacy_indexes.sql` in one transaction through
`supabase db query --linked` on 2026-06-07.

Post-apply `pg_indexes` inspection showed only the canonical retained indexes for the affected
columns:

- `idx_branches_tenant`
- `idx_claims_agent`
- `idx_claims_branch`
- `idx_memberships_agent`
- `idx_memberships_branch`

The legacy duplicate index names were absent. Live Supabase Performance Advisor output no longer
reported `duplicate_index`; the remaining performance warnings were `auth_rls_initplan`. Live
Supabase Security Advisor still reported `No issues found`.

## Residual Risk

This closes the five duplicate-index warnings for both the repo-owned migration and the linked
database live apply. The direct live drop does not replace normal Drizzle migration accounting in
protected deployment runs; `DROP INDEX IF EXISTS` keeps `0074` idempotent if a migration runner later
applies it. The broader `auth_rls_initplan`, restore drill, data lifecycle, deploy proof, incident
drill, and routed alert acknowledgement blockers remain separate enterprise-readiness work.
