---
status: design-review
date: 2026-05-13
slice: P37-DG02
title: Post-AI01 Closeout And Next AI Slice Selection
owner: platform + product + security + qa
phase: Phase C
---

# P37-DG02 Post-AI01 Closeout And Next AI Slice Selection

## Decision

`P37-AI01 Policy Extract Strict Output Contract And Eval Gate` is complete through PR `#740`,
merge commit `a300d3c02fcce2983ce65d58143ee62d85005af9`.

The stale live-tracker state that still showed `P37-AI01` as in progress is closed by this
docs-only gate. This gate makes no runtime AI behavior, prompt, model-call, queue, schema,
persistence, proxy, route, auth, tenancy, Stripe, CRM, automation, campaign, cron/NPS, task
aggregate, or `member_leads` changes.

The next bounded implementation slice is:

`P37-AI02 Formal AI Eval CI And Release Gate`

## Inputs

| Input                            | Relevance                                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#740` / `P37-AI01`           | Merged the strict policy extraction output contract, removed the policy eval-only normalization shim, and added sparse/adversarial no-hallucination fixtures.                             |
| Remote merge evidence            | AI01 is on `main` through merge commit `a300d3c02fcce2983ce65d58143ee62d85005af9`; PR checks, Copilot threads, and Sonar issues were resolved before merge.                               |
| Current `pnpm ai:eval` posture   | `package.json` exposes `pnpm ai:eval`, and `scripts/ai/eval/**` runs deterministic fixture checks without network model calls or OpenAI API key dependency.                               |
| Current CI posture               | `.github/workflows/ci.yml` has no blocking `ai-eval` job, and `scripts/ci/workflow-contracts.test.mjs` currently asserts that the CI workflow has no `ai-eval` job.                       |
| Remaining AI-readiness candidate | Claim/legal contract tightening, AI run telemetry proof, and model/profile registry production alignment remain valid, but all benefit from formal eval gate enforcement before widening. |

## AI01 Closeout Evidence

PR `#740` merged the strict policy extraction contract work into `main` at
`a300d3c02fcce2983ce65d58143ee62d85005af9`.

Repository evidence at that merge shows:

- `apps/web/src/lib/ai/policy-analyzer.ts` now parses analyzer output with
  `policyExtractSchema`.
- `apps/web/src/app/api/policies/analyze/_services.ts` validates policy extraction output before
  `document_extractions` and `ai_runs.outputJson` persistence.
- `scripts/ai/eval/run.mjs` validates policy output directly against `policyExtractSchema`; the
  previous policy-only eval normalization shim is gone.
- `scripts/ai/eval/policy-extract.dataset.json` includes sparse/adversarial fixtures, and
  `scripts/ai/eval/README.md` records that unsupported facts must stay null with warnings instead
  of being fabricated.

## Remaining Candidate Ranking

| Rank | Candidate                                                           | Repo evidence                                                                                                                                                                                                                                                                                                                                                                                               | Decision                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Make `pnpm ai:eval` a formal CI/release gate.                       | `package.json` exposes `pnpm ai:eval`, `scripts/ai/eval/**` is deterministic and fixture-only, and PR `#740` proved it as blocking local evidence. However `.github/workflows/ci.yml` has no `ai-eval` job, `scripts/ci/workflow-contracts.test.mjs` currently asserts that no CI `ai-eval` job exists, and `scripts/ai/eval/README.md` still says the suite is manual/local and not automatic on every PR. | Promote now. This is the smallest next risk reducer after AI01 because the strict output contract is only durable if CI/release surfaces enforce the eval suite for AI changes. |
| 2    | Tighten claim-summary or legal-document extraction contracts/evals. | `packages/domain-ai/src/claims/summary.ts`, `packages/domain-ai/src/legal/extract.ts`, and their datasets already participate in `pnpm ai:eval`, while DG01 recorded policy extraction as the mismatch that AI01 closed first.                                                                                                                                                                              | Defer until the eval gate is formalized; otherwise new contract tightening still relies on manual proof.                                                                        |
| 3    | Add AI run observability/telemetry proof.                           | `packages/domain-ai/src/telemetry.ts` exists and normalizes tenant-safe AI telemetry, but DG01 recorded that production workflow persistence does not yet emit a unified telemetry event stream.                                                                                                                                                                                                            | Defer one slice. It is important, but it should build on a CI/release gate that keeps eval evidence mandatory for AI workflow changes.                                          |
| 4    | Align model/profile registry usage with production workflows.       | `packages/domain-ai/src/models.ts` defines workflows, model profiles, prompt/schema versions, cache keys, reasoning, verbosity, and output-token limits, but DG01 recorded that live workflows do not call Responses API through the registry.                                                                                                                                                              | Defer. This is broader and closer to runtime model-call behavior than the immediate post-AI01 release-proof gap.                                                                |

