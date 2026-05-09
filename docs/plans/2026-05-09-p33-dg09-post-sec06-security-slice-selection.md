---
status: design-review
date: 2026-05-09
slice: P33-DG09
title: Post-SEC06 Security Slice Selection
owner: platform
phase: Phase C
---

# P33-DG09 Post-SEC06 Security Slice Selection

## Decision

`P33-DG09` keeps the `P33-DG07` CSP blocker active. No concrete DG07 unlock
condition has changed since SEC05/DG07, so `P33-SEC03` and a `P33-SEC03R` retry
are not promotable.

The next bounded security slice is:

`P33-SEC07 Signed URL Exposure Hardening`

This is the highest-value mitigation while CSP Phase 1 remains blocked because it
directly targets the residual risk left by `P33-SEC06`: signed Storage URLs are
bearer credentials for their full TTL once issued, and they can still be exposed
through logs, referrers, client-side compromise, cached responses, or operator
debugging even after tenant-prefix RLS and service-role path assertions are in
place.

DG09 does not implement `P33-SEC07`. Product runtime code must wait for approval
of this gate.

## Inputs

| Input                                      | Relevance                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` at `f2886bc2`                       | Main is synced after PR `#692`; this gate starts from the post-SEC06 baseline.                                                                                                                                                                                |
| `P33-SEC06`                                | Storage tenant-prefix RLS, service-role Storage wrappers, service-role Storage guard, and storage baseline receipts are complete.                                                                                                                             |
| `docs/security/storage-access-baseline.md` | Records the SEC06 receipt and the residual signed URL bearer-exfiltration risk.                                                                                                                                                                               |
| `P33-DG07`                                 | Defines the CSP architecture blocker and the conditions required before SEC03 or Phase 1 can resume.                                                                                                                                                          |
| `P33-SEC04B`                               | Final DB posture counts are `615` total entries: `tenant-context=5`, `tenant-scoped=158`, `tenant-predicate=352`, `admin-privileged=0`, `system-exempt=20`, `unclassified=80`.                                                                                |
| Current Next dependency state              | `apps/web/package.json` still declares `next` as `^16.2.4`; `pnpm-lock.yaml` resolves `next@16.2.4` with integrity `sha512-kPvz56wF5frc+FxlHI5qnklCzbq53HTwORaWBGdT0vNoKh1Aya9XC8aPauH4NJxqtzbWsS5mAbctm4cr+EkQ2Q==`; the installed package reports `16.2.4`. |
| Context7 Next.js docs                      | Current Next docs still describe proxy-generated nonce propagation through cloned request headers, a nonce-bearing request `Content-Security-Policy`, `x-nonce`, and a matching response `Content-Security-Policy`.                                           |

## DG07 CSP Blocker Check

DG09 explicitly checks the DG07 unlock surface before ranking post-SEC06 work.

No unlock condition is met:

1. The resolved Next version has not changed. The web app still resolves
   `next@16.2.4`.
2. The installed App Router source still uses the same header precedence:

   ```js
   const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
   const nonce = typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined;
   ```

3. Current Next documentation still describes the supported nonce path as a
   nonce-bearing request `Content-Security-Policy` plus `x-nonce`, with the
   response emitting the matching `Content-Security-Policy`.
4. There is no documented or observed supported hook that tells Next to prefer a
   nonce-bearing Report-Only CSP when an enforced non-nonce CSP is also present.
5. There is no approved enforced-CSP architecture change, non-production
   nonce-enforced harness, Trusted Types/SRI pivot, or explicit retirement of the
   nonce-migration target.

Therefore:

- `P33-SEC03` remains `blocked-by-architecture`;
- `P33-SEC03R` is not promotable;
- CSP Phase 1 enforcement remains blocked;
- `CSP_NONCE_MODE=enforce` remains guarded;
- a CSP unblock feasibility gate can be ranked, but not as the immediate next
  implementation slice.

## Current Security Posture

SEC06 materially improves Storage tenant isolation by adding tenant-prefix
Storage RLS for authenticated clients, centralizing service-role Storage calls
behind path-asserting wrappers, and blocking new direct service-role Storage use.

The remaining signed URL risk is different from the path-forgery class SEC06
addressed. Once the app correctly authorizes a document or upload operation and
issues a signed URL, that URL is bearer-held until expiry. Tenant RLS and
service-role path assertions do not revoke it after exfiltration.

Controlled production / pilot GO remains acceptable if the mandatory gates are
green and environment posture is unchanged. Full hardened-production posture and
any `9+/10` claim remain NO-GO until the program either fixes or formally
accepts the remaining hardening categories: CSP or compensating browser-edge
controls, Vercel TypeScript build suppression, CI/release seed credentials, and
remaining DB posture hard cases.

## Candidate Ranking

