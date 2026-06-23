---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-23
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself and does not implement runtime, product,
> schema, RLS, migration, auth, tenancy, routing, billing, or security
> remediation work.

# OBR-DG26: T-504 Selection Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `T-507` closeout and selects the next bounded follow-up path for
`T-504` before any `T-506`, entity migration, schema, tenancy, or RLS work.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority design-gate documentation.

Risk tier for the later `T-504` worker: Tier 3, because the bounded future work
will touch entity decomposition, schema/data migration posture, tenant/RLS
semantics, legal/entity correctness, rollback, and referential integrity.

## Revalidated Authority Evidence

| Source                             | Evidence                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch basis                       | `origin/main` was revalidated as exactly `fbdfd4589e0b0b2f190d2941b36f5407f39cd207`, which is the `T-507` closeout merge/main SHA. Branch `codex/obr-dg26-t504-selection-gate` was created from that SHA.       |
| `T-507` implementation             | PR `#1172` is merged. Final implementation head: `e61e5c8403eaff7336f48a6312ef050c871fbd45`. Merge/main SHA: `aa42c92c75076d5a43f23ff1c33a8cb84a7cadff`.                                                        |
| `T-507` closeout                   | PR `#1173` is merged. Final closeout head: `684904bee1db59d3c22ae8c5259b3c341f562ff3`. Closeout merge/main SHA: `fbdfd4589e0b0b2f190d2941b36f5407f39cd207`.                                                     |
| Post-closeout main health          | At `fbdfd458`, CI, Sonar Main Gate, Secret Scan/gitleaks, and CodeQL are recorded green. CD/Vercel is deployment-only/pending and is not product-readiness evidence unless branch protection changes.           |
| Resolver before this gate          | Clean current-authority proof on `origin/main` after `T-507` closeout is expected to return `blocked_requires_current_authority` with `activeSlice=null` and reason `umbrella_without_concrete_promoted_slice`. |
| OP Brain/current-authority advisor | Ptolemy recommended a Tier 0 current-authority/design-gate PR, not direct implementation, to decide and bound `T-504` before any `T-506`, entity migration, schema, tenancy, or RLS work.                       |

## Canonical Tracker Rows Cited

| Row     | Current tracker text cited for this gate                                                                                                                                                                                                                                                                                                                                                                                                 | Disposition                                                                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T-504` | `Split tenants -> legal_entities / marketing_hosts / default_booking_links`; acceptance: `Mechanical migration; referential integrity preserved`; deps: `T-305`; dim: `ARCH`; est: `L`; status: `TODO`.                                                                                                                                                                                                                                  | Candidate selected only as a bounded follow-up path. Implementation remains blocked until this gate merges and current authority resolves exactly one concrete `T-504` slice. |
| `T-506` | `Entity-migration capability with active-case guard: move members from home/hub entity to a new local legal_entity`; acceptance includes re-issuing terms under new `governing_law`, recapturing acceptance, preserving history, emitting `membership.entity_migrated`, blocking non-terminal recovery or applying documented legacy-entity run-off, dry-run plus rollback, and ADR-12; deps: `T-504`, `T-112`, `T-507`; status: `TODO`. | Explicitly not promoted. `T-506` depends on `T-504` and must remain blocked until the entity split exists and its own fresh gate approves migration behavior.                 |
| `T-507` | `Residence-change flow + DSR: user updates residence_country -> defined trigger for terms re-acceptance / migration`; completed through PR `#1172` / merge-main SHA `aa42c92c75076d5a43f23ff1c33a8cb84a7cadff`; follow-on entity migration (`T-506`) still requires fresh current authority; status: `DONE`.                                                                                                                             | Consumed prerequisite evidence only. `T-507` does not promote `T-506` or entity migration by itself.                                                                          |

## Candidate Ranking

