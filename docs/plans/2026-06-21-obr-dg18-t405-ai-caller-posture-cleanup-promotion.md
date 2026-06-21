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

# OBR-DG18: T-405 AI Caller Posture Cleanup Promotion

## Classification

Classified as promotion/design-gate because this record only reconciles current
plan and tracker authority after `T-403b` closeout and promotes the next governed
implementation slice. Risk tier: Tier 0 because this PR touches only docs and
tracker authority.

## Authority Evidence

| Source                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#1146`                        | `T-403b` implementation merged at `3602d709f04bbaf943a33dd15ced2ccc671ee492` from final implementation head `62b67fe9e2402a30e1522147957cdb74d610d96f`.                                                                                                                                                                                                                                                              |
| PR `#1147`                        | `T-403b` closeout merged at `1c12d6879324a1a24190db3392ebdb103454255a`.                                                                                                                                                                                                                                                                                                                                              |
| Worker worktree                   | Clean at `1c12d6879324a1a24190db3392ebdb103454255a` on branch `codex/obr-dg18-t405-gate`, matching `origin/main` before this gate.                                                                                                                                                                                                                                                                                   |
| Current main checks               | At supervisor revalidation time after `T-403b` closeout, CI, CodeQL, Sonar Main Gate, and Secret Scan were green on `1c12d6879324a1a24190db3392ebdb103454255a`; CD was pending with zero jobs and recorded as deployment-context friction, not readiness evidence.                                                                                                                                                   |
| `next-slice.mjs` before this gate | Returned `blocked_requires_current_authority` / `umbrella_without_concrete_promoted_slice` with `activeSlice=null`, so implementation remained blocked until a fresh authority record selected exactly one slice.                                                                                                                                                                                                    |
| Architecture tracker              | `T-403`, `T-404a`, `T-404`, and `T-403b` are DONE; `T-405` and `T-406` remain TODO in M4, and M5 remains broader live-cutover work.                                                                                                                                                                                                                                                                                  |
| OP Brain advisory route           | Thread `019ee19b-0987-73f1-bf1e-37e075a9031a` completed advisory on 2026-06-21 and recommended `T-406` first. Supervisor records the advice but selects `T-405` because the canonical critical path lists `T-403 -> T-404 -> T-405`, the M4 product-model alignment gap names `T-403/404/405`, and ADR-08 should document the cleaned caller posture after `T-405` rather than known residual caller-migration debt. |

## Candidate Ranking

| Rank | Candidate                                                                  | Decision   | Rationale                                                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `T-405` broad `domain-ai` caller posture cleanup migration                 | Promote    | Smallest valuable critical-path follow-up after `T-403` defined context, `T-404a` supplied consent, `T-404` made context mandatory, and `T-403b` made context unforgeable. It removes remaining caller-posture drift before ADR consolidation or runtime AI expansion. |
| 2    | `T-406` ADR-07/ADR-08/ADR-11                                               | Defer      | OP Brain recommended this first as the smallest docs-only step. Supervisor rejects that ordering for now because ADR-08 should capture the final cleaned caller posture after `T-405`; doing it first risks documenting known residual caller migration debt.          |
| 3    | M5 live cutover tasks `T-501` through `T-507`                              | Reject now | M5 touches routing, legacy status removal, tenant/entity migration, billing/entity-of-record, and residence-change flows. Those are broader protected surfaces and should follow a separate post-M4 readiness gate.                                                    |
| 4    | Operational Brain runtime, provider/model calls, prompts, outbox AI events | Reject now | The current need is deterministic caller posture cleanup. Runtime AI behavior, prompts, provider calls, AI event emission, and Operational Brain product integration need later explicit gates after the privacy/context boundary is cleaned.                          |
| 5    | VONESA/WS-F, OMG, DOM, broad M3/M4/M5, proxy/routing/auth, billing         | Reject now | These are downstream or protected programs that either ride the architecture spine behind feature flags or depend on M3/M5 readiness. They are not the smallest current authority action after `T-403b`.                                                               |

## Promoted Slice

The next active governed implementation goal is exactly one canonical tracker
slice: `T-405`.

`T-405` goal: clean the remaining `domain-ai` caller posture after the minimal
`T-404` compile-required updates so every current caller uses explicit trusted,
brand-minted `AICallContext` posture through approved `domain-privacy` minting
or resolving paths, with no implicit defaults or caller-fabricated context.

Future implementation scope:

- Audit all current `domain-ai` call sites and posture helpers for residual
  structural, default, nullable, or ambient context assumptions.
- Route every remaining call site through explicit trusted context minting or
  existing trusted consent-backed resolution, preserving the `T-403b` brand and
  runtime trust boundary.
- Remove or tighten obsolete compatibility helpers, fixtures, or eval scaffolds
  that permit implicit/default posture after `T-404`.
