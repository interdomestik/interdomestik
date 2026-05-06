# P33-DG01 Production Maturity 10/10 Roadmap

## Metadata

- Date: 2026-05-06
- Slice: `P33-DG01`
- Status: Complete
- Owner: `platform + security + qa`
- Purpose: convert the updated production-professionalism re-review into a repo-canonical
  maturity roadmap without blocking the already-promoted `P32-CRM09` product slice.

## Scope Boundary

This is a roadmap and design-gate slice only. It does not authorize product-code changes, schema
migrations, proxy changes, auth or tenancy refactors, canonical route changes, Stripe
reintroduction, README, AGENTS, or architecture-doc changes.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing `*-page-ready`
clarity markers remain contractual. `apps/web/src/proxy.ts` remains the sole routing,
access-control, and tenant-isolation authority.

## Evidence Reviewed

| Evidence                                                                                                                          | Finding                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/reviews/2026-04-25-production-professionalism-rereview.md`                                                                  | The April re-review is now annotated with a 2026-05-06 follow-up: `P17` closed the application-layer gaps, while the remaining path to `10/10` is categorical maturity work.                            |
| `docs/security/csp-nonce-migration.md`                                                                                            | CSP nonce migration is already designed. Runtime CSP still permits `'unsafe-inline'` until the report-only and enforcement phases land.                                                                 |
| `packages/database/src/db.ts`                                                                                                     | Production refuses to run without `DATABASE_URL_RLS`, but there is no startup assertion that the connected role has `rolbypassrls = false`.                                                             |
| `packages/database/src/tenant.ts`                                                                                                 | `withTenantContext` sets local role, row security, tenant context, and optional user role, but usage is not yet enforced at the build layer for every sensitive direct DB call.                         |
| `scripts/check-db-access-guard.mjs`                                                                                               | Direct DB access is baseline-guarded, but the guard does not yet prove sensitive callsites execute inside `withTenantContext`.                                                                          |
| `apps/web/src/app/api/uploads/_core.ts`, `apps/web/src/app/api/documents/[id]/_core.ts`, `apps/web/src/lib/ai/claim-workflows.ts` | Several storage paths still use admin/service-role storage clients. Application invariants are stronger after `P17`, but storage-backend isolation remains a separate maturity category.                |
| `docs/MATURITY_ASSESSMENT_2026.md`                                                                                                | The older assessment already flags missing backup restore drills, no threat model, and alerting maturity gaps. Some alert scripts now exist, but operational proof remains separate from code presence. |
| `docs/plans/current-tracker.md`                                                                                                   | `P32-CRM09` is already promoted and pending. Any maturity roadmap must not accidentally supersede that product slice.                                                                                   |

## Decisions

### 1. Do Not Treat 10/10 As One Implementation

Decision: the `10/10` production-professionalism target is a multi-tranche maturity roadmap, not a
single implementation slice.

The categories include edge enforcement, connection-layer tenancy, storage isolation, auth
orchestration completion, alerting-backed observability, supply-chain attestation,
backup/restore drills, threat modeling, incident drills, data lifecycle automation, performance
budgets, and repo hygiene. Collapsing those into one branch would be unreviewable and would widen
well beyond Phase C slice discipline.

### 2. P17 Closed The Application-Layer Gaps

Decision: the April re-review remains useful history, but its main application-layer blockers below
9/10 are no longer current unresolved risks on `main`.

`P17-PR01` through `P17-PR06` closed legacy claim-wizard upload binding, tenant-boundary API
contracts, push-subscription endpoint collisions, sensitive-route ownership mapping, verification
route contracts, and share-pack route contracts. The next maturity work should therefore target
category closure rather than re-opening those fixed findings.

### 3. Do Not Block CRM09 On All Maturity Categories

Decision: `P32-CRM09 Member Support Handoff Reply` remains the pending product implementation slice
promoted by `P32-DG14`.

The production-maturity roadmap should not block CRM09 on supply-chain attestation, restore drills,
threat modeling, repo pruning, performance budgets, or other broad maturity categories. Those are
valuable, but they are not prerequisites for the scoped support-handoff reply implementation.

It is reasonable to run one small security hardening slice before CRM09 if the team wants to reduce
tenant-defense risk first. That hardening slice must be narrow, independently reviewable, and must
not reopen proxy, route, auth, tenancy architecture, schema unrelated to the slice, Stripe,
Relationship, Matter, TrustSignal, README, AGENTS, or architecture docs.

## Candidate Ranking

| Rank | Candidate                                                                                                                                                              | Decision                       | Reason                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P33-SEC01 RLS Connection Role Startup Assertion`                                                                                                                      | Promote                        | Smallest high-value tenant-defense hardening: assert at startup that `DATABASE_URL_RLS` connects with a non-`BYPASSRLS` role. This converts an environment assumption into executable proof without touching proxy, routes, product UX, or support-handoff behavior. |
| 2    | `P33-SEC02 CSP Nonce Phase 0 Report-Only`                                                                                                                              | Queue after SEC01 or CRM09     | CSP nonce migration already has an approved design, but the first implementation touches request/response header behavior and browser verification. It is important, but higher blast radius than the DB role assertion.                                             |
| 3    | `P33-DG02 withTenantContext Build Guard Design`                                                                                                                        | Design before implementation   | Build-layer enforcement for `withTenantContext` needs a careful baseline, exemptions, and migration plan so it does not create noisy false positives across existing direct DB callsites.                                                                            |
| 4    | `P33-DG03 Storage RLS Backstop Design`                                                                                                                                 | Design before implementation   | Replacing admin/service-role storage access or moving to a gateway/presigned service is security-relevant and may affect uploads, documents, AI downloads, and policy analysis. It needs its own design gate.                                                        |
| 5    | Operational categories: backup/restore drills, incident drills, alert routing, threat model, SBOM/provenance, data lifecycle checks, performance budgets, repo hygiene | Defer into later bounded gates | These are valid 10/10 categories but not launch blockers for CRM09 and not safe to bundle into one implementation branch.                                                                                                                                            |

