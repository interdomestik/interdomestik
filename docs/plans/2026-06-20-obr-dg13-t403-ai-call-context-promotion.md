---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-20
tracker_path: docs/plans/current-tracker.md
---

> Status: Completed Tier 0 promotion/design-gate record. This document
> supports `current-program.md` and `current-tracker.md`; it is not a source of
> truth by itself.

# OBR-DG13: Post-T205b T-403 AI Call Context Promotion

## Classification

Classified as promotion/design-gate because this record only reconciles current
plan and tracker authority after `T-205b` closeout and promotes the next
governed implementation slice. Risk tier: Tier 0 because this PR touches only
docs/tracker authority.

## Authority Evidence

| Source                            | Evidence                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#1133`                        | `T-205b` implementation merged at `705af02deaed87244f65fd18c93c21ac98d5671f` from implementation head `e6fb3e0b50ff8006409cea3eefbd923a3e215179`.               |
| PR `#1134`                        | `T-205b` closeout merged at `7e7b9437377de6e11b6bd47c53dec8985fa745dd`.                                                                                         |
| Canonical `main`                  | Clean and synced at `7e7b9437377de6e11b6bd47c53dec8985fa745dd` before this gate branch.                                                                         |
| Current main checks               | Post-closeout `main` has CI, Sonar Main Gate, CodeQL, and Secret Scan green; CD/deployment evidence is external/waived only and is not runtime-readiness proof. |
| `next-slice.mjs` before this gate | Returned `blocked_requires_current_authority` / `umbrella_without_concrete_promoted_slice` with `activeSlice=null`.                                             |
| Architecture tracker              | `T-403` is the canonical `AICallContext` foundation row in `domain-privacy/ai.ts`, before `T-404`, `T-403b`, and `T-405`.                                       |

The pre-gate resolver state is a hard stop for implementation because the only
active queue row is the `ARCH-FINAL` umbrella and the latest closeout explicitly
started no replacement slice. A fresh current-authority record is therefore
required before any worker may infer or start follow-on work.

## Candidate Ranking

| Rank | Candidate                                                             | Decision   | Rationale                                                                                                                                                                                                                                |
| ---- | --------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-403` `AICallContext` foundation                                    | Promote    | Smallest valuable canonical architecture candidate after `T-205b` with no prerequisite blocker. It creates the explicit AI-call purpose, posture, consent, and retention contract needed before any future AI or Operational Brain work. |
| 2    | `T-404` mandatory domain-ai entrypoint context                        | Defer      | Depends on `T-403`; requiring all `domain-ai` entry points to accept context before the context contract exists would force broad API churn.                                                                                             |
| 3    | `T-403b` brand-minted context                                         | Defer      | Depends on `T-403` and `T-404`; brand minting and runtime consent validation should land only after the base contract and entrypoint requirement are established.                                                                        |
| 4    | `T-405` codemod existing callers                                      | Defer      | Depends on `T-404`; codemodding callers before the mandatory entrypoint contract exists would be premature.                                                                                                                              |
| 5    | `T-310`, `T-410`, `T-411`, `T-116`, `T-117`, `T-118`, `T-210`         | Defer      | These are broader product, route, UI, performance, dashboard, optimistic UI, and timeline slices with larger browser, accessibility, or tenant-context proof obligations.                                                                |
| 6    | Broad M5, proxy, billing, entity migration, Operational Brain runtime | Reject now | Live cutover, routing/proxy, provider/billing, entity migration, and runtime AI/Operational Brain work touch protected or broad milestone surfaces and are not this decision.                                                            |

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-403`.

`T-403` goal: introduce `AICallContext` in `domain-privacy/ai.ts` as a contract
foundation for future AI-call posture, consent, and retention decisions, without
runtime model calls or product integration.

Future implementation scope:

- Define `AICallContext` in `domain-privacy/ai.ts`.
- Cover purpose, retention, posture, consent, invalidity posture, and a general
  case.
- Add focused type/domain tests as needed to prove the contract shape and
  invalid or missing posture outcomes.
- Keep the slice a contract foundation only; deterministic code still owns
  authorization, tenancy, persistence, side effects, and validation.

Likely implementation surfaces:

- `packages/domain-privacy/src/ai.ts` or the equivalent current
  `domain-privacy` AI boundary.
- Focused `domain-privacy` type/domain tests.
- Package exports only if needed for the new contract.

## Non-Goals

- No implementation in this design-gate PR.
- No Operational Brain runtime or product integration.
- No model/provider calls, prompts, autonomous AI decisioning, AI queues, agentic
  tool use, embeddings, extraction, classification, summarization, or retrieval.
- No `domain-ai` mandatory entrypoint changes (`T-404`).
- No brand-minted or unforgeable `AICallContext` (`T-403b`).
- No codemod of existing AI callers (`T-405`).
- No proxy, routing, auth/session, tenant-context, schema, migration, RLS,
  billing/provider, entity migration, or product UI redesign.
- No broad M3/M4/M5, README, AGENTS, broad architecture-doc rewrite, package
  dependency, lockfile, runtime source, test, or implementation-worker changes
  in this gate.

## Risk And Gate Plan For The Future T-403 Worker

Expected class: implementation.

Expected risk tier: Tier 3 unless a later supervisor narrows or waives with
evidence. Although the intended implementation should be type/domain-contract
only, it defines AI posture plus privacy/consent/retention semantics, which are
AI trust and privacy surfaces under Phase C.

Expected future proof:

- Focused `domain-privacy` type/domain tests proving purpose, retention,
  posture, consent, invalidity posture, and general case behavior.
- Type-check for touched packages.
- `pnpm check:modularity-guard` if TS files are added or materially changed.
- `pnpm slice:verify`.
- Reviewer/security/feedback classification proportional to AI/privacy consent
  contract risk.
- Final Phase C implementation gates: `pnpm pr:verify`,
  `pnpm security:guard`, and `pnpm e2e:gate`, unless the supervisor later
  classifies a narrower gate with evidence.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
docs/tracker proof plus `git diff --check`.

Current evidence disposition: PR `#1133` and PR `#1134` are merged at the
recorded SHAs. Post-closeout `main` at
`7e7b9437377de6e11b6bd47c53dec8985fa745dd` has CI, Sonar Main Gate, CodeQL, and
Secret Scan green. CD/deployment evidence is external/waived only; that waiver
does not cover CI, Sonar, CodeQL, security, reviewer feedback, or future
implementation proof.

## Exit State

Authority is reconciled after `T-205b`; `T-403` is the only promoted next
implementation slice. `T-404`, `T-403b`, `T-405`, `T-310`, `T-410`, `T-411`,
`T-116`, `T-117`, `T-118`, `T-210`, broad M5, proxy/routing/auth,
schema/RLS, billing/provider work, entity migration, product redesign,
Operational Brain runtime, README, AGENTS, and broad architecture-doc work
remain deferred unless separately reauthorized.
