---
title: IDA-DG17 Material Addendum — Tenant Pricing To Neutral IDA OTP Entry
date: 2026-07-17
status: proposed
authority: addendum_preparation_only
runtime_authorized: false
slice: IDA-UI03a0b2
parent_design_sha256: ed9654ec78f1a2c246742bdb151a9dbf6d18d86a219049e346271918e8364f5c
implementation_pr: 1372
implementation_head: 5016aeb889f12efdd45d8a406e2bb06cd89da573
---

# IDA-DG17 material addendum — tenant pricing to neutral IDA OTP entry

## Decision and authority boundary

Arben directly answered `po` to the exact question: `A e miraton që child-i të
përgatisë addendum-in për tenant pricing CTA → porta IDA, pa ndryshuar ende
kodin?` The timestamped decision receipt is
`20260717T131526Z-ida-dg17-arben-tenant-to-ida-addendum-decision.json`, SHA-256
`4c3e3757f5ee69cd9215e125c7592f31f7c13c6b92871bb4b776d5df2797b48f`.
The question originated in orchestrator thread
`019f6586-34cc-7311-900c-9989770f4d29`, turn
`019f7029-e887-7d21-a6a4-52667daceeed`; the response is not broadened beyond
preparing this addendum.

This proposed addendum closes the current-head Codex P1 at
`https://github.com/interdomestik/interdomestik/pull/1372#discussion_r3603289638`:
tenant pricing is reachable, the browser Better Auth client posts to
`window.location.origin`, and the accepted protected neutral OTP boundary
correctly accepts only exact IDA origins. The P1 remains unresolved and PR
`#1372` remains stopped until this addendum is accepted, canonically promoted,
separately runtime-authorized, implemented test-first and re-reviewed.

## Exact amended behavior

1. Tenant-host pricing remains visible. Its anonymous self-serve precheckout
   continuation performs one user-initiated top-level document navigation to the
   trusted canonical neutral IDA pricing origin before the OTP surface opens.
2. The trusted destination is built only from the repository-declared canonical
   IDA origin or strict server configuration (`IDA_HOST`, with the existing local
   app origin used only to derive a loopback `ida.localhost` development target).
   Locale is allowlisted and the path is fixed to `/{locale}/pricing`. Source
   `Host`, `x-forwarded-host`, `Origin`, `Referer`, source query strings and
   arbitrary destination inputs are never used.
3. The constructed destination query contains exactly one canonical public plan
   slug: `standard` or `family`. It contains no `tenantId`,
   `default_booking_tenant_id`, entity, `priceId`, email, user/session value,
   classification hint, source country/host, UTM, `next`, `returnTo`, callback or
   other source parameter. `business` remains the assisted path.
4. At the IDA server entry, neutral auto-entry is accepted only when the query
   key set is exactly `{plan}` and the value is exactly one canonical self-serve
   slug. Missing, duplicate/array, unknown, non-canonical, whitespace, overlong,
   encoded-delimiter or extra-key input becomes ordinary unselected pricing. It
   never auto-sends OTP, opens Paddle, mutates session/account state or selects a
   tenant.
5. The plan slug is presentation-only and unsigned because it confers no
   authority. The destination re-resolves plan and price from existing trusted
   plan/checkout configuration after authoritative fresh-session proof. The URL
   value cannot supply or change tenant, classification, billing entity, price,
   custom data, entitlement, identity or continuation.
6. After the server has accepted the presentation reference, the client removes
   `plan` from browser history before pricing-page analytics and before further
   same-origin navigation. Analytics and content-free logs receive no raw URL or
   plan query. Existing `strict-origin-when-cross-origin` remains unchanged, so
   the cross-origin document navigation discloses at most the source origin.
7. The cross-origin action is only the user-initiated top-level document
   navigation. No fetch/XHR, OPTIONS preflight, iframe, beacon, `postMessage`,
   CORS credential, shared-cookie option, session bridge or cross-origin API/
   subresource call is introduced.
8. IDA retains its public/no-tenant context. Tenant cookies remain host-only and
   are not copied or widened with a `Domain` attribute. A country-host session is
   not imported; any existing authoritative IDA session wins. Later explicit
   tenant/entity classification remains deferred and unchanged.
9. The destination GET is idempotent: no OTP delivery, provider start, tenant
   cookie, Paddle call, checkout opening, account/session mutation or
   classification side effect occurs until the existing deliberate user action.
10. The existing SQ/EN/SR/MK copy, precheckout truth, 44 px actions, responsive
    layout, keyboard semantics, forced colors, reduced motion, 200% zoom and text
    spacing remain unchanged. Navigation stays in the same tab and locale; after
    arrival the existing OTP heading focus contract is preserved. Because the
    interaction changes, a new localhost visual checkpoint and direct Arben
    answer to `Si duket?` are required before implementation merge.

