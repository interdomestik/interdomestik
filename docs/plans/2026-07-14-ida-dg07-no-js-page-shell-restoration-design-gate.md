---
plan_role: input
status: active
source_of_truth: false
owner: platform + product + design + qa
slice: IDA-SH01
risk_tier: 2
date: 2026-07-14
last_reviewed: 2026-07-14
---

# IDA-DG07 — No-JavaScript Page-Shell Restoration Design Gate

> Status: accepted current-authority/design gate. Arben explicitly froze
> `IDA-UI01b` and authorized the sole promotion of `IDA-SH01` on 2026-07-14.

## Decision and authority

Arben explicitly instructed:

> Ndal përkohësisht IDA-UI01b dhe promovo një gate të veçantë, shumë të ngushtë,
> për rikthimin real pa JavaScript të page-shell-it.

This gate freezes `IDA-UI01b` without discarding its implementation and promotes
exactly one corrective Tier 2 slice: `IDA-SH01`. No second implementation slice is
active. `IDA-UI01b` may resume only after `IDA-SH01` is merged and closed through a
fresh current-authority decision.

AI OS was refreshed and checked at this scope-change milestone. It observed clean
canonical `main` and therefore reported no active slice/runtime authorization. That
advisory view cannot see the branch-local `IDA-DG06` authority or preserved
implementation. Repository program/tracker authority on this branch outranks AI OS.

## Observed defect

The required `IDA-UI01b` browser proof exposed a pre-existing shell defect in both
development and optimized production output:

- with JavaScript enabled, the public locale page renders normally;
- with `javaScriptEnabled: false`, the viewport is blank;
- the home page and ordinary Free Start category fallback are present in the SSR DOM;
- their nearest page-wide React streaming segment is emitted as a hidden `S:0`
  container and is revealed by an inline script;
- without JavaScript, that reveal script cannot run.

The source cause is the locale root entry
`apps/web/src/app/[locale]/_core.entry.tsx`: one `<Suspense>` boundary without a
visible fallback wraps the complete provider and page subtree. The boundary was
introduced with the provider stack and is not part of the `IDA-UI01b` changes.
`apps/web/src/app/[locale]/page.tsx`, the locale layout export, the shared providers,
and `apps/web/src/proxy.ts` are unchanged by the frozen slice.

## Goal

Make the server-rendered locale page visible and usable when JavaScript is disabled,
while preserving the existing JavaScript-enabled provider stack, routes, auth,
tenancy, analytics consent, localization, clarity markers, and public presentation.

Done means a real JavaScript-disabled browser can load a direct public locale URL,
see the page, follow the neutral `#free-start-intake` anchor, and reach the ordinary
category fallback without depending on a client reveal script.

## Smallest implementation boundary

The preferred correction is to remove the page-wide fallback-less Suspense boundary
from `apps/web/src/app/[locale]/_core.entry.tsx`. Providers retain their order and
behavior. A leaf that genuinely requires suspense may keep or receive its own narrow
boundary; it must not hide `children`, the public page, or the canonical role page.
`ReferralTracker` already owns a focused local boundary around its `useSearchParams`
consumer.

Candidate changed files are limited to:

- `apps/web/src/app/[locale]/_core.entry.tsx`;
- one focused browser spec proving JavaScript-disabled locale-shell visibility;
- a focused source/unit regression guard only if browser/build proof alone cannot
  prevent recurrence;
- `scripts/repo-size-budget.json` only if the governed inventory check requires it.

No visual restyling, copy change, field change, new component system, or route is
part of this correction.

## Behavioral contract

### JavaScript disabled

- A direct anonymous visit to `/sq#free-start-intake` renders visible page content.
- The `main[data-testid="landing-page-ready"]` landmark is visible.
- The `#free-start-intake` target exists, is not inside a hidden page-wide streaming
  segment, and exposes the ordinary category choice.
- The same shell-level visibility holds for EN, SR, and MK; translated copy remains
  owned by the existing message files.
- No script execution is required to reveal the server-rendered page.

### JavaScript enabled

- Existing PostHog consent, next-intl, React Query, toaster, Axe, referral, PWA,
  analytics, and cookie-consent behavior remains unchanged.
- The approved help-first public page, `page-ready` and `landing-page-ready` markers,
  header, hero, Free Start anchor, and settled-member behavior remain unchanged.
- Canonical `/member`, `/agent`, `/staff`, and `/admin` routes and markers retain
  their current behavior.

### Progressive enhancement

JavaScript enhances the journey but does not own the first meaningful page reveal.
No duplicate `<noscript>` page, CSS override against React internals, parallel route,
or copied fallback UI is allowed. The server-rendered page remains the one source of
visible content.

## Accessibility, mobile, and localization evidence

