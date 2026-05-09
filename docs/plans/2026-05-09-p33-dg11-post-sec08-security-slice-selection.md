---
status: design-review
date: 2026-05-09
slice: P33-DG11
title: Post-SEC08 Security Slice Selection
owner: platform
phase: Phase C
---

# P33-DG11 Post-SEC08 Security Slice Selection

## Decision

`P33-SEC08 Vercel TypeScript Build Suppression Cleanup` is complete through PR
`#698`, merge commit `366741dda756501220ba3cbd07506dff68465a49`.

SEC08 removed the Vercel-only Next.js TypeScript build suppression from
`apps/web/next.config.mjs`, added
`scripts/check-next-typescript-build-integrity.mjs`, wired that guard into
`pnpm security:guard`, and added a focused contract test for the previous
suppression shape.

The hosted Vercel preview proof remains impractical for this repository because
the Vercel check reports `Canceled by Ignored Build Step` through
`apps/web/vercel.json`. SEC08 therefore used the named compensating static check,
`Next TypeScript build integrity guard`, plus local `VERCEL=1` build proof:
a synthetic TypeScript error failed the Next build after suppression removal, and
a clean `VERCEL=1` build passed.

The `P33-DG07` CSP blocker remains active. No concrete DG07 unlock condition has
changed, so `P33-SEC03`, `P33-SEC03R`, and CSP Phase 1 enforcement are still not
promotable.

The next bounded security slice is:

`P33-DG12 CI/Release Seed Credential Hardening Design Review`

This is a design-gate slice, not direct credential implementation. The remaining
CI/release seed credential surface spans GitHub workflows, release-gate
configuration, seed scripts, and E2E account contracts. That is too broad to
change safely as an implementation slice without first locking inventory,
classification, allowed placeholder semantics, and the future implementation
boundary.

DG11 does not implement `P33-DG12`. Credential, workflow, seed, auth, and test
behavior changes must wait for approval of the DG12 design gate.

## Inputs

| Input                         | Relevance                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` at `366741dd`          | Main is synced after SEC08 merged through PR `#698`.                                                                                                                        |
| `P33-DG10`                    | Promoted exactly one implementation slice, `P33-SEC08 Vercel TypeScript Build Suppression Cleanup`.                                                                         |
| `P33-SEC08`                   | Removed Vercel-only TypeScript build suppression and added the build-integrity guard.                                                                                       |
| SEC08 Vercel evidence         | Hosted Vercel deployment proof is impractical because the Vercel check is skipped by the configured ignored-build step; the compensating static guard is now in place.      |
| Current Next dependency state | `pnpm --filter @interdomestik/web list next --depth 0` resolves `next 16.2.4`, matching DG10 evidence.                                                                      |
| Context7 Next.js docs         | Current Next docs still describe nonce extraction from a nonce-bearing request `Content-Security-Policy` plus `x-nonce`, not the blocked Report-Only-over-enforced pattern. |
| Current CI/seed surface       | GitHub workflows and release-gate paths still contain local fallback database URLs, placeholder E2E secrets, seed commands, and role credential environment contracts.      |

## SEC08 Closeout

SEC08 closed the Vercel TypeScript build-integrity gap promoted by DG10:

- `apps/web/next.config.mjs` no longer sets `typescript.ignoreBuildErrors`;
- Vercel builds no longer get a repo-configured TypeScript-error bypass;
- the `Next TypeScript build integrity guard` blocks reintroducing
  `ignoreBuildErrors` in the web Next config;
- the guard runs in `pnpm security:guard`;
- focused Node tests prove the guard rejects the prior suppression shape and
  permits a clean config;
- local `VERCEL=1` build proof showed that a synthetic TypeScript error fails
  the production build after suppression removal.

Residual risk remains:

- hosted Vercel preview deployment proof could not run because the repository's
  ignored-build step skipped the deployment;
- the static guard intentionally checks the repo Next config, not external
  Vercel project settings;
- CSP/XSS residual risk remains because CSP Phase 1 enforcement is still blocked
  by the DG07/SEC05 architecture state.

Controlled production / pilot GO remains acceptable only with green gates and
unchanged environment posture. Full hardened-production posture or any `9+/10`
claim remains NO-GO until remaining residual categories are fixed or formally
accepted.

## DG07 CSP Blocker Check

DG11 explicitly preserves the DG07 rule before ranking remaining work.

No unlock condition is met:

1. The resolved web Next version remains `16.2.4`.
2. Current Next documentation still describes the supported nonce path as a
   nonce-bearing request `Content-Security-Policy` plus `x-nonce`.
3. There is no post-DG10 evidence of a supported Next header model that lets the
   repo keep a non-nonce enforced CSP beside a nonce-bearing Report-Only CSP
   while still propagating nonces to first-party framework/runtime scripts.