## Exact proposed implementation map

The six additional production files are fixed:

1. `apps/web/src/app/[locale]/(site)/pricing/neutral-pricing-entry.server.ts`
   (new, strict trusted-origin builder plus exact server plan parser);
2. `apps/web/src/app/[locale]/(site)/pricing/_core.entry.tsx` (server validation
   and bounded props only; no request headers/session read);
3. `apps/web/src/app/[locale]/(site)/pricing/pricing-page-runtime.tsx` (history
   cleanup before analytics and prop handoff);
4. `apps/web/src/components/pricing/pricing-table/types.ts` (private component
   props only; no package/shared-auth public API);
5. `apps/web/src/components/pricing/pricing-table/use-pricing-table-state.ts`
   (trusted top-level navigation plus IDA-only initial OTP surface activation);
6. `apps/web/src/components/pricing/pricing-table/index.tsx` (wire the exact
   continuation seam and shrink/extract enough to remain at most 150 lines).

The four additional test files are fixed:

1. `apps/web/src/app/[locale]/(site)/pricing/neutral-pricing-entry.server.test.ts`;
2. `apps/web/src/app/[locale]/(site)/pricing/_core.entry.test.tsx`;
3. `apps/web/src/app/[locale]/(site)/pricing/pricing-page-runtime.test.tsx`;
4. `apps/web/src/components/pricing/pricing-table.test.tsx`.

The existing `apps/web/e2e/pricing-otp-security.spec.ts` remains within the
already-counted test inventory and receives the single cross-host proof. The
already-authorized deterministic `scripts/repo-size-budget.json` is regenerated
only with the unchanged sync command after the final diff; it is not a new
production/test file.

No other file is permitted. In particular, the addendum does not authorize
`apps/web/src/proxy.ts`, `proxy-logic.ts`, `ida-live-login-cutover.ts`, the OTP
host allowlist or auth routes, shared-auth, schema/RLS/migrations, Supabase,
Paddle modules/authority, CORS/CSP/cookie policy, provider resources, rollout,
deployment or production aliases. `buildIdaLiveLoginRedirectUrl` must not be
reused because it copies the source query and adds a tenant default.

## Revised hard ceilings and STOP conditions

The cumulative PR ceiling becomes at most **20 production files**, at most **17
test/spec/support files**, exactly **32 authored focused cases**, one separately
authorized deterministic repo-size metadata file, and at most **5 engineering
days**. This is a cumulative re-estimate from the existing 14 / 13 / 26 / 4
caps, not a second independent allowance.

New/extracted files remain at most 150 lines. `pricing-table/index.tsx` is
currently exactly 150 lines and the parent gate made it read-only; this addendum
explicitly authorizes only the bounded continuation wiring above and requires it
to remain at most 150 lines by extracting/shrinking the approved path.
`_core.entry.tsx` is currently 148 lines and may not exceed 150. No future
150–160 policy applies to this slice.

STOP before production edits if the trusted target cannot be constructed without
source-host/query input; the server cannot reject duplicate/extra inputs; the
plan influences any authoritative field; query cleanup cannot precede analytics;
the flow needs proxy/auth/CORS/cookie/Paddle/provider/schema change; the new
cross-host proof fails; or any cumulative file/case/day ceiling is exceeded.

## Exactly six additional authored cases

- `C27` trusted IDA origin/locale/fixed-path construction accepts the exact
  canonical/configured/local matrix and rejects credentials, path/query/hash,
  protocol-relative/absolute user input, hostile host/XFH and invalid config;
- `C28` the server plan parser accepts exactly one `standard` or `family` and
  neutrally rejects missing, business, duplicate/array, unknown, case/space,
  encoded-delimiter, overlong and extra-key inputs;
- `C29` the pricing server shell passes only the trusted fixed URL and validated
  presentation reference while preserving register-entry behavior and reading
  no request headers/session;
- `C30` tenant precheckout continuation performs one top-level navigation whose
  query is only the canonical plan, with zero OTP/Paddle/fetch/preflight/beacon
  and no copied source/tenant/price/callback/UTM input;
- `C31` IDA arrival removes the query before analytics, opens only the existing
  focused OTP surface, preserves locale/focus/history and triggers no automatic
  OTP, Paddle, session mutation or tenant inference;
- `C32` Chromium/Firefox/WebKit E2E proves tenant → IDA document navigation,
  SQ/EN/SR/MK proportional continuity, origin-only referrer, cookie isolation,
  existing-session precedence, tamper neutrality and deliberate OTP action.

The existing `C01`–`C26` remain unchanged and occur once each. Cumulative exact
case count is 32.

