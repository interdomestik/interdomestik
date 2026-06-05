---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-05
superseded_by:
---

# ENT-OPS01 Backup Restore Drill Evidence Contract

> Status: Input document. This contract defines the evidence required for a staging
> backup/restore drill. It does not authorize production operations or replace the active
> architecture-finalization tracker.

## Purpose

Move the backup/restore enterprise-readiness lane from "not yet scoped" to a concrete,
operator-executable evidence contract. A future drill can use this template to prove recovery
without inventing acceptance criteria during an incident.

## Scope

This contract covers a staging or non-production restore drill only.

In scope:

- Backup or provider recovery-point identification.
- Restore target identification.
- RTO and RPO measurement.
- Tenant-data validation commands and owner sign-off.
- Pass/fail decision and follow-up issue capture.

Out of scope:

- Production restore execution.
- Credential rotation.
- Runtime code, schema, RLS, auth, tenancy, routing, billing, product UI, proxy, README, AGENTS, or
  broad architecture-document changes.
- Destructive operations against live production data.

## Evidence Template

Copy this section into a dated drill record when a real staging restore is executed.

```md
# Backup Restore Drill - YYYY-MM-DD

## Identity

- Drill id:
- Environment restored from:
- Restore target environment:
- Backup or recovery point id:
- Backup or recovery point timestamp:
- Requested by:
- Executed by:
- Decision owner:

## Timing

- Incident start or drill start time:
- Restore start time:
- Restore completed time:
- Validation completed time:
- Measured RTO:
- Measured RPO:
- Target RTO:
- Target RPO:

## Safety

- Production data was not overwritten: yes/no
- Restore target isolated from live traffic: yes/no
- Secrets or credentials exposed in this record: no
- PII sampled in this record: no

## Validation

- Database reachable:
- Required migrations present:
- Tenant count check:
- Critical table row-count sanity check:
- RLS or tenant-boundary sanity check:
- Application smoke target:
- Application smoke result:

## Commands

- Command 1:
- Command 2:
- Command 3:

## Result

- Decision: pass/fail
- Blocking findings:
- Non-blocking findings:
- Follow-up issue or PR:
- Owner sign-off:
```

## Acceptance Criteria

A restore drill record satisfies this contract only when:

- the backup or recovery point is uniquely identified;
- the restore target is isolated from live production traffic;
- measured RTO and RPO are recorded;
- validation includes database reachability, migration posture, tenant sanity, and at least one
  tenant-boundary check;
- the record contains no secrets, credentials, raw PII, claim narratives, document contents, or
  payment data;
- a named owner records a pass/fail decision; and
- any blocker has a follow-up issue, PR, or explicit risk owner.

## Recommended First Drill

The first drill should restore the latest staging-safe backup into an isolated staging branch or
temporary database, run read-only validation commands, and record the result using the template
above. If connector credentials or provider access are missing, record that as a blocker instead of
simulating restore success.

## Relationship To Enterprise Readiness

This contract supports the open backup/restore lane in
`docs/plans/enterprise-readiness-register.md`. It is one operational maturity step; it does not by
itself prove full enterprise readiness.
