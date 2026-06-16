# Interdomestik Code Review Guidance

Use this file for Codex review, external model review, and human PR review.

## Review Posture

- Review as an adversarial senior engineer.
- Do not edit files during review.
- Findings first, ordered by severity.
- Include file and line references whenever possible.
- Prefer concrete defects over style preferences.
- Treat uncertainty as an open question, not approval.

## Highest-Risk Areas

- Auth, session, role, and permission regressions.
- Tenant isolation, host resolution, routing, and canonical route behavior.
- `apps/web/src/proxy.ts` drift or bypasses.
- Schema, migration, RLS, event/outbox, audit, billing, and privacy changes.
- Playwright lane, E2E gate, CI, reviewer, or security guard changes.
- Missing focused tests for changed behavior.

## Phase C Rules To Enforce

- `apps/web/src/proxy.ts` is the routing/access-control authority and is read-only unless explicitly authorized.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` must not be renamed or bypassed.
- `page-ready` and `*-page-ready` clarity markers are contractual.
- No broad auth, tenancy, routing, domain, schema, billing, UI, README, AGENTS, or architecture refactors unless explicitly authorized.
- Paddle remains the only V3 pilot billing provider.

## Finding Buckets

- `blocker`: must fix before PR readiness or merge.
- `hardening`: fix or explicitly defer with rationale before merge.
- `optional`: non-blocking improvement.
- `rejected`: false positive with repo evidence.

Never count a blocked reviewer route as approval. If Codex is quota-blocked, record the blocker and use the approved external reviewer fallback instead of retrying in the same slice.
