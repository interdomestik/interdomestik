# Frictionless Membership Funnel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a coherent new-user membership flow where pricing leads to OTP, real checkout, truthful activation, and immediate claim eligibility once activation is real.

**Architecture:** Keep pricing as the single acquisition entry, use Better Auth email OTP as the lightweight identity step, and make subscription activation the single source of truth for claim access. Preserve the existing deferred tenant-classification model: anonymous or neutral-host acquisition starts under the default public tenant, `tenantClassificationPending` remains true until later resolution, and member surfaces must clearly separate `checkout complete under default acquisition tenant` from `tenant-resolved, claim-eligible activation`. Remove simulated-success ambiguity by clearly separating checkout completion from actual subscription activation, and make every member CTA either resume payment or use an already-active plan.

**Tech Stack:** Next.js App Router, Better Auth, Paddle, Drizzle/Postgres, next-intl, Playwright, Vitest.

---

## Canonical Membership Truth

- Claim access is granted only when a tenant-scoped subscription record in Postgres is in an access-granting state.
- That truth must come from backend-written subscription state, not from checkout UI, redirect params, or optimistic success messaging.
- The product intentionally uses deferred tenant classification:
  - neutral-host or unresolved entry can start under the default public/acquisition tenant
  - the user is marked `tenantClassificationPending`
  - later admin/runtime resolution confirms or reassigns the final tenant
  - until that resolution is complete, UI copy must not imply final tenant-routed protection if that would be misleading
- Current repo constraint: tenant reassignment is blocked once tenant-bound records exist, and `subscriptions` are already treated as tenant-bound records in `packages/domain-users/src/admin/resolve-tenant-classification.ts`. That means “pay first under default tenant, then freely reassign later” is not currently supported by domain behavior.
- Based on the current repo and documented PR #414 behavior, `tenantClassificationPending` is not itself a backend claim-access gate today. It is a classification/runtime state that affects messaging and later tenant resolution. Do not silently change claim-access policy unless product explicitly decides to do so.
- The existing access-granting states in `packages/domain-membership-billing/src/subscription.ts` are:
  - `active`
  - `trialing`
  - `past_due` with a still-valid grace period
- If product policy changes, update the shared helper first and then align all app surfaces to that helper.
- The existing `hasActiveMembership` helper is the correct domain boundary; the implementation work is to ensure all surfaces derive their state from it or from equivalent DB-backed subscription reads.
- This work also depends on an explicit data-model assumption: the current system appears to model one subscription row per user, initially anchored to a default acquisition tenant and later resolved. Verify that this is the intended invariant before changing schema-level uniqueness.

## Preflight: OTP Compatibility With Existing Auth/Tenant Model

- The current `/register` flow explicitly passes `tenantId` and `tenantClassificationPending` into `authClient.signUp.email(...)`.
- The current OTP pricing flow calls `authClient.emailOtp.sendVerificationOtp(...)` and `authClient.signIn.emailOtp(...)` without passing those fields.
- The current auth route tenant guard only explicitly covers email/password sign-in, not the OTP endpoints.
- The public pricing surface currently has an additional boundary: the billing tenant used for checkout metadata comes from the pricing page runtime / server entry, not from `/register`-style request-time tenant resolution. Treat that as an intentional design boundary unless product explicitly asks to change it.
- Therefore, before treating OTP as a drop-in replacement for `/register`, verify that OTP-based user creation and sign-in preserve:
  - default acquisition tenant assignment
  - `tenantClassificationPending`
  - tenant-context guard behavior for existing users
- If that cannot be proven with narrow, bounded changes, do not proceed as if the OTP funnel is implementation-complete. Record the blocker explicitly instead of drifting into broad auth-layer work.
- Before implementation starts, explicitly decide whether this slice assumes:
  - default acquisition tenant is the final subscription tenant in practice, with later classification being mostly confirm-current/admin hygiene
  - or product truly requires post-payment tenant reassignment

If the latter is required, that is a separate domain change because the current reassignment flow rejects users who already have subscription records.

## Dependency Graph

- Task 0 is blocking.
- Task 1, Task 5, and Task 5.5 may start only after Task 0 resolves the OTP tenant/auth boundary.
- Task 2 and Task 3 may start only after Task 1 and Task 5.5 resolve canonical subscription truth and activation behavior.
- Task 4 is independent and may run at any time.
- Task 6 runs last, after all other relevant chunks are complete.

Execution order:

