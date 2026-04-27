# P22-GO01 Production Go-Live Readiness And Smoke

**Status:** in progress
**Date:** 2026-04-27
**Purpose:** production go/no-go operations proof before opening live traffic

## Goal

Prove that the declared v1.0.0 release is operationally ready for controlled production
traffic on the real deployment, with production environment identity, tenant-host binding,
Paddle production posture, database backup and rollback readiness, observability, alerting,
and launch-critical smoke evidence recorded before the go/no-go decision.

This is an operations-readiness and smoke slice. It does not authorize product behavior
expansion, UI/UX redesign, CRM redesign, agent-workspace redesign, product analytics
expansion, route renames, proxy edits, auth or tenancy refactors, schema changes, or Stripe
reintroduction.

`apps/web/src/proxy.ts` remains read-only. Any production smoke blocker that appears to need
proxy, routing, auth, or tenancy changes must be recorded with exact reproduction evidence and
handled as a separate explicitly authorized fix.

## Scope

1. **Production deployment identity**
   - Identify the production URL, Vercel deployment, deployed commit SHA, release tag or release
     reference, and deployment timestamp.
   - Confirm the running build corresponds to the intended v1.0.0 repo state.

2. **Environment and secret posture**
   - Confirm required production environment variables are present in the hosting environment.
   - Confirm no local-only, test, debug, or sandbox flags are enabled for live traffic.
   - Confirm Supabase, Paddle, Sentry, and application public URLs point to production-intended
     projects and domains.

3. **DNS and tenant-host mapping**
   - Confirm canonical production hostnames resolve to the expected deployment.
   - Confirm the pilot host resolves to the expected tenant identity and does not fall back to the
     default public tenant.
   - Confirm protected canonical routes preserve login redirects and role boundaries under the
     production host.

4. **Database backup and rollback readiness**
   - Confirm a fresh production database backup or provider-managed recovery point exists before
     traffic is opened.
   - Confirm the rollback path names the target deployment, rollback command or dashboard action,
     database recovery owner, and validation commands.
   - Confirm the rollback owner can execute or coordinate the rollback inside the launch window.

5. **Paddle production posture**
   - Confirm V3 pilot billing uses Paddle, not Stripe.
   - Confirm production Paddle public and server configuration is present where required.
   - Confirm pricing suppresses local/sandbox checkout warning copy when
     `NEXT_PUBLIC_PADDLE_ENV=production`.
   - Confirm webhook endpoints and signature secrets are configured for the production Paddle
     environment when paid checkout is part of the launch path.

6. **Observability and incident readiness**
   - Confirm Sentry or equivalent production error capture is enabled for the production deployment.
   - Confirm alert recipients or incident owner are named for launch day.
   - Confirm the incident decision path names who can continue, pause, hotfix, roll back, or stop
     live traffic.

7. **Production smoke surfaces**
   - Public home or acquisition entry serves without 500s.
   - `/pricing` serves with production billing posture and no local/sandbox warning in production
     Paddle mode.
   - `/services` and Free Start entry serve without 500s.
   - Anonymous `/member`, `/agent`, `/staff`, and `/admin` requests redirect to login rather than
     failing open or returning ambiguous layout 404s.
   - Authenticated member, agent, staff, and admin launch-critical dashboards serve on the
     production host, using the same role and tenant boundaries proven by P21.
   - Unified agent/member context switch remains behavior-compatible on the production host.

## Explicit Blockers

Live traffic must not open while any of these are unresolved:

- Production URL, deployment SHA, or release identity is unknown.
- Required production environment variables or secrets are missing or known-invalid.
- Canonical host or pilot host resolves to the wrong tenant or an undocumented fallback tenant.
- Protected routes fail open, lose tenant context, or bypass login on anonymous access.
- Paddle production checkout posture is broken for a launch path that requires paid checkout.
- No fresh database backup, recovery point, or rollback owner is confirmed.
- No production error capture, alert recipient, or launch incident owner is confirmed.
- Any launch-critical dashboard or public entry returns a 500 on the production host.

## Not In Scope

- Product behavior expansion.
- UI/UX redesign or broad dashboard polish.
- CRM redesign or agent-workspace redesign.
- Product analytics expansion.
- `apps/web/src/proxy.ts` edits.
- Canonical route renames.
- Auth, routing, tenancy, portal, or schema refactors.
- Stripe reintroduction.

## Evidence Contract

The closeout evidence must record:

- Production base URL and canonical pilot host tested.
- Vercel deployment URL or equivalent deployment identifier.
- Deployed commit SHA or release tag.
- Production environment posture summary with secrets redacted.
- Database backup or recovery-point timestamp and owner.
- Rollback target and rollback owner.
- Paddle production posture result.
- Observability and alert owner result.
- Smoke command output, screenshots, traces, or exact reproduction steps for any blocker or
  must-fix finding.
- Final go/no-go decision, decision owner, and date.

## Suggested Smoke Commands

Set real production values before running any production smoke:

```bash
export P22_PRODUCTION_BASE_URL="https://example.com"
export P22_PILOT_HOST="pilot.example.com"
export P22_EXPECTED_COMMIT_SHA="$(git rev-parse HEAD)"
```

Then run the narrow deterministic repo checks first:

```bash
git diff --check
pnpm plan:status
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
pnpm verify-slice -- --static
```

Production-host smoke should use the existing deterministic Playwright/auth fixtures or the
smallest repo-native smoke command available for the deployment target. If production secrets or
live credentials are unavailable in the local environment, record that as a launch-operations
blocker instead of simulating success.

## Acceptance Criteria

- P22 and P22-GO01 are promoted in the canonical program and tracker.
- Production deployment identity is recorded with URL, deployment reference, and commit SHA.
- Production environment and secret posture is checked without exposing secret values.
- DNS and tenant-host mapping are proven for the production host and pilot host.
- Database backup, rollback target, rollback owner, and post-rollback validation path are recorded.
- Paddle production posture is verified for the launch billing path.
- Observability, alerting, and incident decision ownership are confirmed.
- Production smoke evidence covers public, pricing, login-redirect, member, agent, staff, admin,
  and unified-agent surfaces.
- Any blocker prevents live traffic until fixed in a separate authorized slice or explicitly
  accepted by the launch decision owner with written risk ownership.

## Verification Order

1. Deterministic docs and tracker gates.
2. `pnpm verify-slice -- --static`.
3. Pre-PR reviewer pool for QA, operations, security, and release-governance review.
4. Fix all blocker or must-fix reviewer findings.
5. `pnpm verify-slice -- --required-gates` unless the slice remains docs-only and required-gate
   policy explicitly skips non-product changes.
6. PR checks, Copilot, Sonar, and reviewer comments.
7. Merge, sync main, Notion/tracker closeout, and branch cleanup.

## Go/No-Go Rule

Passing this repository slice means the production go-live readiness checklist exists and is
canonically governed. It does not by itself open live traffic. Live traffic opens only after the
real production evidence contract above is completed with no unresolved blocker.
