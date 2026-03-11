---
title: T02 Free Start Claim-Pack Generator Evidence
date: 2026-03-11
status: completed
owner: web + design
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# T02 Free Start Claim-Pack Generator Evidence

## Scope

Ship the public Free Start claim-pack generator shell on the live claim-first landing surface so users can choose `vehicle`, `property`, or `injury` and complete a self-serve intake path without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Implemented Surfaces

- Landing runtime wiring: `apps/web/src/app/[locale]/components/home/home-page-runtime.tsx`
- Public intake shell: `apps/web/src/app/[locale]/components/home/free-start-intake-shell.tsx`
- Component coverage: `apps/web/src/app/[locale]/components/home/home-page-runtime.test.tsx`, `apps/web/src/app/[locale]/components/home/free-start-intake-shell.test.tsx`
- Locale copy: `apps/web/src/messages/en/freeStart.json`, `apps/web/src/messages/sq/freeStart.json`, `apps/web/src/messages/mk/freeStart.json`, `apps/web/src/messages/sr/freeStart.json`

## Implementation Notes

- Kept `T02` on the existing home trust surface by rendering the new intake shell directly under the live UI v2 hero instead of adding or changing any routes.
- Changed the signed-out hero CTA to jump to the in-page Free Start section while preserving the existing member claim route for signed-in users.
- Added a three-step public intake shell with launch-scope category choice, guided intake questions, and a generated pack-shell preview plus completion state.
- Reused the existing commercial analytics boundary by emitting `free_start_completed` when the public intake flow finishes, without inventing a parallel event model.
- Kept confidence scoring, evidence prompts, privacy microcopy, and deeper next-step guidance out of scope so `T03` and `T04` remain narrow, inspectable follow-on slices.

## Verification

Targeted tests:

```bash
pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/home-page-runtime.test.tsx' 'src/app/[locale]/components/home/free-start-intake-shell.test.tsx'
```

Required checks:

```bash
pnpm plan:audit
pnpm plan:status
pnpm i18n:check
pnpm security:guard
pnpm pr:verify
pnpm e2e:gate
```

## Result

`T02` exit criteria are satisfied: the live public claim-first surface now lets a user choose `vehicle`, `property`, or `injury`, answer the guided intake, preview the generated Free Start pack shell, and finish the self-serve path before any escalation flow.