`Task 0 -> { Task 1, Task 5, Task 5.5 } -> { Task 2, Task 3 } -> Task 4 -> Task 6`

## Chunk 0: Prove OTP Does Not Break Tenant/Auth Semantics

### Task 0: Verify OTP user provisioning and tenant-context safety

**Files:**

- Inspect/Modify: `apps/web/src/components/pricing/pricing-table.tsx`
- Inspect/Modify: `apps/web/src/components/pricing/pricing-table.test.tsx`
- Inspect/Modify: `apps/web/src/app/[locale]/(site)/pricing/pricing-page-runtime.tsx`
- Inspect/Modify: `apps/web/src/app/[locale]/(site)/pricing/pricing-page-runtime.test.tsx`
- Inspect/Modify: `apps/web/src/app/api/auth/[...all]/route.ts`
- Inspect/Modify: `apps/web/src/app/api/auth/[...all]/route.test.ts`
- Inspect/Modify: `apps/web/src/components/auth/register-form.tsx`
- Inspect/Modify: auth hooks/schema only if a narrow compatibility fix is required

- [ ] **Step 1: Write a failing test for OTP-created or OTP-signed-in users preserving tenant semantics**

Add tests that prove an anonymous OTP path preserves the same default acquisition tenant behavior that `/register` currently provides, or clearly fails today.

This includes the public pricing runtime itself: it must pass the relevant tenant context into `PricingTable` instead of dropping it before checkout metadata is built.

This proof must be end-to-end enough to show that an OTP-created or OTP-signed-in user reaches member surfaces with a non-null session tenant. It is not sufficient to pass a billing tenant only in Paddle `customData`; `/member/membership` and `/member/claims/new` both call `ensureTenantId(session)` and will hard-fail if the authenticated user record still has `tenantId = null`.

- [ ] **Step 2: Write a failing test for tenant-context enforcement on OTP sign-in**

Prove whether an existing user can use email OTP from the wrong tenant context. If the current guard does not apply to OTP endpoints, capture that as a failing test before changing UI flow further.

- [ ] **Step 3: Run the focused auth and pricing tests**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/components/pricing/pricing-table.test.tsx src/app/[locale]/(site)/pricing/pricing-page-runtime.test.tsx src/app/api/auth/[...all]/route.test.ts
```

- [ ] **Step 4: Decide the bounded path**

Choose one of these outcomes explicitly:

- OTP can preserve current tenant/auth semantics with a narrow compatibility fix inside existing auth files
- OTP cannot safely replace `/register` yet without broader auth work, so the funnel must keep `/register` as the account-creation step until that work is separately scoped
- post-payment tenant reassignment is not required for this slice, so default acquisition tenant remains the effective subscription tenant until a later dedicated domain change
- or post-payment tenant reassignment is required, which blocks this slice and must be scoped as a separate domain-membership/domain-users change before claiming the funnel is safe

Record one more boundary explicitly in this step:

- the public pricing page currently derives billing tenant / checkout metadata from the pricing surface configuration rather than per-request host resolution
- if that remains the intended model, document it as such and do not let later workers "fix" it opportunistically
- if that is no longer intended, stop and scope it as separate routing / pricing-entry work rather than hiding it inside the OTP slice

Do not proceed on assumption alone.

- [ ] **Step 5: Implement only the bounded compatibility fix if needed**

If the failure is narrow and local, repair it without touching `apps/web/src/proxy.ts` or broad auth architecture. This may include:

- passing tenant context from the public pricing runtime into `PricingTable`
- ensuring OTP sign-in/create flows preserve the same default acquisition tenant semantics as `/register`
- adding a tenant-context guard for OTP if the current auth route only protects email/password sign-in
- proving that the resulting authenticated user/session carries the default acquisition tenant before the flow relies on member pages that call `ensureTenantId(session)`

If the failure implies wider auth redesign, stop and record the blocker.

- [ ] **Step 6: Re-run the focused tests**

Run the same command and confirm the OTP path is no longer bypassing tenant semantics.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/pricing/pricing-table.tsx apps/web/src/components/pricing/pricing-table.test.tsx apps/web/src/app/[locale]/(site)/pricing/pricing-page-runtime.tsx apps/web/src/app/[locale]/(site)/pricing/pricing-page-runtime.test.tsx apps/web/src/app/api/auth/[...all]/route.ts apps/web/src/app/api/auth/[...all]/route.test.ts apps/web/src/components/auth/register-form.tsx
git commit -m "test: verify otp tenant compatibility before funnel rewrite"
```

