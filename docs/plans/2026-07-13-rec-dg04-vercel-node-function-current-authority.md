---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-13
related:
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/plans/2026-07-13-rec-02-closeout.md
  - tools/review-evidence-console/docs/rec-02-preview-runbook.md
---

# REC-DG04 Current Authority: Vercel Node Function Compatibility

> Status: current-authority/design gate. This record promotes exactly one
> implementation slice: `REC-02a`.

## Decision

`REC-02` is complete in PR `#1335` and closeout PR `#1336`. Its first governed
preview attempt on 2026-07-13 proved that Vercel's generic project packaged the
root `middleware.js` as an Edge Function and rejected the Node-only authentication
dependencies `node:crypto` and `node:net`. No working preview or production alias
change resulted. The live alias still serves the prior REC-01 deployment.

This Tier 0 gate promotes one Tier 3 compatibility fix:

`REC-02a` — replace the generic Edge middleware deployment entrypoint with one
Node.js Vercel Function for `/api/*`, preserving the existing private Fetch
handler and every REC-02 authentication, isolation, receipt, and logging boundary.

## Evidence Before Promotion

- AI OS reports `authority=current`, `activeSlice=none`, and
  `runtime=not_authorized` after the REC-02 closeout.
- The exact clean source is `origin/main` at closeout merge
  `888a3fc24e9e055fe403edca8f1c4f16a90219f6`.
- Local proof passed `426` unit tests, `13` browser tests, fixture parity, and
  client/deployment leakage scans.
- Vercel project pins match team `team_zZnOjQLylAZArqxcUhLbHDHc`, project
  `prj_Yn7w7tQEAJYaALs2gL2FR9UWgHCc`, and `interdomestik-reviewer-portal`.
- Preview-only named-account, session, and Ed25519 configuration validates without
  exposing values. Vercel Authentication is preview-only.
- Active Firewall rule `rule_rec_02_login_5_per_minute_HMe7w4` matches only
  `POST /api/session/login` and applies a fixed-window limit of five requests per
  source IP per 60 seconds.
- `vercel@55.0.0 build --target preview` passed and its 178-file deployment
  leakage scan passed. Remote validation then stopped on the Edge runtime's
  unsupported Node modules before a usable deployment was produced.

## Promoted Scope

REC-02a may change only `tools/review-evidence-console/`, focused console tests,
repo-size budget data, and required tracker/closeout records. It may:

- add one `api/` Node.js Vercel Function using the Web-standard Fetch export;
- route `/api` and `/api/*` to that single function with a narrow Vercel rewrite;
- remove or relocate the root deployment middleware entrypoint so it cannot be
  bundled as Edge code;
- preserve the existing `createEnvironmentPortalHandler` implementation rather
  than duplicating authentication or receipt logic;
- prove original path, query, method, body, cookie, origin, private/no-store
  headers, bounded events, and fail-closed configuration behavior;
- update the protected-preview runbook and repeat one protected preview attempt.

The implementation is test-first. It must keep every new or changed source file
under 150 lines and pass console verification, deployment leakage, `vercel build`,
the six-login probe, role isolation, signed-receipt verification, alert, and
rollback proof.

## Failure And Deployment Boundary

Stop on any authentication, session, role, fixture, receipt, origin, cache, log,
or path-routing regression. Do not weaken PBKDF2, session binding, Ed25519 signing,
Vercel Authentication, or the Firewall rule to obtain a deployment.

This gate authorizes the compatibility implementation and one protected preview.
It does not authorize reassignment of `reviewer-ecohub.vercel.app`. Production
cutover still requires separate explicit approval after all REC-DG03 preview
identity, isolation, receipt, Firewall, alert, configuration, and rollback proof.

## Exclusions

No `apps/web`, Interdomestik route, proxy, auth, tenant, schema/RLS/migration,
Supabase, database, upload, Blob, customer data, server receipt storage, billing,
email, invitation, password reset, MFA, SSO provider, account-admin UI, MOB runtime,
UI/UX redesign, dependency, lockfile, README, AGENTS, architecture, or production
alias change is authorized.

## Resolver Effect

After this gate lands:

```text
status: ready
activeSlice: REC-02a
```

No other implementation slice is active.
