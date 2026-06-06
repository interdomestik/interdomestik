---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-PERF04 Initial Upload Performance Advisory Dry-Run Evidence - 2026-06-06

> Status: Input document. This record executes the `ENT-PERF03` runner path for the first
> upload-performance advisory surface and records the current fixture blocker. It does not install a
> blocking CI gate, run production load, change runtime behavior, or claim release-blocking
> performance readiness.

## Identity

- Slice id: `ENT-PERF04`
- Predecessor: `ENT-PERF03 Initial Upload Performance Advisory Runner Contract`
- Route surface: `POST /api/uploads`
- Storage workflow: initial claim-wizard upload-intent signed URL preparation
- Runner command: `node scripts/performance-upload-advisory.mjs`
- Advisory dry-run target: not available
- Fixture session: not available
- Fixture tenant id: not available
- Fixture actor id: not available
- Safe output path used: `tmp/performance/ent-perf04-blocked.json`
- Executed by: Codex repo operator
- Decision owner: platform
- Production traffic affected: no

## Dry-Run Attempt

No authenticated route-latency request was sent because no isolated non-production target, fixture
session, fixture tenant id, or fixture actor id was available in the current repo thread
environment.

The runner was still executed with a safe output path so the blocked path was proven by the
repo-owned contract instead of inferred manually:

```bash
node scripts/performance-upload-advisory.mjs \
  --out=tmp/performance/ent-perf04-blocked.json
```

The command exited with code `2`, emitted no stderr, wrote the same structured report to stdout and
the safe output path, and did not expose a session cookie, signed URL, response body, request
header, file content, or raw PII.

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

The temporary `tmp/performance/ent-perf04-blocked.json` file was not committed. The repo evidence is
this sanitized record and the local verification command output.

## Result

- Decision: advisory dry-run blocked, not failed.
- Blocking findings:
  - No isolated local, preview, or staging target URL was available.
  - No fixture session cookie was available through `ENT_PERF_UPLOAD_SESSION_COOKIE`.
  - No fixture tenant id was supplied.
  - No fixture actor id was supplied.
  - Storage-provider availability could not be measured without a valid target and authenticated
    fixture.
- Non-blocking findings:
  - The runner fails closed with a structured `blocked` report.
  - The safe output path contract works for evidence capture under `tmp/performance`.
  - No production host, production load, runtime route behavior, or storage object was touched.

## Acceptance Criteria Disposition

| `ENT-PERF03` follow-up requirement                                      | ENT-PERF04 disposition                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| Run the runner against isolated local, preview, or staging target       | Blocked; no target URL available.                              |
| Use synthetic fixture tenant, actor, and session                        | Blocked; no fixture identity or session available.             |
| Store output only under a safe path                                     | Satisfied for the blocked proof.                               |
| Record structured blocked output instead of simulating success          | Satisfied.                                                     |
| Avoid production load, signed URLs, secrets, raw PII, and response body | Satisfied; no route request was sent and no secret was stored. |
| Avoid runtime, auth, tenancy, routing, billing, UI, proxy, schema, RLS  | Satisfied.                                                     |

## Residual Risk

This record proves blocked-mode execution, not latency. The performance regression lane still needs
an isolated non-production target, fixture member or agent session, fixture tenant and actor ids,
storage-provider availability, owner-approved sample settings, and aggregate latency output before
any advisory budget can be evaluated.

## Next Repo-Owned Slice

The next bounded enterprise slice should be:

`ENT-PERF05 Initial Upload Performance Fixture Readiness Handoff`

That slice should convert the current blocker into a named fixture-readiness handoff: target URL,
fixture tenant id, fixture actor id, fixture session creation/expiry owner, storage-provider
availability, sample settings, output path, and pass/fail owner. It may record that operator or
provider access is still unavailable, but it must not run production load, persist secrets or signed
URLs, install a blocking CI gate, or change runtime behavior, auth, tenancy, routing, billing,
product UI, proxy, schema, RLS, README, AGENTS, or broad architecture docs.
