---
title: IDA-DG16 UI03a0b1 Neutral OTP Truth Design Gate
date: 2026-07-16
status: complete
authority: current_authority
runtime_authorized: true
promoted_slice: IDA-UI03a0b1
ordered_follow_up_unpromoted: IDA-UI03a0b2
risk_tier: 3
owner: platform + product + legal + privacy + accessibility + qa
---

# IDA-DG16 — UI03a0b1 Neutral OTP Truth Design Gate

## Promotion decision

Promote exactly one prospective Tier 3 implementation slice:
`IDA-UI03a0b1 — Neutral OTP truth, recovery and purpose telemetry`.

This canonical document binds the exact accepted `IDA-DG16 v0.4` packet at
SHA-256 `92598a166b3d68e36591d7a278bbbc85820d823bd4f74b94617a155e3fd0abfc`.
The exact canonical-promotion authority request has SHA-256
`6a8f5d038b0567a9a917f14df361fb2844ba15203285306acea62c307c962ecb`.
The timestamped delegated-orchestrator authority receipt has SHA-256
`25598a3b7ef828b9c679119b84ba235e5020f983883594ce44039cb638ff6ed3`.

At promotion time, this docs-only authority did not authorize implementation.
Runtime remained held until the worktree-scoped resolver returned
`IDA-UI03a0b1` alone and the orchestrator gave separate explicit implementation
authority. Neither promotion nor the later implementation authority authorized
provider/resource mutation, rollout or deployment.

That separate implementation authority was later granted. The slice completed
through PR `#1369` / merge-main SHA
`29de3fd464c07fb5383b10dc3ba74a46141aec7a`; authoritative completion evidence
is recorded in `docs/plans/2026-07-17-ida-ui03a0b1-closeout.md`.

`IDA-UI03a0b2 — Neutral OTP route, tenant and verifier hardening` is ordered but
unpromoted. It may not start. `IDA-UI03a1`, `IDA-UI03a2`, `IDA-UI03b` and
`IDA-UI03a0c` also remain unpromoted.

## Customer outcome and truth boundary

The existing anonymous pricing pre-checkout Continue action remains the sole
trigger. The next step asks for one email and one six-digit Better Auth `sign-in`
code. A confirmed code proves control of the email and signs into or creates an
application account so the already-selected step can continue. It does not
confirm payment, active membership, claim entitlement, coverage, benefits or an
accepted case.

`IDA-UI03a0a` remains binding: a registered account is not an access-active
membership. `getActiveSubscription(userId, tenantId)` remains the sole
entitlement authority. OTP copy may not represent checkout opening or account
creation as payment, membership activation, a claim, an accepted case, coverage
or benefits.

Stage 1 corrects only the customer-facing UI, delivered email, recovery and
purpose-bound logging seam. It does not promise a default-public tenant or claim
that the current server-side enumeration, tenant, verifier, replay, rate-limit or
session boundaries have been hardened. Those protected controls remain owned by
the separately gated and unpromoted `IDA-UI03a0b2`.

## Exact Stage 1 behavior

- Keep OTP type `sign-in`; do not reuse the seam for password reset, email change
  or generic verification.
- Keep the current pre-checkout action as the only deliberate send trigger. Add
  no route, background send, account-linking path or alternative entry.
- Keep selected plan, normalized email, code and OTP UI state in React memory
  only. No URL, cookie, localStorage, sessionStorage, IndexedDB, analytics field
  or durable draft may contain the email, code or OTP state. Refresh or a new
  device restarts the step.
- Lock the destination after a successful send. `Change email` clears local code,
  status and destination UI before another deliberate send. It does not claim to
  reset provider or server budgets.
- Provide explicit send, pending, code, generic failure, cooldown, resend, change
  email, back and support recovery states. Do not render a raw provider status,
  message, response body, tenant or account-existence detail.
- A pending send and verify are mutually locked against duplicate ordinary-flow
  submissions. A one-shot in-memory continuation guard prevents duplicate
  ordinary-flow checkout opens without being represented as billing security or
  transaction correlation.
- Pass the active UI locale on the deliberate send only through an allowlisted
  `x-interdomestik-locale` header. The provider callback accepts only
  `sq|en|sr|mk`, falls back to `en`, and uses locale for wording only—not tenant,
  entity, residence, entitlement or routing.