## Promoted Slice

Promote exactly one optional pre-CRM09 hardening implementation slice:

**`P33-SEC01 RLS Connection Role Startup Assertion`**

SEC01 should add a startup/runtime assertion that the `DATABASE_URL_RLS` connection's effective
database user cannot bypass row-level security. The implementation should query PostgreSQL for the
current role's `rolbypassrls` posture, fail closed in production if the role bypasses RLS or cannot
be verified, and include focused tests for safe role, bypass role, missing result, and production
failure behavior. It must preserve existing `DATABASE_URL_RLS` requiredness, RLS integration tests,
`withTenantContext` semantics, proxy behavior, canonical routes, auth layering, tenancy
architecture, product UX, schema, Stripe posture, README, AGENTS, and architecture docs.

If the team chooses not to take SEC01 first, the active product queue should resume directly with
`P32-CRM09`.

## Non-Goals

- Implementing all `10/10` categories in one tranche.
- Re-ranking or replacing `P32-CRM09`.
- Editing `apps/web/src/proxy.ts`, canonical routes, auth/tenancy architecture, product runtime,
  schema, Stripe, README, AGENTS, or architecture docs in this roadmap gate.
- Implementing CSP nonce migration, `withTenantContext` build guards, storage RLS replacement,
  auth migration, SBOM/provenance, restore drills, threat models, incident drills, data lifecycle
  jobs, performance budgets, or repo pruning in this PR.

## P33-DG01 Verification Proof

Local verification is completed on branch `codex/production-maturity-roadmap-followup` on
2026-05-06.

| Command                         | Result |
| ------------------------------- | ------ |
| `git diff --check`              | Pass.  |
| `pnpm docs:verify`              | Pass.  |
| `pnpm plan:status`              | Pass.  |
| `pnpm plan:audit`               | Pass.  |
| `pnpm track:audit`              | Pass.  |
| `pnpm verify-slice -- --static` | Pass.  |

Scope audit must stay inside `docs/plans/` and `docs/reviews/`; `apps/web/src/proxy.ts`,
canonical routes, auth/tenancy code, product runtime files, schema files, Stripe surfaces, README,
AGENTS, and architecture docs must not be changed by this design gate.