| Rank | Candidate                                                                                                                                              | Decision                           | Rationale                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-504` selection and bounded implementation envelope                                                                                                  | Promote as the only follow-up path | `T-504` is the smallest M5-relevant prerequisite after `T-507`: it decomposes the overloaded `tenants` concept before `T-506` can safely move members between legal entities. It directly improves legal/entity correctness and tenant/privacy safety when bounded as a mechanical split with referential-integrity proof. |
| 2    | Direct `T-506` entity migration                                                                                                                        | Reject now                         | `T-506` depends on `T-504`, `T-112`, and `T-507`. `T-112` and `T-507` are complete, but `T-504` is not. Moving members, re-issuing terms, acceptance recapture, history preservation, active-case guard behavior, dry-run, rollback, and ADR-12 are too broad before the entity split exists.                              |
| 3    | Direct destructive `T-503`                                                                                                                             | Reject now                         | The destructive status drop remains separately gated and cannot be mixed into entity decomposition.                                                                                                                                                                                                                        |
| 4    | Broad M3/M4/M5, schema/RLS/tenancy migration, proxy/routing/auth/session, billing/product UI, OP Brain runtime/live AI, CodeQL high/medium, Dependabot | Reject now                         | These are protected or unrelated surfaces and are not the smallest current-authority action after `T-507`.                                                                                                                                                                                                                 |

## Decision

Promote exactly one governed follow-up path: `T-504` selection with the bounded
implementation envelope below. This branch also updates canonical
`current-program.md`, `current-tracker.md`, and the architecture tracker so that
after merge the resolver has exactly one concrete promoted slice instead of the
pre-gate `activeSlice=null` blocker state.

Direct implementation remains blocked until this gate merges and the
current-authority resolver resolves exactly one concrete `T-504` slice. No
implementation worker should start from this branch, and no `T-506`, entity
migration capability, schema/RLS migration, tenancy migration, or member
migration work is authorized by this PR.

## Bounded T-504 Implementation Plan For Later Worker

The later worker may implement only the mechanical `T-504` entity-decomposition
foundation needed before `T-506`:

1. Introduce the target data model needed to split the current overloaded
   `tenants` authority into `legal_entities`, `marketing_hosts`, and
   `default_booking_links` or their repo-approved equivalents.
2. Preserve all existing referential integrity while making the legal entity,
   marketing host, and default booking link concepts explicit.
3. Backfill from existing `tenants` data without deriving legal entity, access
   tenant, booking tenant, billing entity, host, or recovery law from unsafe
   ambient host/session context.
4. Preserve compatibility reads or transitional views/helpers where required so
   current runtime behavior is not broken before `T-506` or live cutover work.
5. Produce forward/idempotent migration proof, rollback/data-repair posture, and
   durable evidence that every foreign key or reference still resolves.
6. Stop before member/entity migration, terms re-issue, acceptance recapture,
   active-case migration guards, ADR-12 migration semantics, billing provider
   behavior changes, product UI, proxy/routing/auth/session rewrites, or broad
   M5 live cutover.

## Acceptance Evidence Inventory For Later T-504

| Evidence area            | Required proof before merge                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entity split correctness | Durable schema or domain representation for legal entities, marketing hosts, and default booking links, with explicit mapping from prior `tenants` records.                                                  |
| Referential integrity    | Proof that every existing subscription, claim, host alias, booking/default tenant reference, billing snapshot, and legal/governing-law reference remains resolvable after the split.                         |
| Migration safety         | Forward/idempotent migration or data-repair script evidence, dry-run or fixture proof where practical, partial-failure handling, and rollback/restore plan.                                                  |
| Compatibility posture    | Existing code paths either continue reading the compatibility boundary or are intentionally updated within the narrow split; no behavior should silently infer legal authority from host or session context. |
| Tenant/RLS safety        | RLS and access-tenant semantics must remain at least as restrictive as before. Any RLS policy change requires explicit tenant-isolation proof and must not rely on app-layer filtering alone.                |
| Entity/legal impact      | Legal entity identity, governing-law references, billing-entity references, and marketing host defaults are separated without moving members or re-issuing terms.                                            |
| Audit/observability      | Migration logs or aggregate evidence identify changed counts and unresolved references without exposing row-level PII. Operational diagnostics must support rollback and repair.                             |
| Regression gates         | Focused unit/domain/database tests, migration/RLS proof if touched, repo guard proof, and risk-proportional CI evidence.                                                                                     |

## Migration And Rollback Posture

The later `T-504` implementation must be reversible enough for an entity split:
forward migration should be additive or transitional where feasible, with a clear
rollback or repair path for partial writes, unresolved references, duplicate host
mappings, missing legal-entity rows, and stale compatibility reads. Destructive
removal of the original `tenants` compatibility surface is out of scope unless a
separate gate approves it with release-cycle evidence.

The worker must record exact before/after counts for affected entity rows and
reference families, but must keep proof aggregate-only unless a privileged local
operator explicitly needs row-level repair evidence.

## Tenant, RLS, Entity, And Legal Impact

`T-504` is protected-surface work even when implemented mechanically. The later
worker must explicitly assess:

- data ownership and tenant isolation for every moved or re-keyed reference
- access tenant versus legal tenant versus booking/default tenant boundaries
- whether RLS policies, session variables, or compatibility views need additive
  changes and what proves same-tenant access remains enforced
- how marketing host defaults differ from legal entity and booking authority
- how existing subscription, invoice, recovery, and terms snapshots keep their
  historical legal/entity evidence
- why no member is migrated and no terms are re-issued in `T-504`

## Reviewer Matrix For Later T-504

| Reviewer route                   | Required focus                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `architect_reviewer`             | Entity decomposition, compatibility boundary, sequencing before `T-506`, rollback, and ADR consistency.              |
| `security_reviewer` / `sentinel` | Tenant isolation, RLS, access/legal/booking boundary safety, migration misuse, and privilege assumptions.            |
| `qa_reviewer` / `gatekeeper`     | Migration fixtures, referential-integrity tests, regression matrix, current-authority scope, and proof completeness. |
| `contracts_reviewer`             | Legal entity, governing-law, billing snapshot, terms-history, and no-unapproved-reissue claims.                      |
| `performance_reviewer`           | Migration size, indexes, query-plan impact, compatibility-view/read overhead, and operational cost.                  |
| `scribe`                         | Tracker/program/current-authority closeout after implementation, including no accidental `T-506` promotion.          |

## Go / No-Go Criteria For Later Worker

Go only if all of the following are true:

- this gate is merged and current-authority resolution returns exactly one
  concrete `T-504` slice
- the worker can keep scope to entity split and referential-integrity proof
- migration/rollback posture is written before destructive or irreversible work
- tenant/RLS impact is explicitly bounded and reviewed
- `T-506` member/entity migration remains blocked

No-go if any of the following are true:

- implementing `T-504` requires moving members between legal entities or
  re-issuing terms
- the worker cannot preserve compatibility reads or prove all references resolve
- RLS or tenant semantics require broad M3/tenancy migration beyond the split
- billing/provider behavior, product UI, proxy/routing/auth/session, or broad M5
  cutover becomes necessary
- direct destructive `T-503`, high/medium CodeQL batches, Dependabot, OP Brain
  runtime/live AI, README, AGENTS, or broad architecture rewrite is pulled in

## Explicit Non-Goals

- No product/runtime code in this gate.
- No tests, dependency files, README, AGENTS, schema/RLS/migrations, proxy,
  routing, auth, session, tenancy, billing, product UI, or implementation-worker
  startup in this gate.
- No direct `T-506`, entity migration capability, member movement, terms
  re-issue, acceptance recapture, active-case guard implementation, or ADR-12
  implementation.
- No direct destructive `T-503`, broad M3/M4/M5, OP Brain runtime/live AI,
  high/medium CodeQL batch work, Dependabot work, or broad architecture rewrite.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs-only selection gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/current-authority proof, resolver proof, and scope audit.

Expected Tier 0 proof for this PR:

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs <repo>`

## Exit State

Authority is reconciled after `T-507`. The only promoted follow-up path is the
bounded `T-504` selection described here. Direct implementation remains blocked
until this gate merges and current-authority resolves exactly one concrete
`T-504` slice. `T-506`, entity migration, schema/RLS/tenancy migration, direct
`T-503`, proxy/routing/auth/session, billing/product UI, OP Brain runtime/live
AI, high/medium CodeQL, Dependabot, README, AGENTS, and broad M3/M4/M5 remain
unpromoted unless separately reauthorized.
