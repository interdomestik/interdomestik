---
title: T04 Evidence, Privacy, And SLA Microcopy Evidence
date: 2026-03-11
status: completed
owner: web + design
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# T04 Evidence, Privacy, And SLA Microcopy Evidence

## Scope

Add category-specific evidence prompts, a visible privacy badge, and clear human-triage timing microcopy to the existing public Free Start intake surface without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Public intake trust copy and completion sidebar: `apps/web/src/app/[locale]/components/home/free-start-intake-shell.tsx`
- Component coverage: `apps/web/src/app/[locale]/components/home/free-start-intake-shell.test.tsx`
- Locale copy: `apps/web/src/messages/en/freeStart.json`, `apps/web/src/messages/sq/freeStart.json`, `apps/web/src/messages/mk/freeStart.json`, `apps/web/src/messages/sr/freeStart.json`

## Implementation Notes

- Kept `T04` inside the existing Free Start sidebar so the added trust microcopy stays on the live intake wizard and completion state instead of creating a parallel surface.
- Added category-specific evidence guidance for `vehicle`, `property`, and `injury`, with claim-type prompts that update as soon as the user selects a lane.
- Added a visible privacy badge that keeps the Free Start intake lightweight and clarifies that users can gather evidence first and share it later only when they want follow-up.
- Added triage timing microcopy that states the `24 business hours` member response window only for completed claim packs, while preserving the existing informational-only and hotline routing-only boundary.
- Preserved the `T03` confidence and recommended-next-step behavior by adding the new trust copy beneath the existing completion guidance instead of replacing it.

## Verification

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/free-start-intake-shell.test.tsx'`
- `pnpm i18n:check`
- `pnpm plan:audit`
- `pnpm plan:status`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

All commands passed locally. `pnpm e2e:gate` completed with `82 passed`.

## Result

`T04` exit criteria are satisfied: the Free Start wizard and completion flow now show category-specific evidence guidance, a visible privacy notice, and clear triage timing copy on the existing trust surface.
