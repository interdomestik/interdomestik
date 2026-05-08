# P33-DG02 CSP Nonce Phase 0 Selection

## Metadata

- Date: 2026-05-08
- Slice: `P33-DG02`
- Status: Complete
- Owner: `platform + security + qa`
- Purpose: select the next bounded P33 production-maturity slice after `P33-SEC01`
  without reopening completed CRM09 or collapsing the remaining `10/10` maturity categories.

## Scope Boundary

This is a selection and design-gate slice only. It updates repo-canonical program and tracker
records and does not authorize product-code changes, schema migrations, proxy changes, auth or
tenancy refactors, canonical route changes, Stripe reintroduction, README, AGENTS, or
architecture-doc changes.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority and is not edited by this gate.

## Evidence Reviewed

| Evidence                                                           | Finding                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-06-p33-dg01-production-maturity-10-roadmap.md` | SEC01 was the first ranked post-CRM09 hardening slice and is now complete. The same roadmap ranked CSP nonce Phase 0 immediately after SEC01, while `withTenantContext` build guards and storage RLS backstops require separate design gates.                                             |
| `docs/plans/current-program.md`                                    | The program records `P33-SEC01` as complete through PR `#664` and keeps CSP nonce Phase 0, build-guard design, storage RLS design, supply-chain attestation, restore drills, threat modeling, incident drills, data lifecycle automation, performance budgets, and repo hygiene deferred. |
| `docs/plans/current-tracker.md`                                    | The tracker records `P33-SEC01` as complete and shows no later promoted P33 slice after it.                                                                                                                                                                                               |
| `docs/security/csp-nonce-migration.md`                             | CSP nonce migration already has an approved design, with Phase 0 defined as Report-Only mode behind `CSP_NONCE_MODE=off\|report\|enforce`, preserving the current enforced CSP while adding nonce policy observation.                                                                     |
| `apps/web/src/lib/proxy-logic.ts`                                  | Current production CSP is emitted from proxy logic and still allows `'unsafe-inline'` in `script-src` and `style-src`; security headers are centralized in the existing hardening flow.                                                                                                   |
| `apps/web/src/lib/proxy-logic.test.ts`                             | Existing header tests assert the current `'unsafe-inline'` script policy, so Phase 0 must update tests without prematurely enforcing nonce-only script execution.                                                                                                                         |
| Context7 Next.js `v16.2.2` CSP guidance                            | Current Next.js guidance still uses per-request proxy-generated nonces, `x-nonce` request headers, a CSP request header for framework nonce discovery, matching response CSP headers, and dynamic rendering awareness for nonce support.                                                  |

## Decisions

### 1. Promote CSP Phase 0 Before Enforcement

Decision: promote `P33-SEC02 CSP Nonce Phase 0 Report-Only` as the next bounded implementation
slice.

The current CSP already has strong framing, object, base URI, form, HSTS, and curated destination
controls, but script and style sources still rely on `'unsafe-inline'`. Phase 0 reduces that risk
in the smallest reversible way: keep the current enforced policy unchanged and add a Report-Only
nonce policy so production-like browser behavior, framework script nonce propagation, analytics,
Paddle, Sentry, and style behavior can be observed before enforcement.

### 2. Keep The Existing Proxy Authority

Decision: SEC02 may edit proxy logic under the existing authority boundary, but it must not edit
`apps/web/src/proxy.ts` or change canonical route behavior.

The current CSP is built in `apps/web/src/lib/proxy-logic.ts`, which is already the centralized
security-header implementation used by the proxy authority. SEC02 should extend that existing
header-building path with feature-flagged nonce policy generation, not introduce route-specific
header code, middleware duplicates, or app-route-only security behavior.

### 3. Report-Only Means No User-Visible Product Behavior Change

Decision: SEC02 must not remove `'unsafe-inline'` from the enforced CSP.

The slice should add `Content-Security-Policy-Report-Only` only when
`CSP_NONCE_MODE=report`, keep the existing `Content-Security-Policy` value intact in that mode,
and include rollback by setting `CSP_NONCE_MODE=off`. Enforcement mode may be scaffolded only as a
tested helper contract if it does not become the default and does not remove current runtime
compatibility in production.

### 4. Reporting Endpoint Is Optional Only If Scoped

Decision: the implementation may either route reports to an existing supported Sentry ingestion
path or add a minimal local `/api/csp-report` endpoint, but it must choose one explicitly.

If a local endpoint is added, it must accept only CSP report payloads, normalize a narrow
allowlist of fields, avoid cookies, authorization headers, and full query strings, and capture
warning-level telemetry only. Durable `csp_violations` persistence is not authorized by SEC02 and
requires a later schema-reviewed slice.

## Candidate Ranking

