---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-07
superseded_by:
---

# ENT-DB03 Auth RLS InitPlan Remediation Design - 2026-06-07

> Status: Design gate. This scopes a future database-performance implementation for live Supabase
> Performance Advisor `auth_rls_initplan` warnings. It does not change policies, migrations, runtime
> code, auth, tenancy, routes, billing, product UI, proxy, README, AGENTS, or architecture docs.

## Goal

Remove the remaining live Supabase Performance Advisor `auth_rls_initplan` warnings for the
repo-owned public tenant-isolation policies without weakening tenant isolation or changing the
tenant-context contract.

## Evidence

- Advisor command: `supabase db advisors --linked --type performance -o json`
- Live advisor result on 2026-06-07: 53 warnings, all named `auth_rls_initplan`
- Duplicate-index warnings after ENT-DB02: absent
- Live policy inventory query: 53 `public.tenant_isolation_*` policies using
  `current_setting('app.current_tenant_id', true)`
- Policy shape split:
  - 15 policies have `USING` only and no `WITH CHECK`
  - 38 policies have both `USING` and `WITH CHECK`
- Repo sources:
  - `packages/database/drizzle/0031_enable_claim_rls.sql`
  - `packages/database/drizzle/0035_enable_tenant_rls_coverage.sql`
  - later table-specific RLS migrations that copy the same `current_setting(...)` pattern
- Supabase guidance: wrap row-independent RLS helper calls in scalar `select` expressions so the
  planner can evaluate them as an initPlan instead of per row.

## Affected Policy Families

The future implementation should target only live policies with this exact tenant-isolation shape:

```sql
tenant_id = current_setting('app.current_tenant_id', true)::text
```

The affected live table set is:

`agent_clients`, `agent_commissions`, `agent_settings`, `ai_runs`, `audit_log`, `automation_logs`,
`billing_invoices`, `billing_ledger_entries`, `branches`, `claim`, `claim_counters`,
`claim_documents`, `claim_escalation_agreements`, `claim_messages`, `claim_stage_history`,
`claim_threads`, `claim_tracking_tokens`, `commercial_action_idempotency`, `crm_activities`,
`crm_deals`, `crm_leads`, `document_access_log`, `document_extractions`, `documents`,
`email_campaign_logs`, `engagement_email_sends`, `lead_downloads`, `lead_payment_attempts`,
`leads`, `member_activities`, `member_leads`, `member_notes`, `member_referral_rewards`,
`member_referral_settings`, `membership_cards`, `membership_family_members`, `membership_plans`,
`notifications`, `nps_survey_responses`, `nps_survey_tokens`, `partner_discount_usage`,
`policies`, `push_subscriptions`, `referrals`, `service_requests`, `service_usage`,
`share_packs`, `subscriptions`, `tenant_settings`, `user`, `user_notification_preferences`,
`user_roles`, and `webhook_events`.

## Required Implementation Shape

The next implementation slice should be `ENT-DB04` and should be a Tier 3 RLS migration slice.

Use one additive Drizzle migration that alters only the 53 matching `tenant_isolation_*` policies.
The target expression is:

```sql
tenant_id = (select current_setting('app.current_tenant_id', true))::text
```

The migration must preserve the live policy shape:

- Policies that currently have no `WITH CHECK` must remain `USING`-only.
- Policies that currently have `WITH CHECK` must update both `USING` and `WITH CHECK`.
- Policy names, table names, roles, commands, RLS enabled state, table schemas, indexes, data, and
  app tenant-context functions must not change.

Prefer explicit `ALTER POLICY ... ON public.<table> USING ...` statements over a broad dynamic loop
unless the implementation also adds focused tests proving the generated target list is exactly the
53 expected policies and no storage/archive/domain-event policies are included.

## Verification Contract

The future implementation must include focused database tests that prove:

- the migration references exactly the intended 53 policy/table pairs;
- every rewritten expression uses `(select current_setting('app.current_tenant_id', true))::text`;
- the 15 `USING`-only policies are not accidentally given a `WITH CHECK`;
- the 38 existing `WITH CHECK` policies still have matching tenant checks;
- no policy outside `public.tenant_isolation_*` is touched;
- `packages/database/test/rls-engaged.test.ts` still proves tenant isolation;
- `pnpm db:rls:test:required` passes before PR readiness;
- live post-apply Performance Advisor no longer reports `auth_rls_initplan`;
- live Security Advisor still reports `No issues found`.

Minimum local gates for the implementation PR:

- focused migration unit test
- `pnpm db:migrations:check-journal`
- `pnpm db:rls:test:required`
- `git diff --check`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `pnpm security:guard`
- `pnpm pr:verify`
- `pnpm e2e:gate`

## Rollout And Rollback

Roll out through the normal repo migration path first. Live apply is allowed only after the merged
migration is green and the exact live target list still matches this design. Because the change is
policy-expression-only, rollback is another policy-only migration restoring the previous
`current_setting('app.current_tenant_id', true)::text` expression for the same policy set.

Do not apply this migration to production if the live inventory has drifted from 53 matching
policies without first updating this design or creating a follow-up gate.

## Non-Goals

- No change to `withTenantContext`, `app.current_tenant_id`, or future M3
  `app.current_access_tenant_id` architecture work.
- No policy consolidation, role narrowing, permissive/restrictive policy redesign, or RLS semantic
  refactor.
- No storage policy rewrite.
- No live production mutation in this design-gate PR.
- No claim that full enterprise readiness is complete.

## Residual Risk

This design reduces a database-performance advisor blocker only after the follow-up implementation
lands and is applied. It does not solve restore drills, lifecycle fixture proof, deploy digest proof,
incident drills, routed alert acknowledgement, or representative performance-budget enforcement.