- Extract the sign-in OTP email into a focused domain-communications module. The
  exact subject, text and HTML carry the same neutral meaning as the UI.
- Add one opt-in `telemetryPolicy: 'content-free'` to the shared sender and use it
  only for the sign-in OTP email module. Under that policy logs contain only
  allowlisted provider kind and outcome/category. They omit recipient, OTP,
  subject, message id and raw provider/fallback error objects or messages.
  Existing non-OTP callers retain their default behavior.
- Verification may continue only through the existing `handleAction` / Paddle
  opening path. Do not change price IDs, Paddle custom data, checkout authority,
  webhooks, catalog, subscription creation or canonical entitlement behavior.
  Checkout opening is not success and no payment is asserted.

## Locked visible copy

Albanian remains plain and may not use “triazh”, “intake” or imported process
jargon. SR and MK carry the same neutral meaning without a positive join/member,
payment, coverage, claim or case-acceptance promise.

| State                 | SQ                                                                                                                                                                            | EN                                                                                                                                                                       | SR                                                                                                                                                      | MK                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eyebrow               | Kontrolli i email-it                                                                                                                                                          | Email check                                                                                                                                                              | Provera e-adrese                                                                                                                                        | Проверка на е-пошта                                                                                                                                                          |
| title                 | Konfirmoni email-in për të vazhduar                                                                                                                                           | Confirm your email to continue                                                                                                                                           | Potvrdite e-adresu da nastavite                                                                                                                         | Потврдете ја е-поштата за да продолжите                                                                                                                                      |
| truth                 | Do t’ju dërgojmë një kod me 6 shifra. Kodi konfirmon email-in dhe hap ose krijon llogarinë tuaj. Nuk konfirmon pagesë, anëtarësi aktive, kërkesë për dëm apo rast të pranuar. | We’ll send a 6-digit code. The code confirms your email and opens or creates your account. It does not confirm payment, active membership, a claim, or an accepted case. | Poslaćemo kod od 6 cifara. Kod potvrđuje vašu e-adresu i otvara ili kreira nalog. Ne potvrđuje uplatu, aktivno članstvo, zahtev niti prihvaćen predmet. | Ќе ви испратиме 6-цифрен код. Кодот ја потврдува вашата е-пошта и отвора или создава сметка. Не потврдува плаќање, активно членство, барање за надомест или прифатен случај. |
| sent                  | Nëse ajo adresë mund të marrë mesazhe nga ne, kodi është nisur. Vlen 5 minuta. Vlen vetëm kodi më i ri.                                                                       | If that address can receive email from us, a code is on its way. It expires in 5 minutes. Only the newest code works.                                                    | Ako ta adresa može da primi našu poruku, kod je na putu. Važi 5 minuta. Važi samo najnoviji kod.                                                        | Ако на таа адреса може да стигне наша порака, кодот е на пат. Важи 5 минути. Важи само најновиот код.                                                                        |
| generic failure       | Nuk e konfirmuam dot kodin. Kontrolloni kodin më të ri ose dërgoni një të ri.                                                                                                 | We couldn’t confirm that code. Check the newest code or send a new one.                                                                                                  | Nismo uspeli da potvrdimo kod. Proverite najnoviji kod ili pošaljite novi.                                                                              | Не успеавме да го потврдиме кодот. Проверете го најновиот код или испратете нов.                                                                                             |
| existing-account stop | Email-i u konfirmua. Kjo llogari nuk mund të vazhdojë me këtë blerje. Hapni llogarinë tuaj ose kontaktoni mbështetjen.                                                        | Email confirmed. This account cannot continue with this checkout. Use your account or contact support.                                                                   | E-adresa je potvrđena. Ovaj nalog ne može da nastavi ovom kupovinom. Otvorite svoj nalog ili kontaktirajte podršku.                                     | Е-поштата е потврдена. Оваа сметка не може да продолжи со оваа наплата. Отворете ја сметката или контактирајте со поддршката.                                                |

Actions are the localized equivalents of Send code, Confirm email, Change email,
Send a new code, Back and Contact support. The resend action exposes the remaining
cooldown without motion-dependent meaning.

