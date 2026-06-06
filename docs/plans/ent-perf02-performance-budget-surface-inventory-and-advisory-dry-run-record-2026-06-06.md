---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-PERF02 Performance Budget Surface Inventory And Advisory Dry-Run Record - 2026-06-06

> Status: Input document. This record selects the first route/storage surface for future
> performance-budget proof and records the current advisory dry-run blocker. It does not install a
> CI gate, run production load, change runtime code, or claim full enterprise performance readiness.

## Identity

- Slice id: `ENT-PERF02`
- Environment inspected: local repo checkout at `2628e709e6511acf5205ff3163ac3c9a2a762590`
- Selected route surface: `/api/uploads`
- Selected storage workflow: initial claim-wizard upload-intent signed URL preparation
- Advisory dry-run target: not available
- Fixture tenant/users/session: not available
- Executed by: Codex repo operator
- Decision owner: platform
- Production traffic affected: no

## Selection Rationale

`ENT-PERF01` required the first proof slice to select one protected route and one storage workflow.
The smallest valuable first surface is the initial claim-wizard upload path because it is already
repo-evidenced, protected, storage-adjacent, and bounded:

- `docs/reviews/2026-04-25-sensitive-route-ownership-map.md` names "Initial claim-wizard uploads"
  as a sensitive surface owned by claims intake and upload safety.
- `apps/web/src/app/api/uploads/route.ts` rate-limits before session work, requires a session,
  validates request shape, resolves the configured evidence bucket, and returns signed-url responses
  through the signed-url exposure boundary.
- `apps/web/src/app/api/uploads/_core.ts` validates MIME and size, resolves tenant identity through
  `ensureTenantId`, checks optional claim ownership or assigned-agent access, builds tenant evidence
  paths, creates an upload-intent token for unassigned claim evidence, and calls
  `createTenantSignedUploadUrl`.
- `apps/web/src/features/claims/upload/server/storage-path.ts` defines the tenant evidence path
  shape for initial uploads:
  `pii/tenants/<tenantId>/claims/<actorId>/unassigned/<fileId>-<safeName>`.
- `apps/web/src/features/claims/upload/server/initial-claim-upload.ts` verifies the upload-intent
  token and validates stored object metadata before submitted evidence is accepted.
- Existing unit tests cover unauthenticated, invalid, oversized, unsupported MIME, claim-missing,
  forbidden, assigned-agent, and signed-upload success behavior.

## Required Dry-Run Shape

The first advisory run for this surface must be aggregate-only and non-blocking:

| Field            | Required value                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Target           | Local, preview, or staging URL; no production load                                              |
| Route            | `POST /api/uploads`                                                                             |
| Auth             | Fixture member session, plus optional assigned-agent session for claim-bound upload             |
| Fixture data     | Synthetic tenant, user, optional claim id, and evidence bucket; no raw PII or document contents |
| Payload          | Synthetic `fileName`, `fileType`, `fileSize`, optional `claimId`                                |
| Storage workflow | Signed upload URL creation and initial upload-intent generation only                            |
| Sampling         | Warmup count, sample count, concurrency, timeout, and retry policy recorded before running      |
| Output           | p50, p95, p99, min, max, error count, timeout count, and truncated aggregate summary only       |
| Decision         | Advisory pass/fail/blocked with owner sign-off                                                  |

Candidate first-run budgets remain advisory until variance is proven. A future proof may set exact
thresholds only after it records the target hardware/runtime, fixture seed, auth source, command,
warmup, sample count, and false-positive handling.

## Advisory Dry-Run Attempt

No route-latency run was executed. The repo thread made read-only local availability checks:

```bash
curl --max-time 2 --silent --show-error --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:3000/api/uploads
curl --max-time 2 --silent --show-error --output /dev/null --write-out '%{http_code}\n' http://localhost:3000/api/uploads
```

Both printed HTTP code `000` via `--write-out` and emitted connection-refused errors, proving no
local web target was listening on the default development port at the time of the attempt. Because
this was an availability probe only, the future runner must use `POST` for route measurements.
`.env.local` exists and contains relevant DB, Supabase, S3, and E2E key names, but this record
intentionally did not print or use secret values.

## Result

- Decision: surface inventory recorded; advisory dry-run blocked.
- Blocking findings:
  - No isolated running local, preview, or staging target was available.
  - No deterministic fixture tenant/user/session was supplied for an authenticated route run.
  - No safe measurement command exists yet that can create aggregate-only performance evidence for
    this route/storage workflow without exposing secrets, signed URLs, or file contents.
  - Storage-provider availability was not verified because no safe target/session/command existed.
- Non-blocking findings:
  - The selected route and storage workflow are narrow enough for a first advisory performance
    proof.
  - Existing functional tests prove the selected surface's route, boundary, access, path, and intent
    contracts, but they are not latency evidence.

## Acceptance Criteria Disposition

| `ENT-PERF01` criterion                                              | ENT-PERF02 disposition                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| Select one protected route                                          | Satisfied: `POST /api/uploads`.                          |
| Select one storage workflow                                         | Satisfied: initial upload-intent signed URL preparation. |
| Record fixture and command requirements                             | Satisfied as required dry-run shape.                     |
| Run non-blocking advisory dry-run or record exact blocker           | Blocked with target, fixture, session, and tooling gaps. |
| Avoid production load and runtime/auth/tenancy/schema/proxy changes | Satisfied.                                               |
| Claim release-blocking performance readiness                        | Not satisfied and intentionally not claimed.             |

## Next Repo-Owned Slice

The next unblocked repo-owned enterprise slice should be:

`ENT-PERF03 Initial Upload Performance Advisory Runner Contract`

That slice should author or designate a repo-owned non-blocking performance runner contract for
this surface. It should fail as `blocked` when target URL, fixture session, seed identity, or safe
output path is missing, and when supplied it should emit aggregate-only
p50/p95/p99/error/timeout metrics. It must not install a blocking CI gate, run production load,
persist signed URLs, expose secrets or raw PII, or change runtime behavior, auth, tenancy, routing,
billing, product UI, proxy, schema, RLS, README, AGENTS, or broad architecture docs.
