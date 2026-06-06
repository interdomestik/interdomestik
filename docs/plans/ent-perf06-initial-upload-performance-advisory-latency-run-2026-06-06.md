---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-PERF06 Initial Upload Performance Advisory Latency Run - 2026-06-06

> Status: Input document. This record attempts the first upload-performance advisory latency run
> from `ENT-PERF05` and records the current fixture blocker. It does not run production load,
> install a blocking CI gate, change runtime behavior, or claim performance-budget readiness.

## Identity

- Slice id: `ENT-PERF06`
- Predecessor: `ENT-PERF05 Initial Upload Performance Fixture Readiness Handoff`
- Route surface: `POST /api/uploads`
- Storage workflow: initial claim-wizard upload-intent signed URL preparation
- Runner command: `node scripts/performance-upload-advisory.mjs`
- Safe output path used: `tmp/performance/ent-perf06-blocked.json`
- Executed by: Codex repo operator
- Decision owner: platform
- Production traffic affected: no

## Fixture Readiness Check

No fixture values were present in the repo thread process. The check recorded only boolean presence
and did not print any values:

```json
{
  "ENT_PERF_UPLOAD_TARGET_URL": false,
  "ENT_PERF_UPLOAD_OUTPUT_PATH": false,
  "ENT_PERF_UPLOAD_TENANT_ID": false,
  "ENT_PERF_UPLOAD_ACTOR_ID": false,
  "ENT_PERF_UPLOAD_SAMPLES": false,
  "ENT_PERF_UPLOAD_WARMUP": false,
  "ENT_PERF_UPLOAD_TIMEOUT_MS": false,
  "ENT_PERF_UPLOAD_SESSION_COOKIE": false
}
```

## Latency Run Attempt

The runner was executed with a safe output path so the current blocker was proven through the
repo-owned contract:

```bash
node scripts/performance-upload-advisory.mjs \
  --out=tmp/performance/ent-perf06-blocked.json
```

The command exited with code `2`, emitted no stderr, wrote the same structured report to stdout and
the safe output path, and did not send an authenticated route request.

Structured blocked output:

```json
{
  "status": "blocked",
  "surface": "POST /api/uploads",
  "reasons": [
    "missing target URL",
    "missing fixture session env ENT_PERF_UPLOAD_SESSION_COOKIE",
    "missing fixture tenant id",
    "missing fixture actor id"
  ]
}
```

The temporary `tmp/performance/ent-perf06-blocked.json` file was removed and is not committed.

## Result

- Decision: advisory latency run blocked, not failed.
- Blocking findings:
  - No isolated local, preview, or staging target URL was supplied.
  - No short-lived fixture session cookie was supplied through
    `ENT_PERF_UPLOAD_SESSION_COOKIE`.
  - No synthetic fixture tenant id was supplied.
  - No synthetic fixture actor id was supplied.
  - Storage-provider behavior could not be measured without an authenticated non-production target.
- Non-blocking findings:
  - The runner still fails closed with a structured `blocked` report.
  - The safe output path contract works under `tmp/performance`.
  - No production host, production load, signed URL, response body, request header, file content,
    session value, or raw PII was touched.

## Acceptance Criteria Disposition

| `ENT-PERF05` follow-up requirement                 | ENT-PERF06 disposition                                      |
| -------------------------------------------------- | ----------------------------------------------------------- |
| Execute only after non-production target exists    | Blocked; no target URL available.                           |
| Use fixture tenant, actor, and session             | Blocked; no fixture identity or session available.          |
| Use safe output under `tmp/performance`            | Satisfied for the blocked proof.                            |
| Record exact blocker instead of simulating latency | Satisfied.                                                  |
| Avoid production load and persisted secrets        | Satisfied; no authenticated route request was sent.         |
| Avoid runtime, auth, tenancy, routing, UI, schema  | Satisfied; only documentation and repo-size budget changed. |

## Residual Risk

This record does not prove p50, p95, p99, error rate, timeout rate, storage-provider behavior, or
variance. The performance regression lane cannot move to an advisory budget decision or blocking
gate proposal until an operator supplies an isolated target, a short-lived fixture session, fixture
tenant and actor ids, and a non-production storage target.

## Next Repo-Owned Slice

The performance lane is now blocked on external fixture and target readiness. The next unblocked
repo-owned enterprise slice should move to the open supply-chain evidence gap:

`ENT-SCA04 Deploy Digest Provider Verification Evidence Attempt`

That slice should inspect the latest available non-production deploy evidence and record whether
the deploy provider or webhook returned a running image digest that matches the build-attested
digest. If provider evidence is unavailable, it should record the exact blocker instead of
simulating deploy equality. It must not change production credentials, perform production deploys,
alter runtime behavior, auth, tenancy, routing, billing, product UI, proxy, schema, RLS, README,
AGENTS, or broad architecture docs.
