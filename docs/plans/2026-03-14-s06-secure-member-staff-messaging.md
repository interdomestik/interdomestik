---
title: S06 Secure Member-Staff Messaging
date: 2026-03-14
status: implemented
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S06 Secure Member-Staff Messaging

## Scope

Promote `S06` as the next documented `P4` slice after the intentional `S07`-before-`S06` exception, and make secure claim messaging visible on the canonical member and staff claim-detail surfaces without reopening routing, auth, tenancy, internal-note isolation, or read-receipt polish work.

## Changes

- Added the canonical `MessagingPanel` to the routed member claim detail page by wiring the authenticated member identity into `MemberClaimDetailOpsPage`. Members can read and send public claim messages, but they do not receive internal-note controls.
- Added the same canonical messaging surface to the routed staff claim detail page for staff users only, preserving the existing branch-manager read-only boundary on that route and keeping staff internal-note capability on the live claim-detail surface.
- Aligned the staff V2 claim detail component with the same `MessagingPanel` so there is no separate staff-only claim messenger behavior path to maintain for this slice.
- Kept the existing domain visibility and send actions intact, including the `S05` internal-note isolation guard. Read receipts remain optional; no schema changes or read-receipt UI expansion were added.
- Updated messaging copy so the shared empty state and internal-note label remain correct on both member and staff surfaces.

## Verification

- `pnpm --filter @interdomestik/domain-communications exec vitest run src/messages/get.test.ts`
- `pnpm --filter @interdomestik/web exec vitest run 'src/app/[locale]/(app)/member/claims/[id]/page.test.tsx' 'src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx' 'src/app/[locale]/(staff)/staff/claims/[id]/page.test.tsx' 'src/components/messaging/message-thread.test.tsx'`
- `pnpm --filter @interdomestik/web exec vitest run 'src/features/claims/tracking/server/getMemberClaimDetail.test.ts' 'src/components/messaging/messaging-panel.test.tsx' 'src/components/messaging/message-input.test.tsx'`
- `pnpm plan:audit`
- `pnpm security:guard`
- `pnpm pr:verify`

## Result

`S06` is now implemented as the next promoted `P4` slice after `S07`. The canonical member claim detail surface now exposes secure public messaging, the canonical staff claim detail surface now exposes the same messaging path with staff-only internal notes, and the repo keeps the earlier `S05` internal-note isolation boundary without widening into a read-receipt project.