## Locked delivered-email copy

| Locale | Subject                              | Body                                                                                                                                                                                               |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQ     | Kodi juaj për konfirmimin e email-it | Përdoreni kodin me 6 shifra për të konfirmuar email-in dhe për të vazhduar. Vlen 5 minuta; vlen vetëm kodi më i ri. Nuk konfirmon pagesë, anëtarësi aktive, kërkesë për dëm apo rast të pranuar.   |
| EN     | Your email confirmation code         | Use the 6-digit code to confirm your email and continue. It expires in 5 minutes; only the newest code works. It does not confirm payment, active membership, a claim, or an accepted case.        |
| SR     | Kod za potvrdu e-adrese              | Upotrebite kod od 6 cifara da potvrdite e-adresu i nastavite. Važi 5 minuta; važi samo najnoviji kod. Ne potvrđuje uplatu, aktivno članstvo, zahtev niti prihvaćen predmet.                        |
| MK     | Код за потврда на е-поштата          | Користете го 6-цифрениот код за да ја потврдите е-поштата и да продолжите. Важи 5 минути; важи само најновиот код. Не потврдува плаќање, активно членство, барање за надомест или прифатен случај. |

## Accessibility and responsive acceptance

- Use explicit label/id relationships, `autocomplete="email"`,
  `autocomplete="one-time-code"` and numeric input mode without blocking paste,
  password managers, autofill or assistive technology.
- Associate invalid controls through `aria-invalid` and `aria-describedby`.
  Announce send status politely and each verification failure assertively once.
- Move focus to the OTP heading after the deliberate transition, to code after
  send, to the first invalid control on failure, and to email after Change email.
  Resend does not steal focus; no state creates a focus trap.
- Keep actions at least 44 CSS px high. Loading decoration is `aria-hidden` and
  motion-free under reduced motion. Forced colors preserve focus, borders and
  status meaning.
- Prove no horizontal overflow or clipped text at 320 CSS px, 200% zoom and WCAG
  text spacing. Evidence is proportional across Chromium/SQ mobile and desktop,
  Firefox/EN, WebKit/SR and Chromium/MK, with keyboard, accessibility-tree or
  screen-reader semantics, reduced motion, forced colors, JavaScript on and off.
  With JavaScript off the pricing page and truth notices render, but no send,
  verify or success is claimed.

## Threat and abuse boundary

| Threat                       | Stage 1 control                                                                                                              | Residual boundary / owner                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Email enumeration            | Generic UI send and failure states; no raw provider detail is rendered.                                                      | Server status/body/path and timing hardening remain unresolved and belong only to unpromoted UI03a0b2; Sentinel/Arben. |
| OTP replay / brute force     | UI never claims replay protection beyond current provider behavior; newest-code and generic failure wording remain truthful. | Hashed verifier, attempt, replay and independent IP/identity limits belong only to UI03a0b2; Atlas/Sentinel.           |
| Duplicate send / stale code  | Pending lock, visible 60-second UI cooldown, resend recovery and newest-code wording.                                        | UI cooldown is not a server control; UI03a0b2 owns outer/provider budgets; Gazmend.                                    |
| Wrong tenant / existing user | No default-public promise; generic post-verification recovery; no account-linking or tenant-rebinding claim.                 | Tenant sanitation, provisioning and fresh-session tenant stop belong only to UI03a0b2; Atlas/Sentinel.                 |
| Shared or new device         | Locked/masked destination, explicit Change email and no durable sensitive browser state.                                     | Refresh/new device restarts; secure resume is excluded.                                                                |
| Provider delay/failure       | Pending, generic unavailable and retry states; no raw detail or false customer success after a provider throw.               | Delivery operations and support escalation; Gazmend.                                                                   |
| Logging leakage              | OTP-only content-free sender policy omits email, code, subject, message id and raw provider errors.                          | Other sender callers remain unchanged; Aliki/Sentinel.                                                                 |
| Support recovery             | Contact support appears only after generic recovery and makes no entitlement promise.                                        | No account-linking mutation; Gazmend.                                                                                  |

## Exact production and test envelope

The hard ceiling is **13 production/i18n files, 7 test/spec files, 16 authored
focused cases and 3 engineering days**, with no contingency.