## Benchmark and review evidence

Contemporaneous review used principles only and copied no operator wording or
trade dress:

- Next.js App Router documentation warns against untrusted/unsanitized router
  URLs; Next documentation recommends browser location for external-origin
  navigation. The proposed destination is server-pinned, not user-provided.
- OWASP's unvalidated-redirect guidance recommends a fixed/allowlisted target and
  mapping a short identifier server-side instead of accepting a destination URL.
  The only identifier here is the non-authoritative two-value plan slug.
- MDN documents `strict-origin-when-cross-origin` as sending only the origin on a
  same-security cross-origin navigation while same-origin referrers may retain
  path/query. This supports retaining the existing header plus immediate accepted
  query cleanup.

Sources accessed 2026-07-17:

- `https://nextjs.org/docs/app/api-reference/functions/use-router`
- `https://nextjs.org/docs/pages/api-reference/functions/use-router`
- `https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html`
- `https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Referrer_policy`

Security/privacy independent review: `CONDITIONALLY_ACCEPTABLE`, with every
condition incorporated above. It additionally confirms the current host-only
tenant cookie and `strict-origin-when-cross-origin` baseline, and requires the
scope, tamper, cookie, network, history and analytics proof above.

Product/accessibility review: `RATIFY_WITH_CONDITIONS`. It preserves the current
precheckout truth and same-tab action, requires locale continuity and existing
OTP heading focus after the document navigation, forbids new copy/page redesign,
and requires a renewed visual checkpoint because the interaction changed.

Primary architecture/scope disposition: `RATIFY_WITH_CONDITIONS`. The six-file
map is the smallest truthful seam found: server-pinned origin/parser, server page
handoff, runtime cleanup, private props, state/navigation and the existing
pricing-table wiring. It specifically avoids the tempting but forbidden reuse of
the tenant-bearing live-login redirect, keeps the static shell free of request
headers/session reads, and confines authoritative decisions to existing server
configuration. Its conditions are the cumulative 20/17/32/5 ceilings, the two
near-150-line STOPs, exact single-plan/key parsing, destination idempotence and
zero proxy/auth/CORS/cookie/Paddle expansion.

The separate architecture subreview route was bounded and then interrupted after
it failed to return a final disposition; its silence is `UNAVAILABLE_TIMEOUT`,
not PASS. Nested IDA-origin, pricing-navigation and test-seam explorations were
also interrupted at the same bound and are not represented as completed
reviews. The independent security/privacy review did return a complete
conditional verdict and supplied the open-redirect, cookie, referrer, history,
analytics and tamper conditions incorporated above.

## AI OS / Brain reconciliation

Fresh advisory observation
`c0c0143beeccc1ce31cfb0d673c976f8f78a391912f59b6bdb4481949e81d182`
at `2026-07-17T13:11:19.173Z` reports Interdomestik authority current but
`activeSlice=none`, runtime not authorized and Brain stale. The repository's
canonical DG17 promotion and resolver remain governing; the observation neither
removes nor grants product authority. Unrelated NurseConnect/David/vault drift is
advisory.

One addendum-specific Brain query recovered only current AGENTS/proxy read-only
constraints and missed the exact tenant-pricing/client-origin seam and the
current DG17/P1 state. Repository source and current-head review supplied the
decisive evidence. This continues the existing mid-task measurement; it does not
restart the session or support any time/token savings claim. `humanUseful`
remains `unknown/not_confirmed`.

## Required governance sequence

1. Complete independent review, freeze this exact draft and compute its SHA-256.
2. Obtain exact orchestrator/Arben acceptance of that hash and the revised
   ceilings; preparation authority alone is insufficient.
3. Obtain docs-only canonical-promotion authority for one new addendum document,
   `docs/plans/current-program.md`, `docs/plans/current-tracker.md`, and only the
   deterministic repo-size metadata file if the unchanged generator requires it.
4. Merge that docs-only promotion with `runtime_authorized:false`, sync the open
   implementation branch to canonical main without product edits, and prove the
   resolver still selects exactly `IDA-UI03a0b2`.
5. Obtain separate exact runtime authority for the six production/four new test
   files, cumulative 20/17/32/5 ceilings and protected exclusions above.
6. Author `C27`–`C32` RED before any addendum production edit; retain C01–C26.
7. Implement only the promoted seam, rerun frozen Better Auth and all focused/
   security/accessibility/browser/repository/current-head gates, close the P1
   with evidence, and run the renewed non-delegated visual checkpoint.
8. Merge only after zero actionable threads and current-head required checks.
   Cancel automatic CD before deploy; no rollout/deployment is authorized.

This addendum does not start another slice and does not authorize implementation,
merge, rollout or deployment by itself.
