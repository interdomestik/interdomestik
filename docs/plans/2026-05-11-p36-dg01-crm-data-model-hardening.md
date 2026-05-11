---
status: design-review
date: 2026-05-11
slice: P36-DG01
title: CRM Data-Model Hardening Re-Review
owner: platform + product + qa
phase: Phase C
---

# P36-DG01 CRM Data-Model Hardening Re-Review

## Decision

`P35-SEC02 Agent Dashboard Tenant Read Contract` is closed on `main` at commit
`781de6d19a3eb6408fd75746c466fcf76a51c8de`.

The next bounded program tranche is:

`P36 CRM Data-Model Hardening`

The first implementation slice is:

`P36-CRM-DM01 Durable CRM Lead Branch Ownership`

This gate promotes DM01 because the current `domain-crm` boundary authorizes CRM lead mutations
against a `branchId` value that is reconstructed from the assigned agent's current branch. Since
`crm_leads` does not persist `branch_id`, an agent branch move can retroactively change the
apparent branch ownership of historical CRM leads. That is a live CRM custody and authorization
correctness issue, not a reporting polish item.

## Evidence

| Evidence                                                  | Finding                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/database/src/schema/crm.ts`                     | `crm_leads` has `tenant_id` and `agent_id` but no durable `branch_id`.                                                 |
| `apps/web/src/lib/domain-crm/lead-mutation-repository.ts` | `findById` reconstructs lead branch from the current assigned agent row.                                               |
| `packages/domain-crm/src/leads/mutations.ts`              | Lead mutation authorization checks `lead.branchId` against `actor.scope.branchId`.                                     |
| `packages/database/src/schema/leads.ts`                   | `member_leads` already persists non-null `branch_id`, proving the branch invariant is expected in adjacent lead flows. |
| `docs/plans/current-tracker.md`                           | P34 closed the CRM boundary work, but intentionally left schema/data-model hardening for later bounded slices.         |

## Promoted Slice

`P36-CRM-DM01 Durable CRM Lead Branch Ownership`

Implementation scope:

- Add nullable `crm_leads.branch_id` with a reference to `branches.id`.
- Backfill existing CRM leads from the assigned agent's current branch as a one-time migration step.
- Record audit evidence for the backfill so the historical approximation is inspectable.
- Persist `branch_id` on new CRM lead creation from `actor.scope.branchId`.
- Read CRM lead branch ownership from `crm_leads.branch_id`, not from current `user.branchId`.
- Remove the app adapter's `resolveLeadBranch` fallback once reads use the lead row.
- Add focused regression tests proving agent branch movement does not retroactively change existing
  CRM lead branch authorization.
- Keep lead transfer/reassignment as an explicit later domain operation unless the migration needs a
  narrowly scoped helper.

Allowed touch points:

- `packages/database/src/schema/crm.ts`
- `packages/database/drizzle/**` for the journaled migration
- `packages/domain-crm/src/leads/**`
- `apps/web/src/lib/domain-crm/lead-mutation-repository.ts`
- focused CRM lead mutation/repository tests
- `docs/plans/**` for proof and closeout state

Must not touch:

- `apps/web/src/proxy.ts`
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`
- auth provider layering or session shape
- tenancy architecture
- Stripe
- README, AGENTS, or broad architecture docs
- pipeline UI, task aggregate work, automation, AI, campaign, cron/NPS architecture, or broad DB
  posture burn-down

## Acceptance Criteria For DM01

- Existing CRM leads have an explicit `branch_id` after migration/backfill.
- New CRM leads persist `branch_id` from the authorized CRM actor context.
- CRM lead authorization reads branch ownership from `crm_leads.branch_id`.
- Tests prove an agent moving branches does not change existing lead branch ownership.
- Tests prove missing actor branch scope still fails closed.
- `pnpm --filter @interdomestik/domain-crm test:unit` passes.
- Focused web CRM lead mutation tests pass.
- Migration verification and DB access guard pass.

## Non-Goals

- No pipeline board, CRM analytics dashboard, AI assistant, automation rules, or task aggregate.
- No unification of `crm_leads` and `member_leads`.
- No branch transfer workflow beyond what is required for safe migration/backfill.
- No broad schema cleanup or status/stage redesign in this slice.
