---
status: design-review
date: 2026-05-09
slice: P33-DG10
title: Post-SEC07 Security Slice Selection
owner: platform
phase: Phase C
---

# P33-DG10 Post-SEC07 Security Slice Selection

## Decision

`P33-SEC07 Signed URL Exposure Hardening` is complete through PR `#695`, merge
commit `6d2f030f521525929a63f9789d68cba080f0044a`.

SEC07 materially reduced signed URL bearer-exfiltration risk by centralizing
signed URL no-store/no-referrer response behavior, preserving signed download
TTL defaults, keeping the voice-note preview TTL exception bounded and
documented, redacting signed URL tokens from errors/logging details, adding
focused route/storage/guard tests, and wiring
`scripts/check-signed-url-exposure.mjs` into `pnpm security:guard`.

The `P33-DG07` CSP blocker remains active. No concrete DG07 unlock condition has
changed, so `P33-SEC03`, `P33-SEC03R`, and CSP Phase 1 enforcement are still not
promotable.

The next bounded hardening slice is:

`P33-SEC08 Vercel TypeScript Build Suppression Cleanup`

This is the highest-value remaining bounded production-professionalism slice
because `apps/web/next.config.mjs` still sets `typescript.ignoreBuildErrors`
for Vercel builds. That is release-integrity debt on the production build path,
review-visible, bounded, and independent of the blocked Next CSP behavior.

DG10 does not implement `P33-SEC08`. Product runtime or build-config changes
must wait for approval of this gate.

## Inputs

| Input                                      | Relevance                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` at `21837b6a`                       | Main is synced after the SEC07 repo-canonical closeout in PR `#696`.                                                                                                              |
| `P33-DG09`                                 | Promoted exactly one implementation slice, `P33-SEC07 Signed URL Exposure Hardening`.                                                                                             |
| `P33-SEC07`                                | Completed through PR `#695`, merge commit `6d2f030f521525929a63f9789d68cba080f0044a`.                                                                                             |
| `docs/security/storage-access-baseline.md` | Contains the SEC07 implementation receipt, including TTL caps, no-store/no-referrer behavior, `noreferrer` anchor coverage, and the static guard assessment.                      |
| Current Next dependency state              | `pnpm --filter @interdomestik/web list next --depth 0` resolves `next 16.2.4`, matching DG09/DG07 evidence.                                                                       |
| Current Vercel build config                | `apps/web/next.config.mjs` still sets `typescript.ignoreBuildErrors: isVercelBuild`, where `isVercelBuild` is `process.env.VERCEL === '1'`.                                       |
| `P33-SEC04B`                               | Final DB posture counts remain `615` total entries: `tenant-context=5`, `tenant-scoped=158`, `tenant-predicate=352`, `admin-privileged=0`, `system-exempt=20`, `unclassified=80`. |

## SEC07 Closeout

SEC07 closed the immediate signed URL exposure follow-up promoted by DG09:

- shared helpers now apply no-store/no-referrer behavior to signed URL API
  responses;
- direct document download responses also emit `Referrer-Policy: no-referrer`;
- signed download TTL defaults remain documented at `300` seconds;
- the voice-note preview TTL exception remains bounded and documented at `600`
  seconds;
- signed URL values are redacted from app error/log details covered by SEC07;
- known signed URL anchors retain `noreferrer` semantics;
- `scripts/check-signed-url-exposure.mjs` is wired into
  `pnpm security:guard`.

Residual risk remains:

- CSP/XSS risk is still unresolved because CSP Phase 1 enforcement remains
  blocked by the DG07/SEC05 architecture state;
- signed upload URL token lifetime remains SDK-managed by Supabase, with no
  route accepting caller-provided upload-token TTL;
- the static signed URL exposure guard is intentionally bounded and does not
  claim full data-flow proof across arbitrary object properties.

Controlled production / pilot GO remains acceptable only with green gates and
unchanged environment posture. Full hardened-production posture or any `9+/10`
claim remains NO-GO until remaining residual categories are fixed or formally
accepted.

## DG07 CSP Blocker Check

DG10 explicitly preserves the DG07 rule before ranking remaining work.

No unlock condition is met:

1. The resolved web Next version remains `16.2.4`.
2. No post-DG09 evidence shows a supported Next header model that lets the repo
   keep a non-nonce enforced CSP beside a nonce-bearing Report-Only CSP while
   still propagating nonces to first-party framework/runtime scripts.
3. There is no approved non-nonce CSP architecture decision, enforced-CSP
   migration change, Trusted Types/SRI compensating-control pivot, or retirement
   of the nonce-migration target.

Therefore:

- `P33-SEC03` remains `blocked-by-architecture`;
- `P33-SEC03R` is not promotable;
- CSP Phase 1 enforcement remains blocked;
- CSP unblock feasibility remains valuable, but not as a SEC03 retry or Phase 1
  enforcement promotion.

## Candidate Ranking

| Rank | Candidate                                                     | Decision | Rationale                                                                                                                                                                               |
| ---: | ------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `P33-SEC08 Vercel TypeScript Build Suppression Cleanup`       | Promote  | `apps/web/next.config.mjs` still suppresses TypeScript build errors on Vercel builds. This is bounded release-integrity debt, review-visible, and independent of the blocked CSP model. |
|    2 | CI/release seed credential hardening                          | Defer    | Security-relevant and likely next-tier production-professionalism work, but broader across CI, release, seed, and E2E credential surfaces than the single Vercel build-integrity issue. |
|    3 | CSP unblock feasibility / non-nonce CSP architecture decision | Defer    | High-value, but DG07 remains unchanged. This must stay a bounded design gate, not a SEC03 retry or CSP Phase 1 enforcement promotion.                                                   |
|    4 | DB posture hard-case burn-down                                | Defer    | SEC04B already met the `<= 80` target and left the remaining `80` entries as hard cases requiring targeted design review rather than another default mass burn-down.                    |
|    5 | Supply-chain attestation                                      | Defer    | Valid hardened-production work, but less immediate than removing production build-path TypeScript suppression.                                                                          |
|    6 | Restore drills                                                | Defer    | Important operational maturity work, but not the strongest next bounded release-integrity fix.                                                                                          |
|    7 | Threat modeling / incident drills                             | Defer    | Useful for readiness and response discipline, but less directly tied to a concrete repo-visible production build gap.                                                                   |
|    8 | Data lifecycle automation                                     | Defer    | Relevant to privacy and retention, but broader than the current bounded build-integrity target.                                                                                         |
|    9 | Performance budgets / repo hygiene                            | Defer    | Valuable engineering maturity work, but not the next security or production-professionalism priority.                                                                                   |

## Promoted Slice

`P33-SEC08 Vercel TypeScript Build Suppression Cleanup`

Scope for the next implementation slice:

- inspect the current reason Vercel builds set
  `typescript.ignoreBuildErrors: isVercelBuild`;
- remove the Vercel-only TypeScript build suppression, or narrow it only if the
  implementation records a concrete, reviewable blocker that prevents full
  removal in one bounded slice;
- ensure Vercel preview/production builds cannot silently pass with TypeScript
  errors unless an explicitly documented, time-bounded exception remains;
- preserve existing CI type-check gates and add focused proof for any
  build-config guard or workflow assertion introduced by the slice;
- update the plan/tracker closeout with the final decision and proof.

The implementation may touch:

- `apps/web/next.config.mjs`;
- narrowly scoped build/config tests or CI guard scripts if needed;
- plan/tracker closeout files after implementation lands.

The implementation must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`;
- auth provider layering or session shape;
- tenancy architecture;
- broad schema design;
- Storage redesign;
- Stripe;
- README, AGENTS, or architecture docs.

## Rejected Alternatives

| Alternative                                        | Decision | Reason                                                                                                                                  |
| -------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Promote `P33-SEC03` or `P33-SEC03R` immediately    | Reject   | DG07's unlock conditions have not changed, and SEC03 remains blocked-by-architecture.                                                   |
| Promote CSP Phase 1 enforcement                    | Reject   | Phase 1 remains blocked by the current report-only architecture mismatch and missing enforced-browser proof.                            |
| Promote CI/release seed hardening first            | Defer    | Important and likely next-tier, but broader than the existing single-file Vercel TypeScript suppression risk.                           |
| Promote DB posture hard-case burn-down first       | Defer    | SEC04B reached the current target; the remaining entries need targeted design evidence.                                                 |
| Treat controlled production as hardened production | Reject   | Current posture supports controlled production / pilot GO with green gates, not a full hardened-production or `9+/10` claim.            |
| Bundle several hardening items into one slice      | Reject   | DG10 selects exactly one bounded slice; bundling build suppression, seed credentials, CSP architecture, and DB hard cases is too broad. |

## Verification Plan

DG10 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

`P33-SEC08` is an implementation slice and must additionally run focused
build/type-check proof, the implementation reviewer pool, a diff-scoped Codex
Security scan if applicable to the changed build surface, and
`pnpm verify-slice -- --required-gates`.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched by DG10.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain
  architecture, broad schema design, Storage architecture, and Stripe remain
  untouched.
- DG10 does not promote CSP Phase 1 enforcement.
- DG10 does not promote SEC03 retry because no concrete DG07 unlock condition is
  recorded.