| Rank | Candidate                                                     | Decision | Rationale                                                                                                                                                                                           |
| ---: | ------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `P33-SEC07 Signed URL Exposure Hardening`                     | Promote  | Directly mitigates SEC06 residual bearer URL exposure, is bounded, can be verified with route/storage tests and static guards, and does not depend on Next CSP behavior.                            |
|    2 | CSP unblock feasibility / non-nonce CSP architecture decision | Defer    | Important, but DG07 remains unchanged. This should be a design gate, not a SEC03 retry or Phase 1 enforcement promotion.                                                                            |
|    3 | Vercel TypeScript build suppression cleanup                   | Defer    | `apps/web/next.config.mjs` still suppresses TypeScript build errors on Vercel builds. This is a release-integrity risk, but it is less directly tied to the SEC06 residual threat than signed URLs. |
|    4 | CI/release seed credential hardening                          | Defer    | Hardcoded or broadly reused test credentials remain visible in E2E/release surfaces and deserve cleanup, but the next best security move should first reduce live Storage bearer exposure.          |
|    5 | DB posture hard-case burn-down                                | Defer    | SEC04B met the current `<= 80` unclassified ceiling. The remaining `80` hard cases need a targeted design review rather than another mass burn-down by default.                                     |
|    6 | Supply-chain attestation                                      | Defer    | Valid hardened-production work, but not the strongest immediate risk reducer after SEC06.                                                                                                           |
|    7 | Restore drills                                                | Defer    | Valid operational maturity work; less directly coupled to SEC06 residual risk.                                                                                                                      |
|    8 | Threat modeling / incident drills                             | Defer    | Useful for maturity and response readiness, but not the highest bounded mitigation from the current evidence.                                                                                       |
|    9 | Data lifecycle automation                                     | Defer    | Relevant to privacy and retention, but broader than the post-SEC06 signed URL risk.                                                                                                                 |
|   10 | Performance budgets / repo hygiene                            | Defer    | Useful engineering maturity work, but not the next security-hardening priority.                                                                                                                     |

## Promoted Slice

`P33-SEC07 Signed URL Exposure Hardening`

Scope for the next implementation slice:

- inventory every production path that returns or internally handles Storage
  signed upload or download URLs after SEC06;
- enforce explicit operation-specific TTL caps at the service-role Storage
  boundary and prove no route can request a longer unreviewed TTL;
- ensure every signed URL API response uses `Cache-Control: no-store` or a
  stricter equivalent where the response body contains a bearer URL or upload
  token;
- ensure signed URL API responses suppress downstream referrer leakage with an
  explicit `Referrer-Policy`, and ensure any anchor rendered with an embedded
  signed token uses `noreferrer` semantics;
- ensure signed URL values are redacted from app logs, thrown errors, Sentry
  context, audit metadata, and test snapshots;
- add focused tests for document download URL creation, upload URL creation,
  voice-note preview URL creation, and any admin/staff signed URL path that
  remains after the inventory;
- add a small static guard for signed URL logging, cacheable signed URL
  responses, or missing referrer suppression where practical; if a guard is not
  practical, record the assessed guard shape and specific false-positive or
  coverage blocker in the baseline receipt;
- update `docs/security/storage-access-baseline.md` with the final signed URL
  exposure-hardening receipt.

The implementation may touch:

- `apps/web/src/lib/storage/**`;
- existing signed URL route/action callsites and focused tests under
  `apps/web/src/**`;
- a focused security guard script if needed;
- `docs/security/storage-access-baseline.md` for the implementation receipt.

The implementation must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`;
- auth provider layering or session shape;
- tenancy architecture outside Storage signed URL boundary checks;
- broad schema design or Storage redesign;
- Stripe;
- README, AGENTS, or architecture docs.

## Rejected Alternatives

| Alternative                                        | Decision | Reason                                                                                                                         |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Promote `P33-SEC03` or `P33-SEC03R` immediately    | Reject   | DG07's unlock conditions have not changed, and the two-header CSP architecture still makes SEC03 non-promotable.               |
| Promote CSP Phase 1 enforcement                    | Reject   | Phase 1 remains blocked by first-party framework-script nonce evidence and missing enforced-browser proof.                     |
| Make a broad Storage redesign the next slice       | Reject   | SEC06 already added the structural path backstop. The bounded residual is signed URL exposure, not a new Storage architecture. |
| Move directly to DB hard-case burn-down            | Defer    | SEC04B reached the current posture ceiling; the remaining hard cases need a separate evidence basis.                           |
| Treat controlled production as hardened production | Reject   | Current posture supports controlled production / pilot GO with green gates, not a full hardened-production or `9+/10` claim.   |

## Verification Plan

DG09 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

`P33-SEC07` is an implementation slice and must additionally run focused signed
URL tests, the implementation reviewer pool, a diff-scoped Codex Security scan,
and `pnpm verify-slice -- --required-gates`.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched by DG09.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain
  architecture, broad schema design, and Stripe remain untouched.
- DG09 does not promote CSP Phase 1 enforcement.
- DG09 does not promote SEC03 retry because no concrete DG07 unlock condition is
  recorded.
