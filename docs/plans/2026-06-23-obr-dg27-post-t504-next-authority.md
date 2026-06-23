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

# OBR-DG27: Post-T504 Next Authority Gate

## Classification

Classified as promotion/design-gate because this record only reconciles current
authority after `T-504` closeout and selects one bounded follow-up path before
any member/entity migration, terms re-issue, acceptance recapture, active-case
guard implementation, ADR-12 migration semantics, or full M5 cutover work.

Risk tier for this PR: Tier 0, because this branch changes only
`docs/plans/**` current-authority design-gate documentation.

Risk tier for the later `T-506a` worker: Tier 3, because even a dry-run-first
entity-migration readiness slice crosses legal-entity, membership, terms,
tenant/RLS, rollback/data-repair, and active-case guard evidence boundaries.

## Revalidated Authority Evidence

| Source                    | Evidence                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch basis              | `origin/main` was revalidated as `883644c94c62f63a9bbac4242e1c024ffff6cefc`, the `T-504` closeout merge/main SHA, before branch `codex/obr-dg27-post-t504-next-authority` was created.                                        |
| `T-504` implementation    | PR `#1175` is merged. Final implementation head: `b18d525933c29f5a5ea8304d6b41d29ba7bafb64`. Merge/main SHA: `1f77d7d38d83031b76a1858d1259cd51a5573f68`.                                                                      |
| `T-504` closeout          | PR `#1176` is merged. Closeout merge/main SHA: `883644c94c62f63a9bbac4242e1c024ffff6cefc`.                                                                                                                                    |
| Post-closeout main health | At `883644c`, public GitHub evidence records CI, Sonar Main Gate, Secret Scan/gitleaks, and CodeQL green. CD/Vercel remains deployment-only evidence and is not product-readiness proof.                                      |
| Resolver before this gate | Clean current-authority proof on `origin/main` after `T-504` closeout returned `blocked_requires_current_authority`, `activeSlice=null`, and reason `umbrella_without_concrete_promoted_slice`.                               |
| Prior advisor             | OP Brain/current-authority advisor recommended a Tier 0 gate, not direct implementation, with a likely bounded first `T-506` slice focused on dry-run/eligibility/repair-plan before any full member/entity migration writes. |

## Candidate Comparison