## Promoted Slice

`P37-AI02 Formal AI Eval CI And Release Gate`

Implementation scope:

- Add a required CI path that runs `pnpm ai:eval` when AI-surface files change and on mainline push
  or release validation where the repo's release-gate conventions require full proof.
- Preserve deterministic fixture execution with no network model calls, no OpenAI API key
  dependency, and no runtime AI behavior changes.
- Update workflow/contract tests so CI cannot silently drop, skip, or downgrade the AI eval gate.
- Keep the changed-file classifier tight to existing AI surfaces unless implementation evidence
  shows a missing current AI path.
- Record proof in `docs/plans/current-program.md` and `docs/plans/current-tracker.md` only after
  implementation lands.

Allowed touch points for `P37-AI02`:

- `.github/workflows/**` for CI/release-gate wiring directly tied to `pnpm ai:eval`.
- `scripts/ci/**` for changed-file classification and workflow contract tests.
- `scripts/ai/eval/**` only if needed for gate-compatible output or failure reporting.
- `package.json` only if a narrow command alias is required for gate clarity.
- `docs/plans/**` for implementation proof and closeout state.

Must not touch in `P37-AI02`:

- `apps/web/src/proxy.ts`.
- Canonical routes `/member`, `/agent`, `/staff`, or `/admin`.
- Auth provider layering, session shape, or tenancy architecture.
- Runtime AI behavior, new model calls, prompt rewrites, RAG, assistants, agentic workflows, or
  automation.
- Policy, claim-summary, claim-intake, or legal-document extraction runtime contracts except as
  needed to keep existing evals passing.
- Stripe.
- README, AGENTS, or broad architecture docs.
- CRM continuation, task aggregate work, campaigns, cron/NPS architecture, `member_leads`
  unification, dashboard analytics expansion, or broad DB posture burn-down.

## Acceptance Criteria For P37-AI02

- `pnpm ai:eval` is required by CI/release proof for AI-surface changes and mainline/release
  validation according to the repo's existing workflow conventions.
- Workflow contract tests fail if the AI eval gate is removed, made non-blocking, or detached from
  current AI-surface paths.
- The eval runner remains deterministic and fixture-only, with no network model calls or secret
  requirement.
- Existing policy extraction, claim summary, and legal document evals still pass.
- No runtime AI behavior, prompt, model-call, proxy, route, auth, tenancy architecture, Stripe,
  README, AGENTS, broad architecture-doc, CRM, automation, campaign, cron/NPS, task aggregate, or
  `member_leads` changes are introduced.

## Verification Plan

- `pnpm ai:eval`.
- `pnpm test:ci:contracts`.
- Focused workflow/classifier tests if changed.
- `pnpm security:guard`.
- `pnpm verify-slice -- --static`.
- Required PR checks, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Non-Goals

- No new AI runtime behavior.
- No prompt, schema, model-provider, RAG, assistant, tool-calling, or agentic workflow work.
- No policy, claim-summary, claim-intake, or legal-document extraction behavior tightening beyond
  preserving existing eval pass/fail behavior.
- No product UI work.
- No proxy, route, auth, tenancy architecture, Stripe, README, AGENTS, or broad architecture-doc
  changes.
