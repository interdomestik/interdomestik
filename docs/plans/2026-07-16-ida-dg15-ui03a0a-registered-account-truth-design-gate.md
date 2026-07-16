---
title: IDA-DG15 UI03a0a Registered Account Truth Design Gate
date: 2026-07-16
status: promoted_waiting_implementation_authority
authority: current_authority
runtime_authorized: false
promoted_slice: IDA-UI03a0a
risk_tier: 3
owner: platform + product + legal + privacy + accessibility + qa
---

# IDA-DG15 — UI03a0a Registered Account Truth Design Gate

## Promotion decision

Promote exactly one prospective Tier 3 implementation slice:
`IDA-UI03a0a — Registered-account truth and content-free member observability`.

Arben approved the exact IDA-DG15 v3.2 gate SHA-256
`77b0e80aff262c2eebe35283fa6551dcea45db72d8f7c7b30bc0fbe5acd2c092`
and separately authorized this canonical promotion after the final blocker
consolidation SHA-256
`548ffd23d9a02e9bcaec96e6ee91d1e5ba4fc84cedddf284b149b189b0665afd`.

This promotion does not authorize implementation. Runtime work may start only
after the worktree-scoped resolver returns `IDA-UI03a0a` alone and Arben
separately confirms implementation authority. It authorizes no rollout or
deployment.

`IDA-UI03a0b`, `IDA-UI03a1`, `IDA-UI03a2`, `IDA-UI03b`, and the working
Paddle-correlation candidate `IDA-UI03a0c` remain unapproved.

## One visible outcome and primary surface

A signed-in person who has a verified account but no canonical access-active
subscription sees an honest registered-account/not-yet-confirmed state, not
active membership. The existing localized membership-success/account-state
surface is the sole primary customer surface.

The canonical tenant-scoped access-active subscription lifecycle remains the
only authority for paid membership, benefits and claim access. Internal role,
member number, OTP, host, locale, query string, success route, callback and
pending tenant classification grant no payment, membership, benefit, claim,
case, legal-entity or tenant-action authority.

## Exact neutral-state semantic contract

### SQ

- Title: `Llogaria juaj është gati`
- Status: `Anëtarësimi ende nuk është konfirmuar`
- Body: `Nuk mund ta konfirmojmë ende një anëtarësi aktive nga kjo faqe. Nëse sapo e përfunduat pagesën, kontrollojeni statusin përsëri pas pak. Përfitimet dhe qasja për hapjen e një rasti bëhen të disponueshme vetëm pasi anëtarësimi të konfirmohet aktiv.`
- Primary CTA: `Kontrollo statusin e anëtarësimit`
- Secondary CTA: `Hap llogarinë time`
- Helper: `Kontrollimi i statusit vetëm rifreskon gjendjen. Nuk hap pagesën dhe nuk ju tarifon.`

### EN

- Title: `Your account is ready`
- Status: `Membership not yet confirmed`
- Body: `We can't yet confirm an active membership from this page. If you just completed payment, check the status again shortly. Benefits and claim access become available only after membership is confirmed active.`
- Primary CTA: `Check membership status`
- Secondary CTA: `Open my account`
- Helper: `Checking the status only refreshes the current status. It does not open the payment page or charge you.`

### SR

- Title: `Vaš nalog je spreman`
- Status: `Članstvo još nije potvrđeno`
- Body: `Još ne možemo da potvrdimo aktivno članstvo sa ove stranice. Ako ste upravo završili plaćanje, proverite status ponovo uskoro. Pogodnosti i pristup prijavi zahteva postaju dostupni tek kada članstvo bude potvrđeno kao aktivno.`
- Primary CTA: `Proveri status članstva`
- Secondary CTA: `Otvori moj nalog`
- Helper: `Provera statusa samo osvežava trenutno stanje. Ne otvara postupak plaćanja i ne naplaćuje vam ništa.`

### MK

