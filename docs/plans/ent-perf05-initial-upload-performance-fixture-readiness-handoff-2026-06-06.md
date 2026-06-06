---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-PERF05 Initial Upload Performance Fixture Readiness Handoff - 2026-06-06

> Status: Input document. This handoff converts the `ENT-PERF04` blocked runner proof into a
> concrete fixture-readiness checklist for the first upload-performance advisory run. It does not
> run load, store secrets, install a blocking CI gate, change runtime behavior, or claim
> release-blocking performance readiness.

## Identity

- Slice id: `ENT-PERF05`
- Predecessor: `ENT-PERF04 Initial Upload Performance Advisory Dry-Run Evidence`
- Route surface: `POST /api/uploads`
- Storage workflow: initial claim-wizard upload-intent signed URL preparation
- Runner command: `node scripts/performance-upload-advisory.mjs`
- Handoff owner: platform
- Execution owner needed: named non-production operator
- Decision owner needed: platform or release owner
- Production traffic affected: no

## Current Readiness

The current repo thread still lacks every runtime fixture variable needed for a real advisory
latency run. The check reported only boolean presence and did not print values:

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

Because the target, session, tenant, actor, and storage readiness are unavailable, this slice does
not execute an authenticated route request.

## Required Fixture Handoff

| Requirement             | Handoff value needed                                                                 | Current status |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------- |
| Target URL              | Isolated local, preview, or staging base URL; never production `interdomestik.com`   | Missing        |
| Fixture tenant id       | Synthetic non-production tenant id allowed for upload-intent route testing           | Missing        |
| Fixture actor id        | Synthetic member actor id scoped to the fixture tenant                               | Missing        |
| Fixture session         | Short-lived fixture session supplied only through `ENT_PERF_UPLOAD_SESSION_COOKIE`   | Missing        |
| Session owner           | Named operator responsible for creation, expiry, and revocation                      | Missing        |
| Storage provider target | Non-production evidence bucket/storage target available to the selected environment  | Missing        |
| Output path             | Safe path under `tmp/performance`, for example `tmp/performance/ent-perf06-run.json` | Missing        |
| Sample settings         | Warmup count, sample count, and timeout recorded before running                      | Missing        |
| Pass/fail owner         | Named platform or release owner for advisory result disposition                      | Missing        |

## Operator Packet

The operator who enables the next run must provide the fixture values out of band, without
committing them to the repository or pasting them into PR comments, Notion, logs, or model-review
packets.

Required environment shape:

```bash
export ENT_PERF_UPLOAD_TARGET_URL='<non-production-base-url>'
export ENT_PERF_UPLOAD_OUTPUT_PATH='tmp/performance/ent-perf06-run.json'
export ENT_PERF_UPLOAD_TENANT_ID='<synthetic-tenant-id>'
export ENT_PERF_UPLOAD_ACTOR_ID='<synthetic-member-actor-id>'
export ENT_PERF_UPLOAD_SESSION_COOKIE='<short-lived-fixture-session-cookie>'
export ENT_PERF_UPLOAD_WARMUP='5'
export ENT_PERF_UPLOAD_SAMPLES='25'
export ENT_PERF_UPLOAD_TIMEOUT_MS='5000'
```

Candidate command:

```bash
node scripts/performance-upload-advisory.mjs
```

The output artifact must stay under `tmp/performance` and must not be committed if it contains
run-specific target, tenant, actor, or timing evidence that the decision owner wants handled as an
operational artifact rather than repo documentation.

## Safety Rules

- Do not target production or generate production traffic.
- Do not commit session cookies, signed URLs, response bodies, request headers, raw file contents,
  tenant secrets, user PII, or claim narratives.
- Do not weaken budgets after a failing run in the same PR.
- Do not install a blocking CI gate until at least one advisory run records target, fixture,
  variance, and owner disposition.
- Do not change route behavior, auth, tenancy, routing, billing, product UI, proxy, schema, RLS,
  README, AGENTS, or broad architecture docs as part of fixture readiness.

## Acceptance Criteria Disposition

| `ENT-PERF04` follow-up requirement                   | ENT-PERF05 disposition                                    |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Name target URL requirement                          | Satisfied; non-production target constraint recorded.     |
| Name fixture tenant and actor requirements           | Satisfied; synthetic tenant/member identity required.     |
| Name fixture session creation and expiry owner       | Satisfied; named operator ownership required.             |
| Name storage-provider availability requirement       | Satisfied; non-production evidence storage required.      |
| Name sample settings and output path                 | Satisfied; env shape and `tmp/performance` path named.    |
| Name pass/fail owner                                 | Satisfied; platform or release owner required.            |
| Avoid production load, secrets, signed URLs, runtime | Satisfied; no route request was sent and no code changed. |

## Residual Risk

This handoff makes the missing fixture work explicit, but it does not prove latency or storage
provider behavior. The performance regression lane still needs a real advisory run against an
isolated target with a short-lived authenticated fixture session before any p50, p95, p99, error
rate, timeout rate, or future blocking budget can be evaluated.

## Next Repo-Owned Slice

The next bounded enterprise slice should be:

`ENT-PERF06 Initial Upload Performance Advisory Latency Run`

That slice should execute the repo-owned runner only after the required non-production target,
fixture tenant, actor, session, storage target, output path, sample settings, and decision owner are
available. If those prerequisites are still unavailable, it should record the exact readiness
blocker instead of simulating latency success. It must not run production load, persist secrets or
signed URLs, install a blocking CI gate, or change runtime behavior, auth, tenancy, routing,
billing, product UI, proxy, schema, RLS, README, AGENTS, or broad architecture docs.