| Rank | Candidate                                                                                                          | Decision | Reason                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P33-SEC02 CSP Nonce Phase 0 Report-Only`                                                                          | Promote  | Already designed, directly reduces remaining browser-edge script risk, starts with reversible report-only observation, and can be verified with focused header/unit/browser proof without schema, auth, tenancy, or product UX changes. |
| 2    | `P33-DG03 withTenantContext Build Guard Design`                                                                    | Defer    | Still valuable, but needs a baseline and exemption design to avoid noisy build failures across sensitive direct DB callsites. It should remain a design gate before implementation.                                                     |
| 3    | `P33-DG04 Storage RLS Backstop Design`                                                                             | Defer    | Storage isolation touches uploads, documents, policy analysis, and AI workflows. It needs its own threat model and migration plan before code changes.                                                                                  |
| 4    | Supply-chain attestation and SBOM/provenance                                                                       | Defer    | Useful production-maturity work, but less directly tied to the known active runtime edge-control gap than CSP Phase 0.                                                                                                                  |
| 5    | Restore drills, threat modeling, incident drills, data lifecycle automation, performance budgets, and repo hygiene | Defer    | Valid `10/10` categories, but not safe to bundle with a browser security-header migration or with each other. Each needs a later bounded gate.                                                                                          |

## Promoted Slice

Promote exactly one bounded implementation slice:

**`P33-SEC02 CSP Nonce Phase 0 Report-Only`**

SEC02 should add a feature-flagged CSP nonce Phase 0 path that preserves the current enforced CSP
while emitting a nonce-based `Content-Security-Policy-Report-Only` policy when
`CSP_NONCE_MODE=report`. The implementation should generate a fresh nonce per request, propagate
the nonce through request headers for Next.js framework/script discovery, emit matching report-only
response headers, include `report-to` and `report-uri`, and prove that two requests receive
different nonces. It must preserve the existing enforced CSP unless `CSP_NONCE_MODE=enforce` is
explicitly selected by a later rollout decision.

SEC02 must include focused tests for `off`, `report`, and any scaffolded `enforce` helper
behavior; update security-header E2E coverage for report-only nonce presence and current enforced
policy preservation; and run browser validation against at least one public route and one protected
redirect/auth path in a production-like local build when feasible.

## Non-Goals

- Enforcing nonce-only script execution by default.
- Removing `'unsafe-inline'` from the enforced CSP.
- Removing `'unsafe-inline'` from `style-src`.
- Implementing durable CSP violation storage or a `csp_violations` table.
- Rewriting analytics, Sentry, Paddle, PostHog, or Meta/Facebook integrations.
- Editing `apps/web/src/proxy.ts`.
- Changing canonical routes, auth layering, tenancy architecture, schema, Stripe posture, product
  UX, support-handoff behavior, README, AGENTS, or architecture docs.
- Implementing `withTenantContext` build guards, storage RLS backstops, supply-chain attestation,
  restore drills, threat modeling, incident drills, data lifecycle automation, performance budgets,
  or repo hygiene in the same slice.

## P33-SEC02 Implementation Contract

- Use the existing security-header/proxy-logic flow rather than adding a second CSP authority.
- Add `CSP_NONCE_MODE=off|report|enforce`, defaulting safely to `off` when unset.
- In `report` mode, keep the current enforced `Content-Security-Policy` unchanged.
- Generate a fresh high-entropy nonce per request for report/enforce modes.
- Pass the nonce through `x-nonce` and the CSP request header pattern required by current Next.js
  nonce behavior.
- Emit `Content-Security-Policy-Report-Only` with `script-src 'self' 'nonce-{nonce}'`
  `'strict-dynamic'` plus required compatibility and destination directives.
- Include `Report-To` and `report-uri`; if a local endpoint is selected, keep it narrow,
  non-persistent, and privacy-minimized.
- Preserve existing HSTS, frame, object, base URI, form, referrer, content-type, permissions, and
  tenant-cookie behavior.
- Add focused unit tests and E2E/security-header proof for nonce freshness and policy placement.
- Document rollout rollback in the PR body: `report` to `off`, and later `enforce` to `report`.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` is untouched by this gate and remains the sole routing/access-control
  authority.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- This gate avoids auth, tenancy, routing, and architecture refactors.
- Stripe remains unused.

## P33-DG02 Verification Proof

Local verification is completed on branch `codex/p33-dg02-csp-nonce-selection` on 2026-05-08.

| Command                         | Result |
| ------------------------------- | ------ |
| `git diff --check`              | Pass.  |
| `pnpm plan:status`              | Pass.  |
| `pnpm plan:audit`               | Pass.  |
| `pnpm track:audit`              | Pass.  |
| `pnpm docs:verify`              | Pass.  |
| `pnpm verify-slice -- --static` | Pass.  |

Scope audit must stay inside `docs/plans/`; `apps/web/src/proxy.ts`, canonical routes,
auth/tenancy code, product runtime files, schema files, Stripe surfaces, README, AGENTS, and
architecture docs must not be changed by this design gate.
