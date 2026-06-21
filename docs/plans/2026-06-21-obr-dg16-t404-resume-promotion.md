---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-21
tracker_path: docs/plans/current-tracker.md
---

> Status: Completed Tier 0 current-authority/design-gate record. This document
> supports `current-program.md`, `current-tracker.md`, and the architecture
> tracker; it is not a source of truth by itself.

# OBR-DG16: Post-T404a T-404 Resume Promotion

## Classification

Classified as promotion/design-gate because this record only reconciles current
plan and tracker authority after `T-404a` closeout and promotes the next
governed implementation slice. Risk tier: Tier 0 because this PR touches only
docs and tracker authority.

## Authority Evidence

| Source                            | Evidence                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR `#1140`                        | `T-404a` implementation merged at `ca4e7dbe1d63ecffa5f2f7dc48ae668f0c63a498` from final implementation head `374d0823036006faff7b5414b38a4d78f89404a1`.                                                                                                |
| PR `#1141`                        | `T-404a` closeout merged at `72ad0a67f233036dd46378f3e3a3c2916b525984` from closeout head `04aff017b18a9fdb1043c8b6a9628b20ca1f64f8`.                                                                                                                  |
| Canonical repo                    | Clean at `72ad0a67f233036dd46378f3e3a3c2916b525984` before this gate branch, with branch content matching `origin/main`.                                                                                                                               |
| Current main checks               | At `72ad0a67f233036dd46378f3e3a3c2916b525984`, CI, Sonar Main Gate, CodeQL, and Secret Scan are green. CD remains pending/skippable external deployment evidence only and is not used as CI, Sonar, CodeQL, or security readiness proof.               |
| `next-slice.mjs` before this gate | Returned `blocked_requires_current_authority` / `umbrella_without_concrete_promoted_slice` with `activeSlice=null`, so implementation remained blocked until a fresh authority record selected exactly one slice.                                      |
| Architecture tracker              | `T-404a` is DONE and `T-404` is blocked only on the fresh post-`T-404a` resume decision. `T-403b`, `T-405`, and `T-406` remain downstream or dependent.                                                                                                |
| OP Brain advisory route           | Current post-`T-404a` advisory request is still in progress, so it is recorded as bounded pending. Prior OP Brain advice already identified `T-404` as the natural follow-on after the explicit consent prerequisite, with `T-403b/T-405/T-406` later. |

## Candidate Ranking

| Rank | Candidate                                                                  | Decision   | Rationale                                                                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-404` mandatory `domain-ai` entrypoint context                           | Promote    | Smallest valuable follow-on now that `T-404a` proves explicit `ai_document_extraction` consent can be resolved for queued claim document AI runs. It enforces the already defined `AICallContext` boundary at `domain-ai` entry points with compile-time and runtime proof. |
| 2    | `T-403b` brand-minted context                                              | Defer      | Depends on mandatory `domain-ai` entrypoint enforcement. Brand minting and outbox AI event semantics are broader than the current boundary-enforcement step.                                                                                                                |
| 3    | `T-405` broad caller codemod/cleanup migration                             | Defer      | Depends on `T-404`; broad caller churn should follow the mandatory boundary after the minimal current caller updates are proven.                                                                                                                                            |
| 4    | `T-406` ADR-07/ADR-08/ADR-11                                               | Defer      | Depends on `T-404` and should record proven mandatory-context behavior rather than pre-implementation intent.                                                                                                                                                               |
| 5    | `T-310`, `T-410/T-411`, `T-115/T-116/T-117/T-118/T-210`                    | Defer      | These are broader product, UI, dashboard, performance, front-door, timeline, optimistic-boundary, or route-adjacent slices with larger browser, accessibility, or tenant-context proof obligations.                                                                         |
| 6    | M5/entity migration, proxy/routing, billing, product redesign              | Reject now | Live cutover, entity migration, routing/proxy, provider/billing, and product redesign touch protected or broad milestone surfaces and are not this decision.                                                                                                                |
| 7    | Operational Brain runtime, model/provider calls, prompts, outbox AI events | Reject now | This gate promotes boundary enforcement only. Runtime AI behavior, prompt/provider work, outbox AI events, and Operational Brain product integration require later explicit gates after the privacy and AI-call boundary spine is safer.                                    |

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-404`.

`T-404` goal: make `AICallContext` non-optional on every `domain-ai` entry point
and make `client.ts` reject calls that omit it.

Future implementation scope:

- Require an `AICallContext` parameter on all public `domain-ai` entry points.
- Fail closed in `client.ts` when the call path receives missing, null, or
  structurally invalid context at runtime, before provider/model behavior.
- Preserve the `domain-privacy` contract from `T-403` and the durable consent
  evidence from `T-404a`.
