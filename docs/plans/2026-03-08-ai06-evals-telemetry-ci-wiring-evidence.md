---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-08
---

# AI06 Evals, Telemetry, And CI Wiring Evidence

> Status: Active supporting input. This document records the code and verification evidence for `AI06` evals, telemetry, and CI wiring work.

## Scope

`AI06` required three outcomes:

- add deterministic local eval fixtures for the implemented AI workflows
- add reusable telemetry helpers for AI rollout metrics
- wire a PR-only non-blocking CI lane that runs the fixture suite when AI files change

## Code Evidence

- root AI eval entrypoint in [package.json](../../package.json)
- deterministic fixture datasets, runner, and usage notes in [run.mjs](../../scripts/ai/eval/run.mjs), [README.md](../../scripts/ai/eval/README.md), [policy-extract.dataset.json](../../scripts/ai/eval/policy-extract.dataset.json), [claim-summary.dataset.json](../../scripts/ai/eval/claim-summary.dataset.json), and [legal-extract.dataset.json](../../scripts/ai/eval/legal-extract.dataset.json)
- typed telemetry helpers and exports in [telemetry.ts](../../packages/domain-ai/src/telemetry.ts), [telemetry.test.ts](../../packages/domain-ai/src/telemetry.test.ts), [index.ts](../../packages/domain-ai/src/index.ts), and [package.json](../../packages/domain-ai/package.json)
- AI-surface CI detection and workflow contract coverage in [ai-eval-surface-lib.mjs](../../scripts/ci/ai-eval-surface-lib.mjs), [ai-eval-surface.mjs](../../scripts/ci/ai-eval-surface.mjs), [ai-eval-surface.test.mjs](../../scripts/ci/ai-eval-surface.test.mjs), [workflow-contracts.test.mjs](../../scripts/ci/workflow-contracts.test.mjs), and [ci.yml](../../.github/workflows/ci.yml)
- policy parser hardening exposed by the fixture suite in [policy-analyzer.ts](../../apps/web/src/lib/ai/policy-analyzer.ts) and [policy-analyzer.test.ts](../../apps/web/src/lib/ai/policy-analyzer.test.ts)

## Focused Verification Evidence

The following focused checks passed on 2026-03-08:

- `pnpm ai:eval`
- `pnpm --filter @interdomestik/domain-ai test:unit --run src/telemetry.test.ts`
- `pnpm --filter @interdomestik/domain-ai type-check`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/ai/policy-analyzer.test.ts`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm test:ci:contracts`
- `pnpm plan:status`
- `pnpm plan:audit`

## Required Gate Evidence

The required repository gates also passed on 2026-03-08:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Conclusion

`AI06` is complete for code and verification evidence.

The repository now has deterministic fixture-based AI evaluations, reusable rollout telemetry helpers, and a non-blocking PR CI signal for AI-specific changes.