Production/i18n slots:

1. `apps/web/src/components/pricing/pricing-table/index.tsx`
2. `apps/web/src/components/pricing/pricing-table/otp-checkout-step.tsx`
3. `apps/web/src/components/pricing/pricing-table/types.ts`
4. new `apps/web/src/components/pricing/pricing-table/use-pricing-email-otp.ts`
5. new `apps/web/src/components/pricing/pricing-table/use-pricing-table-state.ts`
6. new `apps/web/src/components/pricing/pricing-table/pricing-table-content.tsx`
7. `apps/web/src/lib/auth/providers.ts`, locale callback only; no provider options
8. `packages/domain-communications/src/email.ts`
9. new `packages/domain-communications/src/sign-in-otp-email.ts`
10. `apps/web/src/messages/sq/pricing.json`
11. `apps/web/src/messages/en/pricing.json`
12. `apps/web/src/messages/sr/pricing.json`
13. `apps/web/src/messages/mk/pricing.json`

Test/spec slots:

1. `apps/web/src/components/pricing/pricing-table.test.tsx`
2. new `apps/web/src/components/pricing/pricing-table/otp-checkout-step.test.tsx`
3. new `apps/web/src/components/pricing/pricing-table/use-pricing-email-otp.test.ts`
4. `apps/web/src/lib/auth/providers.test.ts`, locale callback only
5. new `packages/domain-communications/src/sign-in-otp-email.test.ts`
6. `packages/domain-communications/src/email.test.ts`
7. new `apps/web/e2e/pricing-otp-truth.spec.ts`

Case allocation is exact: six UI/copy-truth cases, four generic
error/lock/retry/focus-recovery cases, four locale-email/content-free-logging
cases and two E2E accessibility/JavaScript-off cases. Existing repository tests
and required Phase C gates remain additional verification, not authored focused
cases.

`pricing-table/index.tsx`, `packages/domain-communications/src/email.ts` and
`pricing-table.test.tsx` are grandfathered paths and may not grow. Extract the
touched pricing state and OTP email seams. Every new file stays at or below 150
lines, and every touched legacy file is smaller than base. No unrelated refactor
is allowed.

## Test-first and completion proof

After separate implementation authority, every behavior begins with a witnessed
failing focused test. Completion requires focused component, provider-callback,
domain-email and browser proof; all four locale renderers; content-free Resend,
SMTP and fallback logging proof; unchanged default sender behavior; and the full
accessibility/browser matrix.

Before PR or merge, run `pnpm pr:verify`, `pnpm security:guard` and
`pnpm e2e:gate`. Current-head CI, PR E2E, Pilot Gate, Sonar, CodeQL,
secret/security scans, Copilot/GitHub feedback and review threads must be green
or accurately classified. Automatic unauthorized CD must be cancelled before
deploy. No deployment or production alias is authorized.

## Architecture compatibility and owned debt

1. Better Auth remains the existing active orchestrator/execution path for this
   seam and may be changed only within the Stage 1 locale callback boundary.
2. Supabase Auth remains the repository-declared identity/session system of
   record.
3. Better Auth's current Drizzle-backed application tables remain adapter and
   execution persistence; this gate does not reclassify them as a system of
   record.
4. Stage 1 may not add or change Supabase Auth calls, shared-auth exports or APIs,
   identity/session architecture, schema, RLS, migrations, provider options or
   resources, or routing/proxy trust authority.
5. The source/runtime mismatch remains unresolved architecture debt, bound by
   debt-receipt SHA-256
   `348a820b63baf4fe9b40ebccabcfed9616368df3aec73b311791cc16ecb1864a`.
6. Any cross-boundary need stops this slice and requires a different protected
   auth decision; UI03a0b1 cannot absorb it during implementation.

The Better Auth 1.6.22 frozen-lock, unverified-account credential/session
revocation, route, tenant, verifier, storage, replay and rate-limit proof is not
claimed by Stage 1. It remains a pre-promotion requirement for `IDA-UI03a0b2`.

## Atomicity and ordered split