## Chunk 1: Re-anchor Subscription Truth

### Task 1: Document the current truth split and add failing tests

**Files:**

- Modify: `apps/web/src/app/[locale]/(app)/member/claims/new/_core.entry.tsx`
- Modify: `apps/web/src/components/dashboard/member-dashboard-view.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/membership/_core.ts`
- Modify: `apps/web/src/app/[locale]/(app)/member/membership/_core.test.ts`
- Modify: `apps/web/src/components/dashboard/member-dashboard-view.test.tsx`
- Modify: `apps/web/src/components/ops/adapters/membership.test.ts`
- Modify: `packages/domain-membership-billing/src/subscription.test.ts` or create if missing

- [ ] **Step 1: Write a failing test for claim gating versus visible membership status**

Add a test that models a user who can reach the membership success page, dashboard, or membership ops page while still on the default acquisition tenant or still `tenantClassificationPending`, and assert that UI messaging stays honest. Claim access should still follow the canonical access-granting membership truth already implemented in the backend helper, not an inferred UI state.

- [ ] **Step 2: Write a failing test for “no active subscription” member actions**

Add a test that asserts a member without an active subscription gets a primary CTA that resumes acquisition, not a passive status-only screen.

- [ ] **Step 3: Run the focused tests to verify failure**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/membership/_core.test.ts src/components/dashboard/member-dashboard-view.test.tsx src/components/ops/adapters/membership.test.ts
```

Expected: at least one new test fails because the current UI and access truth are inconsistent.

- [ ] **Step 4: Introduce a single “claim-eligible membership” helper**

Consolidate app usage around the existing eligibility rule in `packages/domain-membership-billing/src/subscription.ts` so all claim-eligibility checks come from that helper (or a thin DB-backed wrapper around it), and expose a clearly named API for the app layer.

- [ ] **Step 5: Verify the subscription uniqueness assumption explicitly**

Confirm whether the intended invariant is: one user can subscribe under a default acquisition tenant and later be tenant-resolved without creating parallel subscription records. If yes, record that invariant in implementation notes/tests and verify that all subscription writers honor it consistently.

Specifically check:

- the schema-level uniqueness on `subscriptions.userId`
- the billing-test writer that upserts on `subscriptions.userId`
- the Paddle webhook writer that currently upserts on `subscriptions.id`

Implementation note from 2026-04-08:

- confirmed in repo: `packages/database/src/schema/memberships.ts` enforces `uniqueIndex('idx_subscriptions_user').on(table.userId)`
- confirmed in repo: `apps/web/src/actions/billing-test.ts` writes on `subscriptions.userId`
- confirmed in repo: `packages/domain-membership-billing/src/paddle-webhooks/handlers/subscriptions.ts` still upserts on `subscriptions.id`
- this is now a concrete blocker for calling the funnel persistence-safe, because `subscriptions.id` is also referenced by tenant-bound records such as `membership_family_members.subscriptionId`, so blindly switching the webhook writer to `userId` and rewriting the primary key is not a safe narrow fix

If the invariant is confirmed but the writers still conflict on different targets, treat that as a real defect to fix before calling the funnel safe. If the invariant is not confirmed, treat the current `subscriptions.userId` unique index and any unscoped readers as a separate blocking defect instead of papering over it in UI code.

- [ ] **Step 6: Update app consumers to use the shared truth**

Apply the helper in:

- `apps/web/src/app/[locale]/(app)/member/claims/new/_core.entry.tsx`
- membership page model code
- `apps/web/src/components/dashboard/member-dashboard-view.tsx`, replacing the current unscoped subscription read and `status === 'active'` shortcut
- and fix `apps/web/src/app/[locale]/(app)/member/membership/_core.ts` so subscription selection is deterministic (`orderBy desc(createdAt)` and/or active-first filtering) instead of relying on bare `findFirst`
- keep `tenantClassificationPending` as a separate UI/runtime concern unless a deliberate product decision expands the backend gate

- [ ] **Step 7: Re-run the focused tests**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/membership/_core.test.ts src/components/dashboard/member-dashboard-view.test.tsx src/components/ops/adapters/membership.test.ts
pnpm --filter @interdomestik/domain-membership-billing test:unit --run src/subscription.test.ts
```

Expected: tests pass and claim truth is no longer implied by UI-only state.

- [ ] **Step 8: Commit**

