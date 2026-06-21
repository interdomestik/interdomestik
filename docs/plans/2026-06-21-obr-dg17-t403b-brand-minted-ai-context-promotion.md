---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-21
tracker_path: docs/plans/current-tracker.md
---

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md`, `current-tracker.md`, and the architecture tracker; it is
> not a source of truth by itself.

# OBR-DG17: T-403b Brand-Minted AI Context Promotion

## Classification

Classified as promotion/design-gate because this record only reconciles current
plan and tracker authority after `T-404` closeout and promotes the next governed
implementation slice. Risk tier: Tier 0 because this PR touches only docs and
tracker authority.

## Authority Evidence

| Source                            | Evidence                                                                                                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#1143`                        | `T-404` implementation merged at `00acc58be86548fdea8efc09a7360a8124cd2f6d` from final implementation head `55b1c7ab956e05f0f91d38805dcb2dcaab031298`.                                                                                                                                             |
| PR `#1144`                        | `T-404` closeout merged at `71b77163af8af93c0e47d7236c3f9ccfb98a26dd`.                                                                                                                                                                                                                             |
| Worker worktree                   | Clean at `71b77163af8af93c0e47d7236c3f9ccfb98a26dd` on branch `codex/obr-dg17-t403b-gate`, matching `origin/main`.                                                                                                                                                                                 |
| Current main checks               | At revalidation time, CI, CodeQL, Secret Scan, Sonar Main Gate, Vercel, and one Dependabot run were green on `71b77163af8af93c0e47d7236c3f9ccfb98a26dd`; a newer Dependabot run on the same SHA was observed in progress and is recorded as non-blocking current-check churn for this Tier 0 gate. |
| `next-slice.mjs` before this gate | Returned `blocked_requires_current_authority` / `umbrella_without_concrete_promoted_slice` with `activeSlice=null`, so implementation remained blocked until a fresh authority record selected exactly one slice.                                                                                  |
| Architecture tracker              | `T-403` and `T-404` are DONE; `T-403b` is the Rev 22 / ADR-22 type-level guard follow-up for brand-minted `AICallContext`; `T-405` and `T-406` remain downstream.                                                                                                                                  |
| OP Brain advisory route           | Supervisor reported post-`T-404` OP Brain advisory in progress in thread `019ee19b-0987-73f1-bf1e-37e075a9031a`; no newer repo authority was available, so this gate records advisory-in-flight and proceeds from repo/GitHub/tracker evidence.                                                    |

## Candidate Ranking

| Rank | Candidate                                                                  | Decision   | Rationale                                                                                                                                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-403b` brand-minted `AICallContext`                                      | Promote    | Smallest valuable follow-up after `T-403` defined the contract and `T-404` made it mandatory at `domain-ai` entry points. It closes the remaining type-level guard gap by making trusted context provenance unforgeable without starting broader caller cleanup or runtime AI expansion. |
| 2    | `T-405` broad caller codemod/cleanup migration                             | Defer      | Depends on the branded context boundary. Broad caller cleanup should not run until call sites can only receive a minted context.                                                                                                                                                         |
| 3    | `T-406` ADR-07/ADR-08/ADR-11                                               | Defer      | Should record proven context behavior after `T-403b`; doing ADR consolidation now would document an unproven unforgeability claim.                                                                                                                                                       |
| 4    | Operational Brain runtime, provider/model calls, prompts, outbox AI events | Reject now | This gate is a type-level trust-boundary promotion. Runtime AI behavior, prompts, provider calls, AI event emission, and Operational Brain product integration need later explicit gates.                                                                                                |
| 5    | Broad M3/M4/M5, proxy/routing/auth, billing, product UI, entity migration  | Reject now | These touch protected or broad milestone surfaces and are unrelated to the smallest post-`T-404` AI context provenance gap.                                                                                                                                                              |

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-403b`.

`T-403b` goal: make `AICallContext` unforgeable outside trusted
`domain-privacy` minting paths by adding a module-private brand and allowing only
trusted posture/consent validation to mint it.

Future implementation scope:

- Add an unexported `unique symbol` brand to `AICallContext` in the
  `domain-privacy` AI boundary.
- Mint branded contexts only through trusted `domain-privacy` posture and consent
  validation, including the existing `T-404a` document-extraction consent
  resolver path.
- Return a typed missing-consent error when consent is absent, instead of
  constructing a context through defaults, upload custody, tenant/session data,
  or generic Terms/Privacy acceptance.
- Add compile-fail proof that structural context forging outside
  `domain-privacy` is rejected.
- Update only the compile-required proof/call sites needed to keep the mandatory
  `domain-ai` boundary green with branded contexts.

Likely implementation surfaces:

- `packages/domain-privacy/src/ai.ts`.
- Focused `packages/domain-privacy/src/**` type/domain tests or type fixtures.
- Minimal `packages/domain-ai/src/**` proof updates only if the mandatory
  entrypoint boundary needs branded-context type coverage.
- Minimal current caller proof where branding makes a previously structural
  context fail to compile.

## Acceptance Evidence For Future T-403b

| Acceptance criterion                     | Required proof                                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context cannot be forged                 | `@ts-expect-error` or compile-fail fixture proving external structural construction of `AICallContext` does not type-check.                                                                                             |
| Only trusted code mints context          | Tests or type proof show `domain-privacy` minting paths call posture and consent validation before returning a branded context.                                                                                         |
| Missing consent is typed                 | Negative proof returns a typed missing-consent error and does not create a context.                                                                                                                                     |
| Document extraction stays consent-backed | Queued claim document extraction continues to rely on the trusted `T-404a` consent evidence path.                                                                                                                       |
| No default or ambient context            | Negative proof rejects context synthesis from tenant, host, session, upload ownership, provider defaults, or generic Terms/Privacy.                                                                                     |
| Scope stays narrow                       | Diff contains no broad caller codemod, outbox AI event implementation, Operational Brain runtime, provider/model calls, prompt changes, billing, product UI, proxy/routing/auth, schema/RLS, README, or AGENTS changes. |

## Risk And Gate Plan For Future T-403b

Expected class: ai-affected implementation.

Expected risk tier: Tier 3. The implementation should be type/domain focused,
but it changes AI/privacy trust provenance and consent enforcement.

Expected future proof:

- Focused `domain-privacy` tests for brand minting, missing-consent error, and
  trusted consent validation.
- Compile-fail or `@ts-expect-error` proof for external context forging.
- Focused proof that current `domain-ai` entry points accept only branded
  `AICallContext`.
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
- No runtime source, tests, package metadata, lockfiles, schema, migration, or
  RLS changes in this gate PR.
- No broad caller codemod or cleanup migration; `T-405` remains deferred.
- No outbox `ai.call_executed` or AI event implementation.
- No Operational Brain runtime or product integration.
- No model/provider calls, prompts, autonomous AI decisioning, AI queues beyond
  existing boundaries, agentic tool use, embeddings, extraction, classification,
  summarization, or retrieval.
- No proxy, canonical route, auth/session, tenant-context, billing/provider,
  entity migration, or product UI redesign.
- No broad M3/M4/M5, README, AGENTS, broad architecture-doc rewrite, dependency,
  lockfile, runtime source, test, or implementation-worker changes in this gate.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof plus scope audit.

Current evidence disposition: PR `#1143` and PR `#1144` are merged at the
recorded SHAs. Post-closeout `main` at
`71b77163af8af93c0e47d7236c3f9ccfb98a26dd` has required CI/security/Sonar
evidence green from the closeout proof; an observed newer Dependabot run on the
same SHA is check churn, not runtime readiness proof for this Tier 0 gate.

## Exit State

Authority is reconciled after `T-404`; `T-403b` is the only promoted next
implementation slice. `T-405`, `T-406`, Operational Brain runtime, model/provider
calls, prompts, outbox AI events, broad M3/M4/M5, proxy/routing/auth,
schema/RLS, billing, product UI, entity migration, README, AGENTS, and broad
architecture-doc work remain deferred unless separately reauthorized.