- Add focused negative proof that context cannot be synthesized from tenant,
  host, session, upload custody, generic Terms/Privacy, provider defaults, or
  test-only structural objects.
- Keep updates limited to current caller posture cleanup and proof; do not add
  new AI runtime behavior.

Likely implementation surfaces:

- `packages/domain-ai/src/**` caller and test/eval proof surfaces.
- `packages/domain-privacy/src/**` trusted context resolver or proof surfaces
  only where required to preserve `T-403b` minting semantics.
- Current app/domain call sites that already invoke `domain-ai`, limited to
  explicit trusted context handoff.
- Focused tests, compile-fail fixtures, and eval fixtures needed to prove the
  cleanup.

## Acceptance Evidence For Future T-405

| Acceptance criterion                | Required proof                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All callers use trusted context     | Code search and tests show every current `domain-ai` call site passes a trusted brand-minted context or a trusted resolver result, not a structural object or default.                                                  |
| No implicit/default posture remains | Negative tests or compile-fail proof reject nullable, omitted, default, ambient, provider-default, tenant-only, host-only, session-only, upload-custody, or generic Terms/Privacy paths.                                |
| T-403b trust boundary is preserved  | Focused proof shows caller cleanup does not export the brand, bypass runtime trust validation, or mint context outside approved `domain-privacy` paths.                                                                 |
| Consent-backed extraction is intact | Queued claim document extraction continues to re-mint from the durable `T-404a` consent-backed evidence path.                                                                                                           |
| Cleanup stays bounded               | Diff contains no Operational Brain runtime, provider/model-call expansion, prompt changes, outbox AI event implementation, proxy/routing/auth, schema/RLS, billing, product UI, README, AGENTS, or broad M3/M4/M5 work. |

## Risk And Gate Plan For Future T-405

Expected class: ai-affected implementation.

Expected risk tier: Tier 3. The slice is mostly caller cleanup, but it touches
AI/privacy trust posture and must preserve consent and brand-minted context
semantics.

Expected future proof:

- Code search inventory of current `domain-ai` call sites before and after the
  cleanup.
- Focused tests for trusted context handoff at changed callers.
- Compile-fail or `@ts-expect-error` proof for structural/default caller
  posture after cleanup.
- Type-check for touched packages and focused app/domain callers.
- `pnpm ai:eval` if eval fixtures or AI evaluation surfaces are touched.
- `pnpm check:modularity-guard` if TS files are added or materially changed.
- `pnpm slice:verify`.
- Bounded senior review with AI/privacy/security focus, plus Gemini/blocked
  fallback disposition because this is Tier 3 AI-affected work.
- Feedback intake and Copilot review on the PR head.
- Diff-scoped Codex Security scan when available; if startup hangs, record exact
  blocker and rely only on required security evidence.
- Final Phase C implementation gates: `pnpm pr:verify`,
  `pnpm security:guard`, and `pnpm e2e:gate`, unless a later supervisor
  explicitly narrows or waives with evidence.

## Non-Goals

- No implementation in this design-gate PR.
- No runtime source, tests, package metadata, lockfiles, schema, migration, or
  RLS changes in this gate PR.
- No Operational Brain runtime or product integration.
- No model/provider call expansion, prompts, autonomous AI decisioning, new AI
  queues, agentic tool use, embeddings, extraction, classification,
  summarization, retrieval, or outbox AI event implementation.
- No proxy, canonical route, auth/session, tenant-context, billing/provider,
  entity migration, residence-change, or product UI redesign.
- No M5 live cutover, VONESA/WS-F, OMG, DOM, README, AGENTS, broad
  architecture-doc rewrite, dependency, lockfile, runtime source, test, or
  implementation-worker changes in this gate.
- No ADR consolidation; `T-406` remains deferred until after `T-405`.

## Reviewer, Security, And CI Disposition

Senior reviewer: skipped for this Tier 0 docs-only design gate; no
implementation diff exists.

Codex Security scan: not applicable for this docs-only gate. Required proof is
focused docs/tracker proof plus scope audit.

Current evidence disposition: PR `#1146` and PR `#1147` are merged at the
recorded SHAs. Post-closeout `main` at
`1c12d6879324a1a24190db3392ebdb103454255a` has required CI/security/Sonar
evidence green from closeout proof; CD remains an external deployment context
and is not used as readiness evidence for this Tier 0 gate.

## Exit State

Authority is reconciled after `T-403b`; `T-405` is the only promoted next
implementation slice. `T-406`, Operational Brain runtime, model/provider calls,
prompts, outbox AI events, broad M3/M4/M5, proxy/routing/auth, schema/RLS,
billing, product UI, entity migration, README, AGENTS, broad architecture-doc
work, VONESA/WS-F, OMG, and DOM remain deferred unless separately reauthorized.