- Update only the current in-repo callers that must change for type-check to
  pass against the mandatory boundary. These updates must pass explicit context
  derived from trusted evidence; they must not become a broad caller cleanup
  migration.
- Add focused type and runtime proof that dropping context is both a type error
  and a runtime rejection.

Likely implementation surfaces:

- `packages/domain-ai/src/client.ts`.
- `packages/domain-ai/src/index.ts` and any current public entrypoint modules.
- Minimal current caller updates required by type-check, including queued claim
  document extraction paths that now have `T-404a` consent resolver evidence.
- Focused `packages/domain-ai/src/**.test.ts` or type-fixture proof near the
  affected entry points.
- Package exports only if the existing `domain-ai` boundary requires them.

## Acceptance Evidence For Future T-404

| Acceptance criterion                      | Required proof                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dropping context is a type error          | A compile-fail or `@ts-expect-error` type test at the `domain-ai` public entrypoint boundary.                                                                         |
| Missing context is rejected at runtime    | Unit test proving `client.ts` rejects omitted, null, or invalid context before provider/model behavior can proceed.                                                   |
| Every `domain-ai` entry point requires it | Public export/entrypoint inventory with tests or type coverage for all current `domain-ai` entry points.                                                              |
| Current callers still compile             | Minimal current caller updates pass type-check by providing explicit `AICallContext`; no broad caller codemod or cleanup migration is included.                       |
| Consent evidence is not fabricated        | Queued claim document extraction context uses the trusted `T-404a` consent resolver, not upload custody, generic Terms/Privacy, tenant/session data, or defaults.     |
| No implicit default posture               | Negative proof that `domain-ai` does not synthesize a fallback `AICallContext` from tenant, host, session, purpose string, provider defaults, or upload ownership.    |
| No provider/prompt behavior expansion     | Diff and tests show no model/provider calls, prompts, Operational Brain runtime, extraction, summarization, embeddings, autonomous AI decisions, or outbox AI events. |

## Risk And Gate Plan For Future T-404

Expected class: ai-affected implementation.

Expected risk tier: Tier 3. The implementation is likely small and package-local,
but it changes the AI/privacy trust boundary and runtime AI boundary behavior.

Expected future proof:

- Focused `domain-ai` unit tests for type-required context and runtime rejection.
- Focused proof that queued claim document extraction passes context from the
  `T-404a` consent resolver only when explicit consent is valid.
- Type-check for touched packages.
- `pnpm check:modularity-guard` if TS files are added or materially changed.
- `pnpm slice:verify`.
- Bounded senior review with AI/privacy/security focus, plus fallback or blocker
  disposition according to reviewer-routing rules.
- Feedback intake and Copilot review on the PR head.
- Final Phase C implementation gates: `pnpm pr:verify`,
  `pnpm security:guard`, and `pnpm e2e:gate`, unless a later supervisor
  explicitly narrows or waives with evidence.

## Non-Goals

- No implementation in this design-gate PR.
- No `packages/domain-ai/**` changes in this gate PR.
- No `packages/domain-privacy/**` changes.
- No database, schema, migration, or RLS changes in this gate PR.
- No brand-minted or unforgeable `AICallContext` (`T-403b`).
- No broad caller codemod or cleanup migration beyond the minimal
  compile-required current callers in future `T-404`; `T-405` remains deferred
  for that broader migration.
- No outbox `ai.call_executed` emission or AI event semantics.
- No Operational Brain runtime, product integration, model/provider calls,
  prompts, autonomous AI decisioning, AI queues, agentic tool use, embeddings,
  extraction, classification, summarization, or retrieval.
- No proxy, canonical route, auth/session, tenant-context, billing/provider,
  entity migration, or product UI redesign.
- No broad M3/M4/M5, README, AGENTS, broad architecture-doc rewrite, package
  dependency, lockfile, runtime source, test, or implementation-worker changes
  in this gate.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof plus scope audit.

Current evidence disposition: PR `#1140` and PR `#1141` are merged at the
recorded SHAs. Post-closeout `main` at
`72ad0a67f233036dd46378f3e3a3c2916b525984` has CI, Sonar Main Gate, CodeQL, and
Secret Scan green. CD/deployment evidence remains pending/skippable external
and is waived only as deployment evidence; that waiver does not cover CI, Sonar,
CodeQL, security, reviewer feedback, or future implementation proof.

## Exit State

Authority is reconciled after `T-404a`; `T-404` is the only promoted next
implementation slice. `T-403b`, `T-405`, `T-406`, `T-310`, `T-410`, `T-411`,
`T-115`, `T-116`, `T-117`, `T-118`, `T-210`, broad M5, proxy/routing/auth,
schema/RLS, billing/provider work, entity migration, product redesign,
Operational Brain runtime, README, AGENTS, and broad architecture-doc work
remain deferred unless separately reauthorized.