| Candidate                                   | Decision             | Rationale                                                                                                                                                                                                                                      |
| ------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T-506a` entity-migration readiness dry run | Promote exactly this | `T-504`, `T-112`, and `T-507` are complete, so the next smallest useful step is to prove migration eligibility, active-case blocking, repair categories, and rollback posture without moving members or re-issuing terms.                      |
| Full `T-506` member/entity migration        | Reject for now       | Full migration includes member moves, terms re-issue, acceptance recapture, history preservation, `membership.entity_migrated`, active-case guard behavior, dry-run plus rollback, and ADR-12 semantics. That is too broad for the first step. |
| `T-501` ida live-login flip                 | Reject for now       | It is route/auth/session/live-cutover work and should not be mixed with the legal-entity migration readiness path.                                                                                                                             |
| `T-502` layout consolidation                | Reject for now       | It is route/layout/product UI work with broad deletion risk; it does not reduce the immediate entity-migration uncertainty after `T-504`.                                                                                                      |
| Direct destructive `T-503` status drop      | Reject for now       | It remains destructive schema/lifecycle work requiring separate release-cycle evidence and fresh approval.                                                                                                                                     |
| `T-505` ADR-06 finalization                 | Reject for now       | It depends on `T-501`, so it is not ready as the next governed action.                                                                                                                                                                         |

## Decision

Promote exactly one governed implementation slice: `T-506a`, the bounded
entity-migration readiness dry-run and repair-plan slice.

Direct implementation remains blocked until this gate merges and the
current-authority resolver resolves exactly `T-506a`. This gate does not
authorize full `T-506`, member/entity migration writes, terms re-issue,
acceptance recapture, active-case guard implementation, ADR-12 migration
semantics, billing/product UI, proxy/routing/auth/session changes, direct
destructive `T-503`, high/medium CodeQL batches, Dependabot work, README/AGENTS
edits, OP Brain runtime/live AI, or broad M3/M4/M5 rewrites.

## Bounded T-506a Implementation Envelope

The later `T-506a` worker may implement only dry-run-first readiness proof:

1. Build or extend a deterministic eligibility classifier for prospective
   member/entity migration candidates.
2. Produce a dry-run report that classifies candidates into eligible and
   blocked/repair-needed categories without writing migration state.
3. Prove active recovery cases are blocked or classified for documented
   legacy-entity run-off before any future write path exists.
4. Identify required legal entity, governing-law, terms-version, acceptance,
   subscription, residence, and booking/default-link evidence needed for full
   `T-506`.
5. Record rollback and data-repair posture for missing/ambiguous legal entities,
   missing terms snapshots, active recovery blockers, unsupported jurisdictions,
   and historical reference gaps.
6. Add focused tests for the classifier/report and low-privilege tenant-scoped
   read behavior where DB access is used.
7. Stop before any member/entity migration write, terms re-issue, acceptance
   recapture, active-case guard write implementation, ADR-12 semantics, billing
   behavior, product UI, proxy/routing/auth/session, or full M5 cutover.

## Future Implementation Evidence Expectations

| Evidence area                       | Required proof for `T-506a`                                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema/RLS/migration impact         | If touched, focused schema/migration/RLS tests plus `pnpm db:rls:test:required`; if not touched, exact not-applicable rationale proving `T-506a` is read-only/dry-run and makes no DB shape change. |
| Low-privilege tenant-scoped reads   | Tests or integration proof that dry-run inputs respect tenant/access boundaries under the intended low-privilege role, not only admin/system clients.                                               |
| Active-case guard proof             | Fixtures for terminal and non-terminal recovery lifecycle states proving non-terminal active cases are blocked or classified for run-off and not silently eligible.                                 |
| Terms/acceptance/legal-entity proof | Durable-source inventory for governing law, terms version, accepted terms, residence country, subscription legal entity, target legal entity, and default booking links.                            |
| Rollback/data repair                | Aggregate-only report categories for missing/ambiguous legal entities, missing terms snapshots, active-case blockers, unsupported jurisdictions, and unresolved historical references.              |
| No-write guarantee                  | Tests or static guard proof that the dry-run path does not move members, re-issue terms, recapture acceptance, emit `membership.entity_migrated`, or write migration state.                         |
| Human approval/waiver               | Explicit human approval or waiver is required before any later full `T-506` write-capable migration slice.                                                                                          |

## Reviewer Plan

Because this Tier 0 gate selects a future Tier 3 legal/entity migration path,
run bounded Sonnet review and bounded Gemini review for this gate if callable or
available. Their focus should be current-authority correctness, scope
containment, migration sequencing, RLS/tenant safety, terms/acceptance evidence,
active-case guard proof, rollback/data-repair posture, and whether `T-506a` is
small enough to precede full `T-506`.

Escalate to Opus only if Sonnet and Gemini disagree or leave unresolved
high-risk migration/design ambiguity. Codex Security scan is not required for
this docs-only gate, but the future `T-506a` worker should run normal security
and PR feedback evidence proportional to its actual touched surfaces.

## Explicit Non-Goals

- No product/runtime code in this gate.
- No tests, dependencies, README, AGENTS, schema/RLS/migrations, proxy, routing,
  auth, session, tenancy, billing, product UI, or implementation-worker startup
  in this gate.
- No direct full `T-506`, member/entity migration writes, terms re-issue,
  acceptance recapture, active-case guard implementation, or ADR-12 migration
  semantics.
- No direct destructive `T-503`, high/medium CodeQL batch work, Dependabot work,
  OP Brain runtime/live AI, or broad M3/M4/M5 rewrite.

## Expected Tier 0 Proof

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `node /Users/arbenlila/.codex/skills/interdomestik-slice-runner/scripts/next-slice.mjs .`

## Exit State

After this gate merges, current authority should resolve exactly one active
implementation slice: `T-506a`, class `implementation`, Tier 3. Full `T-506`
remains unpromoted until `T-506a` completes and a later current-authority gate
approves a write-capable member/entity migration slice with human approval or
explicit waiver.