```bash
git add packages/domain-membership-billing/src/subscription.ts packages/domain-membership-billing/src/subscription.test.ts apps/web/src/app/[locale]/(app)/member/claims/new/_core.entry.tsx apps/web/src/app/[locale]/(app)/member/membership/_core.ts apps/web/src/app/[locale]/(app)/member/membership/_core.test.ts apps/web/src/components/dashboard/member-dashboard-view.tsx apps/web/src/components/dashboard/member-dashboard-view.test.tsx apps/web/src/components/ops/adapters/membership.test.ts
git commit -m "fix: unify membership truth for claim access"
```

## Chunk 2: Make Acquisition and Payment Coherent

### Task 2: Replace passive member continuation with a real “complete membership” path

**Files:**

- Modify: `apps/web/src/features/member/membership/components/MembershipOpsPage.tsx`
- Modify: `apps/web/src/components/ops/adapters/membership.ts`
- Modify: `apps/web/src/messages/en/membership.json`
- Modify: `apps/web/src/messages/sq/membership.json`
- Modify: `apps/web/src/messages/mk/membership.json`
- Modify: `apps/web/src/messages/sr/membership.json`
- Test: `apps/web/src/features/member/membership/components/MembershipOpsPage.test.tsx`

- [ ] **Step 1: Write a failing test for a member without an active plan**

Assert that the membership page shows a primary action such as `Complete membership` or `Resume checkout`, not only historical plan rows.

- [ ] **Step 2: Write a failing test for active members**

Assert that active members still see renewal/payment-management actions and are not pushed back into acquisition.

- [ ] **Step 3: Run the focused test**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/member/membership/components/MembershipOpsPage.test.tsx
```

Expected: the new incomplete-membership path is missing.

- [ ] **Step 4: Add an outer empty-state acquisition CTA**

Update `MembershipOpsPage` so `subscriptions.length === 0` renders a top-level acquisition state with a prominent CTA such as `Complete membership` or `Choose a plan`, instead of only an empty list.

- [ ] **Step 5: Add explicit member continuation actions for non-active subscriptions**

Update `getMembershipActions` and `MembershipOpsPage` so:

- active subscriptions show renew/update/cancel flows
- non-active or missing subscriptions show a prominent CTA back into pricing or resumable checkout
- copy is explicit that protection is not active yet

- [ ] **Step 6: Localize the new action copy**

Add locale-safe strings for:

- complete membership
- resume checkout
- membership not active yet
- choose a plan

- [ ] **Step 7: Re-run the focused tests**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/features/member/membership/components/MembershipOpsPage.test.tsx
pnpm i18n:check
pnpm i18n:purity:check
```

Expected: membership page behavior is coherent and translations are clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/member/membership/components/MembershipOpsPage.tsx apps/web/src/components/ops/adapters/membership.ts apps/web/src/features/member/membership/components/MembershipOpsPage.test.tsx apps/web/src/messages/en/membership.json apps/web/src/messages/sq/membership.json apps/web/src/messages/mk/membership.json apps/web/src/messages/sr/membership.json
git commit -m "feat: add member-side continuation for incomplete memberships"
```

### Task 3: Make pricing success honest about activation

**Files:**

- Modify: `apps/web/src/app/[locale]/(app)/member/membership/success/_core.entry.tsx`
- Modify: `packages/domain-membership-billing/src/subscription.ts` only if a thin read helper is needed for success-page activation state
- Modify: `apps/web/src/messages/en/membership.json`
- Modify: `apps/web/src/messages/sq/membership.json`
- Modify: `apps/web/src/messages/mk/membership.json`
- Modify: `apps/web/src/messages/sr/membership.json`
- Test: `apps/web/src/app/[locale]/(app)/member/membership/success/page.test.tsx`

- [ ] **Step 1: Write a failing test for checkout-complete but not activated**

Assert that the success page shows `activation pending` or tenant-classification-pending language and does not present claim-ready copy unless the subscription truth is active. If the current backend intentionally allows claims while classification is pending, the copy must reflect that instead of inventing a stricter gate.

- [ ] **Step 2: Write a failing test for truly active members**

Assert that active members still see the card, dashboard CTA, and claim CTA.

- [ ] **Step 3: Run the focused tests**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/membership/success/page.test.tsx
```

- [ ] **Step 4: Split success messaging into pending vs active**

Refactor `membership/success/_core.entry.tsx` so:

