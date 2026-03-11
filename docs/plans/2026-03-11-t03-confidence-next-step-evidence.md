---
title: T03 Confidence And Recommended Next Step Evidence
date: 2026-03-11
status: completed
owner: web + design
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# T03 Confidence And Recommended Next Step Evidence

## Scope

Add a deterministic confidence result and a clear next-step CTA to the completed public Free Start intake flow so users leave the self-serve path with a `High`, `Medium`, or `Low` confidence signal and a recommended follow-up, without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Public intake completion logic and UI: `apps/web/src/app/[locale]/components/home/free-start-intake-shell.tsx`
- Component coverage: `apps/web/src/app/[locale]/components/home/free-start-intake-shell.test.tsx`
- Locale copy: `apps/web/src/messages/en/freeStart.json`, `apps/web/src/messages/sq/freeStart.json`, `apps/web/src/messages/mk/freeStart.json`, `apps/web/src/messages/sr/freeStart.json`

## Implementation Notes

- Kept `T03` inside the existing public intake shell and completion state instead of adding any new routes or branching to a new flow.
- Added a deterministic confidence heuristic based on already-collected intake facts so the slice stays inspectable and does not introduce request-path AI or opaque scoring.
- Mapped `high` and `medium` outcomes to route-aware review CTAs and kept `low` outcomes on the existing hotline support surface when a phone channel is available.
- Added dedicated completion microcopy for eligibility confidence, recommended next step, and CTA variants in all four live locales.
- Extended component coverage to prove the completion state returns `High`, `Medium`, and `Low` outputs with the expected CTA behavior.

## Verification

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/free-start-intake-shell.test.tsx'`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/home-page-runtime.test.tsx' 'src/app/[locale]/components/home/free-start-intake-shell.test.tsx'`
- `pnpm i18n:check`
- `pnpm security:guard`
- `pnpm pr:verify`
- `pnpm e2e:gate`
- `pnpm plan:audit`
- `pnpm plan:status`

All commands passed locally. `pnpm e2e:gate` completed with `82 passed` and exit code `0`. `pnpm pr:verify` also passed after installing the worktree dependencies with `pnpm install --frozen-lockfile`; no product-code change was required for that rerun.

## Result

`T03` exit criteria are satisfied: a completed Free Start intake now returns `High`, `Medium`, or `Low` confidence together with a clear next-step CTA that matches the confidence outcome and live continuation surface.
