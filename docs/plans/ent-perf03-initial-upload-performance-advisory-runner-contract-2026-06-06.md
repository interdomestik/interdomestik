---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-PERF03 Initial Upload Performance Advisory Runner Contract - 2026-06-06

> Status: Input document. This record closes the repo-owned runner-contract slice for the first
> upload performance advisory surface. It does not install a blocking CI gate, run production load,
> change runtime behavior, or claim release-blocking performance readiness.

## Identity

- Slice id: `ENT-PERF03`
- Predecessor: `ENT-PERF02 Performance Budget Surface Inventory And Advisory Dry-Run Record`
- Route surface: `POST /api/uploads`
- Storage workflow: initial claim-wizard upload-intent signed URL preparation
- Runner command: `node scripts/performance-upload-advisory.mjs`
- Runner implementation: `scripts/performance-upload-advisory.mjs`
- Contract tests: `scripts/ci/performance-upload-advisory.test.mjs`
- Production traffic affected: no

## Runner Contract

The runner is intentionally advisory and fail-closed:

- It is intentionally not wired into `pr:verify`, `slice:verify`, `check:static`, CI, or PR
  finalizer.
- It requires an explicit non-production target URL, fixture session cookie, fixture tenant id,
  fixture actor id, and output path under `tmp/performance`.
- The fixture session is read only from `ENT_PERF_UPLOAD_SESSION_COOKIE`; it is not accepted through
  command-line arguments.
- It rejects production `interdomestik.com` targets.
- It writes a structured `blocked` report and exits `2` when required prerequisites are missing.
- When prerequisites are supplied, it performs warmup plus sequential sample POSTs to `/api/uploads`
  with synthetic file metadata only.
- It records only aggregate metrics: min, max, p50, p95, p99, error count, timeout count, sample
  count, warmup count, concurrency, timeout, fixture ids, surface, and target host.
- It does not persist response bodies, signed URLs, cookies, raw file contents, raw PII, or request
  headers.

## Local Proof

Focused contract proof:

```bash
node --test scripts/ci/performance-upload-advisory.test.mjs
node scripts/performance-upload-advisory.mjs
```

Covered behavior:

- Missing target/session/fixture/output prerequisites produce `status: "blocked"` and exit `2`.
- Unsafe output paths outside `tmp/performance` produce `status: "blocked"` and do not echo the
  fixture session value.
- A synthetic local HTTP server can return a dummy signed-url response while the runner records only
  aggregate latency metrics and excludes the signed URL and session cookie from stdout, stderr, and
  the output report.
- Direct blocked-mode invocation emits structured `blocked` JSON and exits `2` when no target,
  session, fixture ids, or output path are supplied.

## Acceptance Criteria Disposition

| Criterion                                                                            | Disposition |
| ------------------------------------------------------------------------------------ | ----------- |
| Repo-owned non-blocking performance runner contract exists                           | Satisfied   |
| Missing target/session/seed/output prerequisites fail as `blocked`                   | Satisfied   |
| Supplied fixture emits aggregate p50/p95/p99/error/timeout metrics                   | Satisfied   |
| Signed URLs, secrets, raw PII, and response bodies are not persisted                 | Satisfied   |
| Blocking CI gate, production load, or runtime behavior change is avoided             | Satisfied   |
| Auth, tenancy, routing, billing, product UI, proxy, schema, and RLS remain unchanged | Satisfied   |

## Residual Risk

This slice proves the runner contract and safety envelope, not real route/storage performance.
Actual advisory latency evidence still needs an isolated non-production target, fixture session,
fixture tenant/user, storage-provider availability, and owner-approved output location.

## Next Repo-Owned Slice

The next bounded enterprise slice should be:

`ENT-PERF04 Initial Upload Performance Advisory Dry-Run Evidence`

That slice should run `node scripts/performance-upload-advisory.mjs` against an isolated local,
preview, or staging target with a synthetic fixture tenant/user/session and safe output path. If
those prerequisites are still unavailable, it should record the runner's structured `blocked` output
rather than simulating success. It must not install a blocking CI gate, run production load, persist
signed URLs, expose secrets or raw PII, or change runtime behavior, auth, tenancy, routing, billing,
product UI, proxy, schema, RLS, README, AGENTS, or broad architecture docs.