- pending activation is visually distinct
- the status badge is state-aware, replacing the current hardcoded `Active` badge
- “membership is now active” is shown only when it is actually true
- default-acquisition-tenant or classification-pending states are messaged honestly instead of presented as final claim-ready protection
- CTA behavior matches the activation state
- if the page initially renders in a pending state, it has a bounded revalidation path (polling, timed refresh, or explicit resume/refresh action) so the screen does not stay stale after webhook activation lands

- [ ] **Step 5: Derive activation state from the database, not only from the URL**

Update the success page to query real subscription state server-side using the canonical membership truth. The `?activation=pending` query param may remain as a temporary hint to show a banner immediately after checkout, but the badge, body copy, and claim CTA must be derived from the database-backed activation state.
Also incorporate `tenantClassificationPending` so the page can distinguish between:

- checkout complete but activation still pending
- paid member on default acquisition tenant awaiting tenant resolution
- fully resolved membership

This distinction is primarily for honest messaging and routing context. It does not, by itself, redefine backend claim eligibility unless product explicitly chooses to change that rule.

If the real checkout flow still lands on success without any pending hint, update the checkout success handoff in the pricing flow at the same time. Otherwise the page has no reliable way to distinguish “freshly returned from checkout while webhook may still be in flight” from a direct revisit, and the pending state will remain timing-dependent.

- [ ] **Step 6: Re-run tests and i18n checks**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/app/[locale]/(app)/member/membership/success/page.test.tsx
pnpm i18n:check
pnpm i18n:purity:check
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/[locale]/(app)/member/membership/success/_core.entry.tsx apps/web/src/app/[locale]/(app)/member/membership/success/page.test.tsx packages/domain-membership-billing/src/subscription.ts apps/web/src/messages/en/membership.json apps/web/src/messages/sq/membership.json apps/web/src/messages/mk/membership.json apps/web/src/messages/sr/membership.json
git commit -m "fix: make membership success state truthful"
```

## Chunk 3: Fix Navigation and Checkout Environment

### Task 4: Audit and fix broken plan links in member surfaces

**Files:**

- Modify: `apps/web/src/app/[locale]/(app)/member/claims/new/_core.entry.tsx`
- Modify: `apps/web/src/components/dashboard/member-dashboard-view.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/member/membership/components/locked-state-banner.tsx`
- Test: add/update the relevant unit tests for localized plan links

- [ ] **Step 1: Write a failing test for localized plan links from member surfaces**

Assert that member app CTAs point to locale-aware pricing routes and do not use dead host-relative `/pricing`.

- [ ] **Step 2: Run the focused tests**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/components/dashboard/member-dashboard-view.test.tsx src/app/[locale]/(app)/member/cta-handoff-pages.test.tsx
```

- [ ] **Step 3: Replace raw Next links with locale-aware routing links**

Use `@/i18n/routing` where these links should resolve inside locale-aware app navigation.

- [ ] **Step 4: Re-run the focused tests**

Run the same command and confirm the 404 path is gone.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/(app)/member/claims/new/_core.entry.tsx apps/web/src/components/dashboard/member-dashboard-view.tsx apps/web/src/app/[locale]/(app)/member/membership/components/locked-state-banner.tsx
git commit -m "fix: restore locale-aware pricing links in member surfaces"
```

### Task 5: Restore real local Paddle testing or make fallback explicit

**Files:**

- Modify: `apps/web/src/components/pricing/pricing-table.tsx`
- Modify: local env setup docs or local bootstrap notes only if explicitly approved
- Test: `apps/web/src/components/pricing/pricing-table.test.tsx`

- [ ] **Step 1: Write a failing test for missing Paddle configuration**

Assert that when no Paddle client token is present, the UI does not pretend payment succeeded.

- [ ] **Step 2: Implement the explicit local-dev behavior**

The decision is fixed:

- if `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` is present, use real checkout
- if it is absent, show a clear inline `checkout not configured locally` state
- never redirect to success without a true local subscription activation path
- `NEXT_PUBLIC_BILLING_TEST_MODE=1` is a separate branch and must keep an intentional test-only path to the success page so `MockActivationTrigger` remains reachable for gate verification

- [ ] **Step 3: Update pricing fallback behavior**

Split the current fallback behavior into two explicit branches:

- missing Paddle config in local development: no redirect to success; show an honest no-config state instead
- billing test mode: preserve or replace the existing success-page route with a test-only path that still reaches `membership/success` and triggers `MockActivationTrigger`

Do not remove the billing-test path until its replacement exists and the tests are updated in the same change.

- [ ] **Step 4: Re-run focused pricing tests**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/components/pricing/pricing-table.test.tsx
```

