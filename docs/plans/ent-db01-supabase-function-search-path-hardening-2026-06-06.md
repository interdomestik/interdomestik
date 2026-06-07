---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-07
superseded_by:
---

# ENT-DB01 Supabase Function Search Path Hardening - 2026-06-06

> Status: Implementation and live-apply evidence record. This records a narrow repo-owned response
> to live Supabase Security Advisor findings plus the later live metadata apply. It does not run a
> restore drill, mutate fixture data, or claim full enterprise readiness.

## Identity

- Slice id: `ENT-DB01`
- Environment inspected: Supabase MCP project `Interdomestik` (`gunosplgrvnvrftudttr`)
- Advisor source: `mcp__codex_apps__supabase._get_advisors` with `type: security`
- Production data affected from this thread: no row data changed; function metadata was updated on
  2026-06-07 to pin `search_path`
- Runtime, auth, tenancy, routing, billing, product UI, proxy, README, and AGENTS changed: no

## Finding

Supabase Security Advisor reported two `function_search_path_mutable` warnings:

- `public.member_referral_reward_type_fixed`
- `public.member_referral_reward_type_percent`

Both functions are SQL enum helper functions created by
`packages/database/drizzle/0047_member_referral_rewards.sql` and used by member-referral defaults
and checks.

Read-only Supabase table preflight used
`mcp__codex_apps__supabase._list_tables` for the `public` schema. It confirmed the relevant
`member_referral_rewards` and `member_referral_settings` tables exist with RLS enabled. No row
contents, PII, claim narratives, document contents, or secrets were inspected.

## Implemented Fix

`packages/database/drizzle/0073_harden_member_referral_reward_type_functions.sql` pins each
function's search path:

- `public.member_referral_reward_type_fixed()` -> `public, pg_temp`
- `public.member_referral_reward_type_percent()` -> `public, pg_temp`

The migration does not create or drop tables, types, policies, functions, RLS policy surfaces, or
runtime code. It only applies the function-level search-path hardening required by the advisor.

## Verification Plan

- `pnpm --filter @interdomestik/database exec node --test test/member-referral-function-hardening.test.ts`
- `pnpm db:migrations:check-journal`
- `git diff --check`
- Phase C final gates before merge as required for Tier 3 database work.

## Verification Completed

- Sonnet architecture/scope review: `NO MUST-FIX FINDINGS`.
- `pnpm pr:verify` completed successfully, including PR E2E gate
  (`134 passed`, `6 skipped`) and smoke (`13 passed`, `1 skipped`).

## Live Apply Evidence

On 2026-06-07, after the repo-owned migration was present on `main`, the same two ALTER statements
from `packages/database/drizzle/0073_harden_member_referral_reward_type_functions.sql` were applied
to the linked Supabase project with `supabase db query --linked`.

Post-apply verification:

- `public.member_referral_reward_type_fixed()` proconfig:
  `search_path=public, pg_temp`
- `public.member_referral_reward_type_percent()` proconfig:
  `search_path=public, pg_temp`
- `supabase db advisors --linked --type security -o json`: `No issues found`

## Residual Risk

This closes the repo-owned migration and live advisor proof for the two security-advisor findings.
The direct live ALTER does not replace the need for normal Drizzle migration accounting in future
protected deployment runs; the ALTER statements are idempotent if the migration runner later applies
`0073`. Branch listing, performance advisors, restore/lifecycle proof, deploy digest proof, incident
drill proof, and alert acknowledgement proof remain separate enterprise blockers.
