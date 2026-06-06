---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-PERF01 Performance Regression Gate Evidence Contract - 2026-06-06

> Status: Input document. This contract scopes the evidence required before Interdomestik can
> claim representative route and storage performance budgets are release-blocking. It does not add
> a CI gate, run load against production, change runtime code, or claim full enterprise readiness.

## Identity

- Slice id: `ENT-PERF01`
- Environment inspected: local repo checkout at `cc4bfd8a9efcd36601fe7278d8de0f713363d30d`
- Performance target, fixture tenant/users, and candidate blocking gate: not available or not run
- Executed by: Codex repo operator
- Decision owner: platform
- Production traffic affected: no

## Current Evidence

Repo evidence shows strong functional and security gating, but not release-blocking performance
budgets for representative protected routes and storage workflows:

- `docs/reviews/2026-04-25-production-professionalism-rereview.md` records the performance
  regression gate as "Not yet scoped" and says representative load/performance budgets are not yet
  PR-blocking gates. Its enterprise rubric requires those budgets to gate merges.
- `docs/reviews/2026-04-25-sensitive-route-ownership-map.md` names sensitive route owners,
  boundary contracts, failure contracts, and proof for protected budget candidates.
- `docs/plans/ent-alert05-d07-provider-supported-notification-proof-2026-06-06.md` records a
  configured Sentry latency alert for `[D07] SLO3 Core API latency p95 (/api/claims)`, but alerting
  is runtime observation, not a PR-blocking regression gate.
- Historical root scripts and evidence folders such as `load-test.js`, `stress-test-production.js`,
  `comprehensive-load-test.sh`, `load-test-evidence/**`, and `stress-test-evidence/**` prove there
  has been load-test exploration. They are not currently a canonical enterprise performance gate
  because they do not define budgets, fixtures, variance, ownership, or PR-blocking integration.
- `packages/qa/src/tools/audits/performance.ts` currently checks only a light Next.js performance
  audit surface and does not measure route/storage latency budgets.

## Scope

In scope:

- Representative protected API routes from the sensitive route ownership map.
- Non-production, preview, or local fixture environments with recorded commit, base URL, tenant,
  roles, seed identity, sample count, warmup count, concurrency, and command.
- Explicit budgets for p50, p95, p99, timeout rate, error rate, and maximum total runtime.
- Pass/fail decision ownership, blocker capture, and variance disposition before a gate can become
  release-blocking.
- Representative storage workflows that create, validate, sign, or download tenant-scoped objects.

Out of scope:

- Production load generation or production traffic mutation.
- Adding a PR-blocking CI gate in this slice.
- Runtime route, auth, tenancy, billing, product UI, schema, RLS, or proxy changes.
- Raw PII, claim narratives, document contents, signed URLs, private recipient data, or secrets.

## Candidate Budget Surfaces

The first performance gate should cover at least one protected route and one storage workflow.

| Candidate surface                  | Repo evidence                                   | Budget focus                                                   |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| Core claims API                    | D07 `/api/claims` latency alert and route map   | Authenticated latency, error rate, timeout rate                |
| Initial claim-wizard uploads       | `/api/uploads` route and initial-upload tests   | Signed upload intent creation and validation latency           |
| Authenticated evidence uploads     | `/api/claims/evidence-upload` and upload tests  | Multipart validation, storage preparation, confirmation errors |
| Document signed URLs and downloads | `/api/documents/[id]` route and release proof   | Signed-url/download latency and forbidden-response latency     |
| Admin verification details         | `/api/verification/[id]` and threat model       | Privileged joined-read latency and timeout rate                |
| Assisted registration              | `/api/register` and assisted-registration model | Rate-limited registration latency and overload behavior        |
| Paddle webhook ingestion           | Paddle webhook route tests and threat model     | Signature verification and idempotent replay latency           |

## Required Evidence Record

Every future performance proof must store a bounded, sanitized record with this shape:

| Field               | Required content                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Identity            | Slice id, run id, commit, branch, target, base URL, date, executor, owner, and decision                |
| Fixture context     | Tenant alias, role aliases, seeded counts, and seed command without secrets or raw PII                 |
| Surface and command | Route/workflow, owner, auth role, method, tool version, concurrency, warmup, samples, timeout, retries |
| Budgets and results | p50, p95, p99, error rate, timeout rate, max runtime, measured values, and truncated raw summary       |
| Variance and safety | Repeat policy, allowed variance, noisy-run handling, advisory/blocking mode, and redaction proof       |
| Decision            | Pass, fail, blocked, or advisory-only, with owner sign-off and follow-up                               |

## Gate Promotion Rules

A performance check may become PR-blocking only after all of these are true:

- The check runs against an isolated local, preview, staging, or other non-production target.
- The fixture tenant and users are deterministic and can be recreated without production data.
- The proof includes at least one protected route and one storage workflow.
- Budgets are recorded before measurement and are not weakened after a failing run in the same PR.
- At least one advisory dry-run has been recorded, including variance and false-positive
  disposition.
- The gate fails closed for missing fixture identity, missing auth, missing command configuration,
  route failures, timeout-rate breach, error-rate breach, or p95/p99 budget breach.
- The output artifact is bounded and stores only aggregate metrics, redacted route names, aliases,
  hashes, or synthetic ids.
- The owner records whether the gate is advisory, blocking for touched surfaces only, or blocking
  for all PRs.

## First Dry-Run Requirements

The next proof slice should not install a blocking gate immediately. It should first create or select
one non-production measurement path and record advisory output for:

- one protected route from the sensitive route ownership map; and
- one storage workflow for upload intent, evidence upload, signed URL, or document download.

If an isolated target, fixture identities, authenticated session source, storage provider target, or
safe measurement command is missing, the proof must record the exact blocker instead of simulating
success.

## Result

- Decision: performance regression gate evidence contract scoped.
- Blocking findings: no isolated performance target, fixture tenant/users, authenticated session
  source, storage provider target, or advisory dry-run variance proof was supplied.
- Non-blocking findings: repo evidence identifies enough route/storage candidates to start a bounded
  advisory dry-run; Sentry latency alerting and historical load-test scripts can inform budgets but
  are not themselves release-blocking proof.

## Acceptance Criteria Disposition

Satisfied here: performance-gate gap scoped from repo evidence; first protected route and storage
candidates named; required evidence fields, safety exclusions, and blocking-gate promotion rules
defined; runtime, route, auth, tenancy, proxy, schema, and CI behavior left intact.

Not satisfied and intentionally not claimed here: advisory dry-run execution, blocking gate
installation, or full enterprise performance readiness.

## Next Repo-Owned Slice

The next unblocked repo-owned enterprise slice should be:

`ENT-PERF02 Performance Budget Surface Inventory And Advisory Dry-Run Record`

That slice should select the first protected route and first storage workflow from this contract,
record deterministic fixture and command requirements, and either run a non-blocking advisory
performance dry-run in an isolated target or record the exact fixture/provider/tooling blocker. It
must not install a blocking CI gate, run production load, or change runtime behavior, auth, tenancy,
routing, billing, product UI, proxy, schema, RLS, README, AGENTS, or broad architecture docs.
