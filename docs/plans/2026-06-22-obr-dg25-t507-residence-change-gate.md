---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-22
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself and does not implement runtime, product, schema, auth, tenancy, billing,
> or security remediation work.

# OBR-DG25: T-507 Residence-Change Flow + DSR Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `SEC-CQL-01b` closeout and selects one bounded future
implementation slice.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority records.

Risk tier for the promoted future slice: Tier 3, because the future
implementation touches residence-change workflow semantics, DSR/privacy
handling, terms re-acceptance or migration policy, active recovery run-off
behavior, audit/evidence, and likely schema/domain boundaries.

## Revalidated Authority Evidence

| Source                    | Evidence                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch basis              | `codex/obr-dg25-t-507-residence-change-gate` is attached to `origin/main` at `c1e03b2773aa6f92ab5ae977fc9c19ab725ab8fc`.                         |
| `SEC-CQL-01`              | PR `#1165` merged at `0318b7acd6521a012bf0f98802465e098578e47d`; closeout PR `#1166` merged at `0861a292c665f20e3e94fa19b811bc40cabfdb62`.       |
| `SEC-CQL-01b`             | PR `#1167` merged at `3d8d392d58064b4ca9c640eb67620ce4fc1df9f2`; closeout PR `#1168` merged at `78cfa0978735835b4f0d1261eb1c62f6eb359ac6`.       |
| Alert `#44` follow-up     | PR `#1169` merged at `7a4b44eb2aefb6df94f1ee0a214936a42ee6c217`; final closeout PR `#1170` merged at `c1e03b2773aa6f92ab5ae977fc9c19ab725ab8fc`. |
| Post-merge main health    | At `c1e03b2`, CI, Sonar Main Gate, Secret Scan/gitleaks, and CodeQL check runs are green. CD/Vercel remains deployment-only evidence.            |
| CodeQL critical alerts    | Alerts `#44`, `#45`, and `#46` are `state=fixed` on `refs/heads/main`; `dismissed_at=null`.                                                      |
| Resolver before this gate | `next-slice.mjs .` returned `blocked_requires_current_authority`, `activeSlice=null`, reason `umbrella_without_concrete_promoted_slice`.         |
| OP Brain recommendation   | Advisory recommends the next smallest governed action as a Tier 0 current-authority/design-gate PR promoting exactly `T-507`.                    |

## Decision

Promote exactly one next governed implementation slice:
`T-507 Residence-change flow + DSR`.

Direct implementation must wait until this gate merges and the current-authority
resolver promotes exactly `T-507`. No implementation worker should start from
this branch.

## Why T-507 Now

`T-507` is selected now because it is M5-relevant, carries direct
compliance/user value, depends only on completed `T-113`, is smaller and safer
than tenant/entity migration, and unblocks later `T-506` entity-migration
capability by defining residence-change and DSR trigger policy first.

`T-506` remains larger because it requires entity migration, terms re-issue,
acceptance capture, history preservation, active-case guard behavior, dry-run,
rollback, and likely stronger data migration proof. `T-507` can define the user
and compliance policy boundary before that migration machinery exists.

## Future T-507 Scope Guidance

Future implementation must be limited to the `T-507` residence-change and DSR
policy/workflow slice:

- Define the residence-change trigger policy: whether `users.residence_country`
  changes trigger immediate terms re-acceptance plus migration, defer to
  renewal, or enter a documented pending state.
- Define DSR/run-off handling for active recovery members and the evidence that
  proves export, erasure, retention, and run-off behavior remains lawful.
- Do not force migration during non-terminal recovery unless explicitly designed
  and reviewed; active recovery members should be deferred/run-off by default.
- Preserve historical residence, terms, and entity evidence needed for audit,
  support, member explanation, and rollback.
- Include rollback/evidence expectations before runtime code: persisted state
  transitions, audit events, support/admin diagnostics, dry-run or preview
  output where applicable, and recovery from partial residence-change attempts.
- Include reviewer/gate expectations for privacy/DSR, legal/entity correctness,
  tenant isolation, active recovery safety, support operations, and regression
  proof.

## Explicit Non-Goals

- No `T-507` implementation work in this gate.
- No direct `T-506` entity migration or tenant/entity split.
- No direct destructive `T-503` or `claims.status` removal/rename/drop.
- No proxy/routing/auth/session/tenancy/schema/RLS/migrations/billing/product
  UI changes.
- No Operational Brain runtime/live AI, model/provider calls, prompts, or outbox
  AI events.
- No high/medium CodeQL batches, Dependabot/dependency work, broad M3/M4/M5,
  VONESA/WS-F, OMG, DOM, README, AGENTS, broad architecture-doc rewrite, or
  implementation-worker startup.

## Acceptance Evidence Inventory For Future T-507

| Evidence area                | Required proof for the future worker                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Residence-change policy      | Durable representation of the chosen trigger policy, with explicit immediate/deferred/pending semantics and no host/tenant inference.      |
| Terms and migration boundary | Proof of when terms re-acceptance is required, when migration is allowed, and when migration is blocked/deferred.                          |
| Active recovery run-off      | Proof that non-terminal recovery members are not force-migrated unless an explicitly reviewed design says otherwise.                       |
| DSR and retention            | Export/erasure/retention behavior tied to residence changes and active recovery state, including preserved non-PII timeline/audit shape.   |
| Audit and support evidence   | Audit events, support/admin diagnostics, member-safe explanations, and rollback or repair evidence for partial or failed changes.          |
| Tenant/privacy safety        | Proof that residence changes do not derive tenant, access tenant, legal entity, host, billing entity, or recovery law from unsafe context. |
| Gates and review             | Local and remote gates proportional to the final touched surfaces, plus privacy/legal, security/tenant, QA, and operations review.         |

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs/current-authority gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof, resolver proof, and scope audit.

## Exit State

Authority is reconciled after `SEC-CQL-01b`. The next active governed
implementation goal is exactly one canonical tracker slice: `T-507`.

Future `T-507` implementation must stop at residence-change flow plus DSR policy
and evidence unless a fresh current-authority/design-gate selection promotes
another slice.