- [ ] **Step 5: Manually verify env behavior**

Check whether the active worktree has:

- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- any required Paddle server-side config

Document the result in the PR notes rather than silently assuming local checkout is real.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/pricing/pricing-table.tsx apps/web/src/components/pricing/pricing-table.test.tsx
git commit -m "fix: make local checkout fallback explicit"
```

### Task 5.5: Verify webhook-driven activation is the only path to real activation

**Files:**

- Inspect/Modify: `apps/web/src/app/api/webhooks/paddle/`
- Inspect/Modify: any subscription activation write path invoked by Paddle webhook events
- Test: relevant webhook/unit tests

- [ ] **Step 1: Identify the exact activation write path**

Confirm which webhook handler updates the Postgres subscription row into an access-granting state.

- [ ] **Step 2: Write or update a failing test if webhook activation is not already covered**

Assert that the relevant Paddle webhook event updates the subscription to the expected access-granting state.

Also add the failure-path test for missing tenant context:

- simulate `subscription.created` / `subscription.updated` for a user whose DB row has `tenantId = null`
- and with no usable `customData.tenantId`
- assert this does not get marked as an ordinary successful processing result
- require one of these explicit outcomes:
  - the handler throws so the webhook is marked failed and retried
  - or the event is written as a tenant-resolution failure in auditable storage instead of being silently processed

- [ ] **Step 3: Run the focused webhook test**

Run the relevant unit/integration test for the webhook handler.

- [ ] **Step 4: Fix the activation write path if needed**

If activation is not being persisted correctly, repair the webhook-driven state transition before changing more UI.

- [ ] **Step 5: Re-run the webhook test**

Confirm the database state becomes claim-eligible only through this backend activation path.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/webhooks/paddle
git commit -m "fix: verify webhook-driven subscription activation"
```

## Chunk 4: End-to-End Funnel Verification

### Task 6: Cover the full new-user path with tests

**Files:**

- Modify: `apps/web/e2e/gate/subscription-contract.spec.ts`
- Modify: `apps/web/src/components/pricing/pricing-table.test.tsx`
- Add/Modify: a focused pricing-to-membership-to-claim e2e spec if needed

- [ ] **Step 1: Add or extend an e2e scenario**

Cover:

- anonymous pricing user
- OTP step appears
- checkout starts or explicit no-checkout-config state appears
- success/pending/default-acquisition-tenant state is honest
- immediate post-checkout success lands in a deterministic pending state when webhook activation is still asynchronous
- pending success state can transition to active via the intended refresh/revalidation path once activation is written
- claim access unlocks only when subscription truth is active

- [ ] **Step 2: Add an environment-safe branch for CI and local**

If no Paddle token is configured, the spec must assert the explicit `checkout not configured locally` state instead of pretending checkout completion happened.

- [ ] **Step 3: Update the existing billing-test contract expectation**

Revise both the unit and E2E billing-test assertions so they no longer conflate:

- local missing-Paddle fallback
- intentional billing test mode

The contract should become:

- missing Paddle config => explicit no-config state
- billing test mode => explicit test-only path to success/activation that keeps `MockActivationTrigger` reachable

- [ ] **Step 4: Run the focused e2e contract**

Run:

```bash
pnpm --filter @interdomestik/web test:unit --run src/components/pricing/pricing-table.test.tsx
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm --filter @interdomestik/web test:e2e -- --project=gate-ks-sq e2e/gate/subscription-contract.spec.ts
```

- [ ] **Step 5: Re-run required repository verification**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm check:fast
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm security:guard
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm pr:verify
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/gate/subscription-contract.spec.ts apps/web/src/components/pricing/pricing-table.test.tsx
git commit -m "test: verify frictionless membership funnel end to end"
```

## Notes for Execution

- Do not change `apps/web/src/proxy.ts`.
- Do not reintroduce password-first registration as the primary funnel.
- Treat “active membership” as a backend truth, not a UI copy choice.
- Preserve the existing deferred tenant-classification model. Do not invent a tenant-first acquisition requirement that contradicts PR #414 and the documented neutral-host/default-public-tenant flow.
- Do not silently turn `tenantClassificationPending` into a claim-access gate. If that policy should change, record it explicitly in product scope first.
- If local Paddle keys are unavailable, the UI must say so explicitly rather than simulating completion.
- Keep `/register` as fallback only; it is not the primary acquisition target.