This slice introduces no new presentation, but the restored fallback must still be
proved as a complete public channel:

- actual `javaScriptEnabled: false` browser runs at 320, 375, and 390 CSS pixels;
- one desktop proof at 1440 CSS pixels;
- SQ, EN, SR, and MK visibility with ordinary translated category state;
- visible landmark and anchor destination, no blank viewport, no hidden ancestor,
  and no horizontal overflow;
- keyboard/native-anchor behavior without synthetic focus or duplicated controls;
- 200% zoom smoke on the server-visible public page;
- no change to type size, contrast, touch targets, reduced motion, or focus styling.

The existing `IDA-UI01b` mobile, focus, selected-state, and translation evidence is
preserved but does not count as completion evidence for this corrective slice.

## Test-first plan

1. Add a focused browser test that fails on the current shell with JavaScript
   disabled because `landing-page-ready` and the ordinary category state are not
   visible.
2. Prove the failure on the optimized build, not only the development server.
3. Apply the smallest shell correction.
4. Re-run the JavaScript-disabled matrix and a JavaScript-enabled public smoke.
5. Build the web app to prove no unbounded `useSearchParams` or prerender regression.
6. Run `pnpm check:modularity-guard`, then the mandatory Phase C gates:
   `pnpm pr:verify`, `pnpm security:guard`, and `pnpm e2e:gate`.

The browser test must assert visible behavior, not merely that fallback text exists
in HTML or the DOM.

## Risk and failure analysis

- **Build/prerender regression:** removing an overly broad boundary may expose a leaf
  that still suspends. The safe response is to isolate that leaf, never to restore a
  page-wide blank fallback.
- **Provider regression:** provider order and implementations remain unchanged;
  JavaScript-enabled smokes and mandatory gates prove behavior.
- **Role-surface blast radius:** the locale shell is shared. Canonical role markers
  and E2E gates are mandatory even though no role UI is redesigned.
- **False no-JS proof:** SSR DOM presence alone is insufficient. Browser visibility
  and computed hidden-ancestor checks are required.
- **Framework-internal CSS hack:** rejected because React streaming IDs and reveal
  mechanics are not an application contract.
- **Duplicated noscript page:** rejected because it creates a parallel experience,
  translation drift, and inaccessible duplicate landmarks.

## Security, privacy, and operations

The slice adds no collection, storage, cookie, analytics event, server action,
request payload, log field, identity state, tenant state, database access, or billing
behavior. Existing consent and analytics providers remain unchanged. No special-
category or case data is introduced. Operational observability remains the current
build, clarity-marker, and E2E evidence; no new production telemetry is justified.

Rollback is one commit reverting the shell-boundary correction and its focused test.
If rollback restores the blank no-JavaScript page, `IDA-UI01b` remains frozen.

## Explicit exclusions

- `apps/web/src/proxy.ts`, middleware, redirects, route names, route creation, host
  resolution, or production aliases;
- auth/session, better-auth, Supabase, tenancy, access control, or canonical role
  behavior;
- database, schema, RLS, migration, server action, claim-pack, domain, billing, or
  Paddle changes;
- provider implementation, analytics semantics, consent semantics, cookies, PWA
  behavior, or referral behavior;
- public hero, Free Start selected-intent logic, copy/messages, German, flight,
  dashboards, below-fold redesign, shared tokens, or a second UI architecture;
- CI/gate infrastructure changes or weakening/removal of the failing no-JavaScript
  assertion.

## Stop conditions

Stop and return to current authority if the correction requires:

- any protected or excluded surface;
- a new route, middleware/proxy behavior, auth/tenancy change, or provider rewrite;
- more than the locale shell entry plus focused proof/inventory metadata;
- a duplicated fallback page or styling against Next/React internal IDs;
- weakening the visibility assertion instead of making the page visible;
- concurrent resumption of `IDA-UI01b` before `IDA-SH01` closeout.

## Reviewer disposition

The independent read-only scope review returned **BLOCKED** for `IDA-UI01b`: the
fallback was present but hidden, the shell/page source was unchanged by that slice,
and no safe fix existed inside `IDA-DG06`. It recommended this sequential narrow
page/shared-shell restoration before resuming `IDA-UI01b`.

Claude is intentionally not used at promotion time because its quota resets later;
the existing independent scope verdict is sufficient for the bounded gate. A senior
implementation review remains required after the correction and before final gates;
an available approved reviewer route may be used without waiting on one provider.

## Gate state

**Accepted and canonically promoted.** The matching program/tracker update freezes
`IDA-UI01b` and selects only `IDA-SH01`. Test-first runtime work begins only after the
worktree-scoped resolver confirms `IDA-SH01` as the sole active slice.
