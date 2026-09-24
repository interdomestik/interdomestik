# Interdomestik Code Review Guidance

Use this file for Codex review, external model review, and human PR review.
Use repo-owned reviewer scripts for model routes: `pnpm review:sonnet`,
`pnpm review:gemini`, and `pnpm review:opus`. Do not open-code raw `claude` or
`gemini` commands in slice playbooks. Codex remains the executor/verifier for
accepted findings and security scans, not a senior reviewer route.

These are supported routes, not a mandatory panel. Select review depth from the
changed risk and reuse accepted evidence while its inputs remain unchanged.

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

## Review Selection

- Routine deterministic instruction or isolated-module work needs no fixed external-model ritual.
  Use one subscription route when independent input would materially improve the result.
- For coupled medium-risk work, give one reviewer a bounded integration focus. Add a second route
  only for a distinct test, counterexample or boundary question.
- Auth/session, tenant/RLS, schema/migration, billing, concurrency/data-loss, routing or CI trust
  changes require independent review separate from implementation judgment. Escalate to a more
  capable route only for a concrete unresolved risk; model brand alone is not a gate.
- A review must bind to the current candidate identity. Changed source or relevant configuration
  invalidates prior review only where its evidence inputs changed.
- Verify the actually served provider/model. Accepted same-input helper evidence satisfies its role;
  do not request a redundant whole-context review.

Never count a blocked reviewer route as approval. If an external reviewer route
is quota-blocked, record the blocker and use an approved adequate alternative.
Low/medium-risk work needs no routine owner-waiver ceremony solely because one
provider is exhausted. Do not retry useful advisory analysis solely to repair
terminal formatting. High-risk work still requires independent scrutiny before delivery.
Each route receipt must preserve route name, provider/model, command invoked,
started/ended timestamps, elapsed time, `ran | blocked | skipped | failed`
status, blocker reason, exit code, first-output timeout, total timeout, and
fallback winner when applicable.