The accepted atomicity receipt SHA-256
`d0fe3eb84cc0dfd2279f7170e37206d5ccacbacacbb2509dc68be24ab02e69d0`
records the truthful split. Stage 1 is one coherent customer-truth seam: UI copy,
delivered email, client recovery and OTP-purpose logging must land together so a
partial merge does not preserve false membership/payment language in one channel
or recipient/raw-provider leakage in another. Stage 2 is safely independent only
because Stage 1 makes no claim that protected tenant, verifier, enumeration,
replay or rate-limit behavior has changed. The reverse order is rejected.

## Governance and attributed approvals

- Direct Arben UI/UX approval receipt SHA-256
  `beb9555463d2d460e3d496e5ad1bc04012f05e4afd80d31037e7569350afae78`
  and governance-check receipt SHA-256
  `c0c4dc782f9df1aa16b4284b686251113db078387f7f458005024c612c0a1ca7`
  are PASS with zero conditions.
- Current benchmark receipt SHA-256
  `325555560d6db6d518584c94f37b171c427dc74fcd64426469a2690b39f6cb75`
  measures five boundary answers and preserves the anti-copy boundary.
- Atlas receipt SHA-256
  `b905b91e84ab29b361dcf09ba89f6a8c8b8796548f1345d7b10043dede4f1753`
  and Sentinel receipt SHA-256
  `62faa7936b73a0ffbd3b1acd7715ae441f884f2cc75235893ae227ea171c03c1`
  both `RATIFY` the exact v0.4 clauses with no issues.
- Human-disposition receipt SHA-256
  `9994be2107c0e6e08233a578383a4b010b2c01b1c497754c13b7e2021e0b2718`
  records six `APPROVE` verdicts with no conditions: Arben/SQ is direct;
  Sanja/legal and Sanja/SR are attributable relays declared by Arben;
  Aliki/independent-DPO and Aliki/MK are attributable relays declared by Arben;
  Gazmend/controller-operations is an attributable relay declared by Arben. No
  direct Sanja, Aliki or Gazmend message is claimed.
- Promotion-readiness receipt SHA-256
  `46e8c0d0cdfd93c7a7cbce0b798ba62af81253e0024129b7baa0fdf48d64da50`
  records zero remaining design-gate promotion blockers.

These design receipts do not replace implementation tests, security proof,
current-head CI or later rollout authority. The benchmark learns only purpose
before code, visible recovery and separation of verification from purchase or
coverage; operator wording, sequence, layout, brand, illustration, iconography
and trade dress may not be copied.

## Explicit exclusions and STOP rules

Excluded: `apps/web/src/proxy.ts`; auth route or canonical route changes;
tenant resolver or classification; provider OTP options, storage or attempts;
rate-limit keys; session or checkout authority; default-public provisioning;
Supabase Auth or shared-auth API changes; identity/session architecture;
schema, RLS, migrations or resources; Paddle/webhook/catalog changes; uploads,
documents, durable Free Start drafts or evidence; persistence, retention or
deletion programs; claim prefill or handoff; dashboard/portal redesign; German;
later IDA stages; README, AGENTS and architecture documents; rollout,
deployment, production aliases and unrelated refactoring.

Stop immediately before a protected-surface change, a material reviewer finding,
a fourth implementation behavior outside the exact customer-truth seam, a file
or test not listed above, a seventeenth authored case, a fourth engineering day,
growth of a touched grandfathered file, a new external resource, or any attempt
to start `IDA-UI03a0b2` or another slice.

## Authority and resolver

Canonical main/origin and the promotion worktree were clean at
`9a886c425c0e84d2ff2f42e3260797dcbe7c28f0`. Fresh child AI OS observation
`a997112e9ea24e0782477e9afdbd56034e278ee7445a893eca38f734f4c2289b`
reported Interdomestik authority current, Brain current, `activeSlice=none` and
runtime not authorized before promotion. Unrelated drift remains advisory.

Brain returned only general AGENTS layering and did not resolve the
Supabase/Better Auth source mismatch; no token or time saving is claimed.
Repository source, ADR-06, the canonical trackers and the exact accepted gate
govern.

After promotion merged, the worktree-scoped resolver returned `IDA-UI03a0b1`
alone and the orchestrator gave separate explicit implementation authority.
After this closeout, the resolver must return `blocked_requires_current_authority`
with `activeSlice=null`. No rollout or deployment was authorized.
