---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-07
---

# V04 Boundary And Resilience Evidence

> Status: Active supporting input. This document records the code and verification evidence for `V04` backend guardrail and shared-resilience work.

## Scope

`V04` required three outcomes:

- remove local retry and email-circuit duplication from active member registration flow
- fix the current strict entrypoint DB-boundary violation in the agent route tree
- wire strict entrypoint checks into the regular static verification path

## Code Evidence

- agent layout DB lookup extracted into [\_layout.core.ts](<../../apps/web/src/app/[locale]/(agent)/agent/_layout.core.ts>)
- agent layout entrypoint now reuses the helper without direct DB imports in [layout.tsx](<../../apps/web/src/app/[locale]/(agent)/agent/layout.tsx>)
- agent shell entry also reuses the helper in [\_core.entry.tsx](<../../apps/web/src/app/[locale]/(agent)/agent/_core.entry.tsx>)
- member registration now uses shared resilience and the real email circuit breaker in [register-member.core.ts](../../apps/web/src/lib/actions/agent/register-member.core.ts)
- wrapper tests cover the shared-utility wiring in [register-member.wrapper.test.ts](../../apps/web/src/lib/actions/agent/register-member.wrapper.test.ts)
- strict entrypoint enforcement is part of the regular check path in [package.json](../../package.json)
- CI static checks now run strict entrypoint validation in [ci.yml](../../.github/workflows/ci.yml)

## Focused Verification Evidence

The following focused checks passed on 2026-03-07:

- `pnpm check:entrypoints:strict`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(agent)/agent/_core.test.ts' 'src/app/[locale]/(agent)/agent/_layout.core.test.ts' 'src/lib/actions/agent/register-member.wrapper.test.ts' 'src/test/production-readiness.test.ts'`
- `pnpm --filter @interdomestik/web type-check`

## Required Gate Evidence

The required release checks also passed on 2026-03-07:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Conclusion

`V04` is complete for code and verification evidence.

The immediate guardrails are now enforced in both local static checks and CI, and the active member registration flow no longer carries its own local retry and circuit-breaker copies.