- Title: `Вашата сметка е подготвена`
- Status: `Членството сè уште не е потврдено`
- Body: `Сè уште не можеме да потврдиме активно членство од оваа страница. Ако штотуку го завршивте плаќањето, проверете го статусот повторно по кратко време. Поволностите и пристапот за поднесување барање стануваат достапни само откако членството ќе биде потврдено како активно.`
- Primary CTA: `Провери го статусот на членството`
- Secondary CTA: `Отвори ја мојата сметка`
- Helper: `Проверката на статусот само ја освежува тековната состојба. Не отвора процес за плаќање и не ви наплаќа.`

The null-subscription state says neither that payment was received nor that it
failed or was cancelled. Direct navigation and webhook-delayed return receive
the same neutral state because UI03a0a has no trusted transaction correlation.
Transaction-specific recovery remains a separate Paddle/billing gate.

## Behavior and sink contract

- Registered-only customer UI shows zero member number, membership card, wallet,
  benefits, claim, case or contracting-company implication.
- Access-active subscribers retain the current entitled state and stored
  subscription legal-entity disclosure.
- Status recheck reruns only the canonical subscription lookup. It opens no
  checkout, creates no charge, uses no polling and grants no entitlement.
- Activation and membership-start analytics run only for canonical
  access-active state.
- Member-number Sentry/console events contain only an allowlisted event type,
  outcome and non-identifying operational fields. They contain no member number,
  user id, email, tenant id or raw error text.
- URLs, query values and email contain no member number or usable provider
  capability. Test-only `priceId` behavior remains runtime-guarded and
  non-authoritative.
- Existing member-number issuance and login self-heal behavior remain unchanged.
  The number stays internal and is not membership proof before activation.
- Existing protected support/admin code and queries remain unchanged. Current
  non-membership admin profiles continue to use the account-id label.

## Exact production/i18n envelope

The hard ceiling is 13 named production/i18n files:

1. `apps/web/src/app/[locale]/(app)/member/membership/success/_core.entry.tsx`
2. `apps/web/src/app/[locale]/(app)/member/membership/success/success-account-panel.tsx`
3. `apps/web/src/app/[locale]/(app)/member/membership/success/success-secondary-content.tsx`
4. `apps/web/src/app/[locale]/(app)/member/membership/success/success-status-actions.tsx`
5. `apps/web/src/components/analytics/funnel-trackers.tsx`
6. `apps/web/src/lib/auth/hooks.ts`
7. `apps/web/src/lib/auth/member-number-user-create-hook.ts`
8. `apps/web/src/lib/auth/member-number-session-hook.ts`
9. `apps/web/src/lib/auth/member-number-observability.ts`
10. `apps/web/src/messages/sq/membership.json`
11. `apps/web/src/messages/en/membership.json`
12. `apps/web/src/messages/sr/membership.json`
13. `apps/web/src/messages/mk/membership.json`

Protect existing behavior before extracting the touched paths. Reduce the
281-line success core and 174-line auth hook to at most 150 lines. Every new or
extracted file stays at or below 150 lines. A fourteenth production/i18n file,
role/auth/checkout/Paddle behavior change, or more than six engineering days
stops the slice and returns to Arben.

## Test-first acceptance

The ceiling is exactly 22 authored focused cases:

- six registered-state cases: direct null state, forged query/test-only price
  non-authority, stale session, simulated webhook delay, manual lookup-only
  recheck/convergence, and no-session redirect;
- three access-active cases: entitled regression despite query values,
  classification-pending active note/stored legal snapshot, and guarded mock
  activation enabled/disabled behavior;
- three accessibility/localization cases: 44px actions/focus order, helper
  association plus polite feedback without focus movement, and exact SQ/EN/SR/MK
  parity;
- three Funnel tracker cases: landing regression, enabled active events, and
  disabled neutral zero events;
- three member-number observability cases: content-free info, content-free
  failure, and forbidden identifier/raw-error absence;