4. There is no approved enforced-CSP architecture change, Trusted Types/SRI
   compensating-control pivot, or retirement of the nonce-migration target.

Therefore:

- `P33-SEC03` remains `blocked-by-architecture`;
- `P33-SEC03R` is not promotable;
- CSP Phase 1 enforcement remains blocked;
- CSP unblock feasibility remains valuable, but not as a SEC03 retry or Phase 1
  enforcement promotion.

## Candidate Ranking

| Rank | Candidate                                                     | Decision | Rationale                                                                                                                                                                                                                                                   |
| ---: | ------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `P33-DG12 CI/Release Seed Credential Hardening Design Review` | Promote  | CI/release seed credential hardening is now the highest ranked remaining production-professionalism risk, but it spans workflows, seed commands, release-gate contracts, and E2E credentials, so a bounded design gate must define the safe implementation. |
|    2 | CSP unblock feasibility / non-nonce CSP architecture decision | Defer    | High-value, but DG07 remains unchanged and current Next docs still describe the nonce-bearing enforced CSP path. This should remain a future design gate, not a SEC03 retry or Phase 1 enforcement promotion.                                               |
|    3 | DB posture hard-case targeted design review                   | Defer    | SEC04B already met the `<= 80` target. The remaining hard cases need targeted evidence, but credential hardening is the more immediate release/professionalism gap after SEC08.                                                                             |
|    4 | Supply-chain attestation                                      | Defer    | Valid hardened-production work, but less immediate than resolving visible CI/release seed credential posture.                                                                                                                                               |
|    5 | Restore drills                                                | Defer    | Important operational maturity work, but less directly tied to current repo-visible release credential posture.                                                                                                                                             |
|    6 | Threat modeling / incident drills                             | Defer    | Useful for readiness and response discipline, but not the strongest next bounded hardening step.                                                                                                                                                            |
|    7 | Data lifecycle automation                                     | Defer    | Relevant to privacy and retention, but broader than the current CI/release credential hardening concern.                                                                                                                                                    |
|    8 | Performance budgets / repo hygiene                            | Defer    | Valuable engineering maturity work, but not the next security or production-professionalism priority.                                                                                                                                                       |

## Promoted Slice

`P33-DG12 CI/Release Seed Credential Hardening Design Review`

Scope for the next design-gate slice:

- inventory CI, release, seed, E2E, and pilot-gate credential surfaces;
- classify each credential or placeholder as local-only, GitHub secret-backed,
  release-gate required, seed-fixture-only, or unsafe shared fallback;
- define which fallback database URLs and placeholder secrets may remain for
  local deterministic verification and which must be replaced, gated, or
  removed;
- define the implementation boundary for any later credential-hardening slice,
  including required tests and migration/rollback behavior for CI jobs;
- preserve current E2E gate semantics unless the design explicitly proves a safe
  replacement contract;
- avoid changing auth provider layering, session shape, tenancy architecture, or
  canonical routes.

The design gate may inspect:

- `.github/workflows/**`;
- `scripts/**` seed, release-gate, and E2E helpers;
- `apps/web/e2e/**` seed contracts and auth fixtures;
- `docs/plans/**` for the design-gate record.

The design gate must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`;
- auth provider layering or session shape;
- tenancy architecture;
- broad schema design;
- Storage redesign;
- Stripe;
- README, AGENTS, or architecture docs.

## Rejected Alternatives

| Alternative                                        | Decision | Reason                                                                                                                                                 |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Promote a direct credential implementation now     | Reject   | The surface spans workflows, seed scripts, release-gate credentials, and E2E contracts; a design gate is needed before implementation changes.         |
| Promote `P33-SEC03` or `P33-SEC03R` immediately    | Reject   | DG07's unlock conditions have not changed, and SEC03 remains blocked-by-architecture.                                                                  |
| Promote CSP Phase 1 enforcement                    | Reject   | Phase 1 remains blocked by the current report-only architecture mismatch and missing enforced-browser proof.                                           |
| Promote DB posture hard-case burn-down first       | Defer    | SEC04B reached the current target; the remaining hard cases need targeted design evidence and are less immediate than CI/release credential hardening. |
| Treat controlled production as hardened production | Reject   | Current posture supports controlled production / pilot GO with green gates, not a full hardened-production or `9+/10` claim.                           |
| Bundle credentials, CSP, DB posture, and drills    | Reject   | DG11 selects exactly one bounded next slice; bundling multiple maturity tracks would be too broad.                                                     |

## Verification Plan

DG11 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

`P33-DG12` is also a design-gate slice. It should run the same docs/design-gate
verification set and must not change product runtime code.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched by DG11.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain
  architecture, broad schema design, Storage architecture, and Stripe remain
  untouched.
- DG11 does not promote CSP Phase 1 enforcement.
- DG11 does not promote SEC03 retry because no concrete DG07 unlock condition is
  recorded.
