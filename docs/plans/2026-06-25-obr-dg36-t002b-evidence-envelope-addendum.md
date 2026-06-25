---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-25
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design addendum. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG36 T-002b Evidence Envelope Addendum

## Decision

Do not start `T-002b` runtime implementation from the current repository state.

`OBR-DG35` correctly selected `T-002b` as the next core M0-M5 row after
`T-110`, but its own required future evidence cannot be satisfied without a
fresh current-authority/design decision. The current codebase does not expose a
`submitted_to_airline` transition target, and the central transition read
context has durable recovery-fee evidence only for the existing
`evaluation -> negotiation/court` recovery invariant. It does not yet have a
durable, lockable evidence envelope for signed assignment or POA, airline
submission consent, valuation-delta proof, service consent, medical consent, or
invalidity human-review proof.

Expected resolver state after this addendum is
`blocked_requires_current_authority` with `activeSlice=null` until a fresh gate
selects exactly one next governed action.

## Evidence

- `OBR-DG35` was merged through PR `#1201` at
  `d50de4ce7e8929a709c918790eba44e3172d65f7`; post-merge main health was green
  for CI `28138436353`, Sonar Main Gate `28138436364`, Secret Scan/gitleaks
  `28138436438`, and CodeQL `28138436049`. CD/Vercel was deployment-only.
- The post-merge resolver selected `T-002b` as Tier 3 implementation work from
  `docs/plans/current-tracker.md`.
- The bounded T-002b worker/supervisor proof found no
  `submitted_to_airline` value in the canonical claim status set. Current
  status targets are `draft`, `submitted`, `verification`, `evaluation`,
  `negotiation`, `court`, `resolved`, and `rejected`.
- `packages/domain-claims/src/claims/transition-read-context.ts` currently
  loads recovery-invariant evidence for the existing recovery transition guard.
  It does not load assignment/POA, airline consent, valuation-delta, service
  consent, medical consent, or invalidity human-review proof.
- Existing durable recovery evidence covers
  `claim_escalation_agreements` and `claim_recovery_no_fee_evidence`; AI
  extraction consent evidence is scoped to document AI processing and is not a
  general service, medical, airline-submission, or human-review consent source.

## Required Decision

A follow-up current-authority/design gate must decide exactly one next governed
action before runtime implementation resumes:

1. define whether airline submission needs a new canonical status/lifecycle
   state or must map to an existing state with explicit non-lossy semantics;
2. identify or authorize the smallest durable, tenant-scoped evidence envelope
   for assignment/POA, accepted fee, airline submission consent,
   valuation-delta, service consent, medical consent, and invalidity
   human-review proof;
3. define the transition read-context lock/read order for that evidence before
   status update, stage history, and domain-event side effects;
4. keep broad SVC/FLIGHT/VONESA rollout, CQRS/read-model work, product UI,
   proxy/routing/auth/session/tenancy refactors, direct destructive `T-503`,
   billing changes, README, AGENTS, and M6/product expansion out of scope.

## Non-Goals

This addendum does not promote a replacement runtime slice. It does not change
`apps/web/src/proxy.ts`, source code, tests, dependencies, lockfiles, schema,
RLS, migrations, product UI, billing, README, AGENTS, or broad architecture
documents. It records the concrete authority gap so the next worker is not asked
to infer missing product/state-machine and evidence-storage semantics.