- two auth-hook cases preserving post-create assignment and session self-heal;
- two browser cases covering neutral and access-active/recheck behavior
  proportionately across Chromium, Firefox and WebKit, SQ/EN/SR/MK, mobile,
  200% zoom, text spacing, keyboard/screen-reader names, forced colors and
  reduced motion.

The existing 304-line success test must be split rather than enlarged. Required
Phase C gates and existing repository tests still run; UI03a0a authors no
twenty-third focused case.

## Governance and review evidence

- UI/UX governance receipt SHA-256
  `1ca9a234191fd74265b706179dda6b59901ae338a2ec248d150d0b8499f3bd08`
  passed the advisory checker with ADAC and Aviva, two honestly blocked
  authenticated sources, and zero conditions.
- Sanja Jovanovska legal, Aliki Gjorcevska independent DPO and Arben Lila
  technical approval remain covered because Option A and v3.2 add no data,
  lawful-basis, retention, DSR, access, provider, auth/session or operational
  decision.
- Gazmend Abazi's signed controller/operations decision is unconditional and
  covers account truth, internal-number treatment, owners and rollout hold.
- Atlas Option A receipt SHA-256
  `886a021bef028ee5b588a25a8159a7bc8cf5d37d2fd7f5de1594e4df77d475c4`
  and Sentinel receipt SHA-256
  `224f9911310f8470274342ebac8ee41ec86a0ec60faf7a07fda01374753f1cc9`
  accepted the design with non-material implementation-proof conditions.
- The v3.2 copy-only reconciliation receipt SHA-256
  `41ca98d8da5f4b24e6abf9b97a8746eb52a22ddce6848c7faa631bc5a9789ed2`
  confirms no architecture/security term changed.

Implementation evidence must still prove the named negatives before PR
readiness. These design receipts do not replace tests, CI, Sonar, CodeQL,
security checks, Copilot or current-head review.

## Lifecycle, operations and rollout

UI03a0a creates no store, schema, migration, OTP/session change or provider
resource. It consumes the existing session and `getActiveSubscription` read
boundary unchanged. UI03a1 draft/upload/delete/restore and Supabase resource
readiness are unrelated and excluded.

Gazmend owns controller/business-operations disposition and any later rollout
decision. Arben owns technical implementation, evidence, incident execution and
automatic-CD cancellation. Existing `docs/INCIDENT_PLAYBOOK.md` and
`docs/RUNBOOK.md` govern incident and rollback handling. Rollback is a revert of
the single implementation PR.

Static helper text is visible and associated with the recheck control; it is not
a live region. Same-state or changed-state feedback uses a separate polite
status announcement, retains focus and remains usable at 200% zoom and expanded
text spacing. Support uses canonical subscription truth and never infers payment
or membership from the route/query.

## Explicit exclusions and stop rules

Excluded: `apps/web/src/proxy.ts`; canonical route changes; auth/session/OTP,
role or tenant changes; subscription lifecycle semantics; schema/RLS/migrations;
checkout, Paddle, webhooks, plans, prices, charges, refunds or transaction
correlation; protected staff/admin changes; Free Start persistence; drafts;
uploads/evidence; case creation/handoff; injury persistence; later IDA stages;
README, AGENTS and architecture docs; provider mutation; rollout; deployment;
production aliases; and unrelated refactoring.

Stop immediately on a protected-surface need, a material reviewer finding,
failure to preserve access-active truth, inability to remove identifier-bearing
sinks inside the named envelope, or breach of the 13-file/22-test/6-day ceiling.

## Authority and resolver

Fresh AI OS observation
`0b9a7f0caa10914b3722fd191a74dd1b250e9927687e5fe6c0c8eef2269e89d2`
reported Interdomestik authority current, Brain current, `activeSlice=none` and
runtime not authorized before promotion. Unrelated integrity drift remains
advisory. Main/origin and the child were clean and synced at
`c5170ac27360d69f12923802c520871fab35df74`.

After this promotion merges, the worktree-scoped resolver must return
`IDA-UI03a0a` alone. Runtime remains held until Arben separately confirms
implementation authority. No deployment is authorized.
