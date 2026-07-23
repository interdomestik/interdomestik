---
type: infrastructure-spec
status: accepted_by_user
project: interdomestik
date: 2026-07-23
authority: user-and-root-orchestrator
---

# Z620 Pre-Push CI/CD Specification

## Decision

Build a fail-closed pre-push verification system on the HP Z620. Codex and the
developer remain on the Mac mini; the Z620 runs the Linux workloads through SSH:
dependency installation, Turborepo tasks, production builds, disposable
PostgreSQL databases, Supabase-backed integration tests, Playwright, security
gates, Sonar analysis and non-mutating Sentry validation.

GitHub remains the source-of-truth remote and the final merge/deployment
authority. Forgejo is the private local mirror and CI coordination surface.
Passing Z620 verification permits a push; it does not prove that GitHub required
checks passed and does not authorize deployment.

## Goals

1. Detect the failures represented by the current GitHub workflows before push.
2. Move Docker, PostgreSQL, Supabase, build and E2E pressure off the Mac mini.
3. Run independent lanes in parallel without sharing mutable databases.
4. Preserve exact SHA, lockfile, tool-version and evidence provenance.
5. Keep secrets out of repositories, logs, artifacts and untrusted jobs.
6. Make the fast development loop faster while reserving the full gate for
   pre-push and release-candidate boundaries.
7. Keep GitHub branch protection and production deployment fail-closed.

## Non-Goals

- Replacing GitHub as the canonical upstream.
- Bypassing GitHub required checks or branch protection.
- Deploying production from an ordinary local or pull-request job.
- Copying Mac `node_modules`, `.next`, Docker volumes or databases to the Z620.
- Exposing Docker on TCP `2375`, PostgreSQL, Supabase, Forgejo or CI services to
  the public network.
- Changing routing, authentication, tenancy, `apps/web/src/proxy.ts` or product
  architecture.
- Touching the Windows partition, NTFS volumes or unavailable HDD.
- Treating repeated reruns as a substitute for fixing flaky tests.

## Current Baseline

- Z620: Ubuntu Server, amd64, 2 sockets, 12 physical cores/24 threads, 32 GiB RAM.
- Ubuntu SSD root: about 196 GiB, with about 146 GiB free after benchmark work.
- Supabase/PostgreSQL: healthy on the Z620 with zero observed database restarts.
- Forgejo: local private mirror, currently bound to `127.0.0.1:3000`.
- Playwright config: currently hardcodes port `3000`, conflicting with Forgejo.
- Node: repository-pinned major 24.
- Package manager: `pnpm@10.28.2`.
- Turborepo warm proof: type-check plus lint improved from about 158 seconds to
  2.39 seconds.
- Web build proof: successful standalone build in about 5 minutes using six
  Next.js build CPUs.
- E2E proof: disposable database migrate/seed/assert and Playwright state setup
  passed; the full gate exposed independent flaky test interactions.
- Current `main` evidence also contains a repo-size budget failure and a
  NodeNext import failure in `packages/qa`; infrastructure must report these as
  code/repository failures rather than hide them.

## Source And Trust Model

### Canonical sources

1. GitHub `interdomestik/interdomestik` is the canonical remote.
2. The exact Git commit SHA is the unit of verification.
3. `pnpm-lock.yaml`, `.nvmrc`, `.node-version`, `packageManager`, repository
   scripts and GitHub workflows define tool and command authority.
4. Forgejo mirrors GitHub and stores local CI metadata; it must never silently
   become a divergent source of truth.

### Trust levels

- Trusted branch: local developer branch whose exact SHA is known.
- Untrusted contribution: fork, unknown patch, or event not bound to an approved
  local branch. It receives no provider secrets.
- Provider-validation job: may receive narrowly scoped read/check credentials.
- Release job: separate protected environment with manual approval; not part of
  the ordinary pre-push pipeline.

## Pipeline Lanes

### Lane A — Developer Fast Loop

Runs on demand and after focused edits:

- affected format/lint/type-check;
- focused unit tests;
- Turborepo cache reuse;
- no Sonar upload, Sentry API write, E2E reset or deployment.

Target: seconds to two minutes when warm.

### Lane B — Commit Gate

Runs before a local commit is considered ready:

- `pnpm install --frozen-lockfile`;
- repository contract checks relevant to changed paths;
- `pnpm security:guard`;
- focused or affected tests;
- secret scan of the proposed diff;
- no external write.

### Lane C — Pre-Push Full Gate

Runs in the background on the Z620 and binds evidence to one exact SHA:

- environment and CI contract checks;
- lint, type-check, entrypoint and i18n checks;
- coverage and release-gate unit suites;
- architecture and database-access guards;
- migration-journal and RLS integration checks;
- production standalone build and bundle-size checks;
- Playwright guards, deterministic seed and required E2E projects;
- production dependency audit at the repository policy threshold;
- Sonar analysis/quality gate when configured;
- Sentry configuration, release/source-map dry validation and alert drift check;
- final SHA/dirty-state/service-health/evidence-manifest verification.

A failure blocks automatic push permission. It does not block the developer from
continuing unrelated work on the Mac.

### Lane D — GitHub Final Gate

After an authorized push:

- GitHub Actions runs its required checks normally;
- GitHub event payload, permissions, PR policy and branch protection remain
  authoritative;
- local evidence may be attached or summarized but cannot replace GitHub check
  conclusions.

### Lane E — Release

Separate from pre-push:

- requires protected environment and manual approval;
- may create a Sentry release and upload source maps;
- may publish an image or trigger staging;
- production remains governed by the existing GitHub CD workflow and its
  environment protections.

## GitHub-Parity Contract

The local pipeline must inventory these workflow families and fail when its
mapping becomes stale:

- `.github/workflows/ci.yml`;
- `.github/workflows/security.yml`;
- `.github/workflows/e2e-pr.yml`;
- `.github/workflows/sonar-main-gate.yml`;
- `.github/workflows/pilot-gate.yml`;
- `.github/workflows/release-candidate.yml`;
- `.github/workflows/cd.yml`.

Each local job records:

- workflow and job it represents;
- exact local command;
- whether parity is exact, equivalent, cloud-only or release-only;
- required environment variables without values;
- result, duration and artifact paths;
- explicit reason for any allowed skip.

Unknown or newly added blocking GitHub jobs make parity red until classified.

## Database Isolation

Every integration/E2E job gets a unique task-owned database:

`interdomestik_ci_<short_sha>_<lane>_<attempt>`

Rules:

- create only inside the existing Z620 PostgreSQL cluster;
- run Drizzle migrations, deterministic E2E seed and seed assertion;
- pass both admin and RLS URLs explicitly to the job;
- never point an E2E reset at the active `postgres` database;
- record database name, SHA and lifecycle without recording credentials;
- drop only the exact task-owned database after evidence capture;
- keep a failed database temporarily only when explicitly marked for diagnosis;
- enforce an age/owner cleanup policy for abandoned CI databases.

## Port And Service Isolation

Forgejo keeps `127.0.0.1:3000`.

Playwright and the E2E web server must become configurable and use a dedicated
port range, initially `3100-3199`. A job receives one reserved port and must:

- prove it owns the listener;
- avoid killing unrelated processes;
- release the port on success, failure, cancellation and timeout;
- never require Forgejo to stop during normal CI;
- keep tenant hosts loopback-only through `nip.io` or deterministic local DNS.

The implementation must add a focused contract test proving that the configured
port reaches Playwright base URLs, tenant hosts, trusted origins and the spawned
web server consistently.

## Parallelism And NUMA

- Verification lane: CPUs `0-5,12-17`.
- E2E lane: CPUs `6-11,18-23`.
- Default heavy-worker ceiling: six per lane.
- Run independent code and E2E lanes concurrently only when memory, disk and DB
  health thresholds are green.
- Do not assume 24 workers are faster; benchmark changes with cold and warm
  evidence before promotion.
- Keep PostgreSQL/Supabase responsive and reserve memory headroom.
- Queue a second job for the same lane rather than oversubscribing a socket.

## Cache Policy

- Use the repository’s Turborepo cache contract.
- Cache keys include exact inputs, lockfile, Node/pnpm versions and relevant env
  declarations.
- Never cache secrets, `.env` files, Playwright auth state or databases.
- Keep amd64 caches on the Z620; do not copy them to/from arm64 Mac builds.
- Enforce cache-size and free-disk thresholds with age-based task-owned cleanup.
- A cache miss affects performance, never correctness.

## Secrets And Provider Access

Secrets live in Forgejo Actions secrets or a root-owned/local service credential
store and are injected only into the required job.

Required separation:

- Sonar token: analysis scope only.
- Sentry check token: read/check scope where supported.
- Sentry release token: separate, release-only.
- GitHub inspection token: read-only.
- GitHub push credential: separate from inspection and unavailable to CI tests.
- Deployment credentials: protected release environment only.

Rules:

- never write secret values into repository files;
- never echo environment dumps or provider responses containing credentials;
- mask secrets in runner output;
- untrusted jobs receive no provider tokens;
- artifacts contain normalized/redacted receipts only;
- rotate credentials after suspected disclosure;
- absence of an optional provider credential is an explicit `not_configured`
  result, never a false pass.

## Sonar Contract

The Z620 may run the repository’s existing Sonar scripts and communicate with
SonarCloud/SonarQube.

Pre-push behavior:

- validate configuration without printing values;
- generate required coverage first;
- run analysis for the exact SHA/branch;
- wait for the quality-gate result when the provider supports it;
- store redacted logs and quality-gate JSON;
- fail closed when Sonar is declared required but unavailable or red;
- do not overwrite canonical mainline analysis semantics accidentally.

GitHub’s mainline Sonar check remains authoritative after push.

## Sentry Contract

Pre-push validation may:

- run Sentry unit/configuration contracts;
- validate source-map production settings and artifact completeness;
- check configured alert-rule drift using read-only/check mode;
- validate release name as the exact commit SHA.

Ordinary pre-push validation must not:

- create a production release;
- upload source maps to the production project;
- apply alert changes;
- mutate issue state;
- send a deployment marker.

Those writes belong only to Lane E with approval and dedicated credentials.

## GitHub Event And Permission Simulation

Local fixtures model `push`, `pull_request`, `workflow_dispatch`, schedule and
release contexts using sanitized JSON. They must cover:

- base/head SHA and branch;
- draft/readiness and label state;
- changed paths and gate-policy output;
- trusted versus untrusted origin;
- permission and secret availability matrix.

Simulation verifies repository logic but does not claim to reproduce GitHub’s
server-side branch protection. After push, GitHub enforces required checks.

## Evidence

Each run writes a task-owned directory:

`/home/arben/ci/interdomestik/runs/<run-id>/`

Required outputs:

- `manifest.json`: SHA, branch, clean state, versions, lane and timestamps;
- `parity.json`: GitHub workflow/job mapping;
- `results.json`: status, command identifier, duration and retry count;
- redacted logs;
- test, coverage, Sonar, Sentry and Playwright artifacts where applicable;
- database and port lifecycle receipts;
- final service-health and disk-health snapshot;
- checksums for retained artifacts.

Evidence is immutable after finalization. `latest` may be a pointer, not a
mutable replacement for a run directory.

## Push Authorization

The pipeline may produce a signed/local `push-permit.json` only when:

1. the repository was clean at the start or the candidate commit was materialized
   into a clean detached clone;
2. the verified SHA still equals the candidate SHA;
3. all required parity jobs passed;
4. no required job was skipped;
5. provider checks required for that lane passed;
6. PostgreSQL/Supabase remained healthy;
7. evidence checksums validate;
8. the permit has not expired.

The first implementation reports the permit but does not push automatically.
Automatic push, if later authorized, must:

- ask for explicit user approval;
- push only the verified SHA to the named non-protected branch;
- never force-push;
- never push directly to `main`;
- invalidate the permit immediately after use or SHA change.

## Failure Classification

- `code_defect`: deterministic source/test failure.
- `gate_contract_defect`: repository gate or workflow mapping is inconsistent.
- `test_flake`: isolated rerun passes under unchanged SHA/environment.
- `environment_defect`: service, port, DNS, disk or runner failure.
- `provider_defect`: Sonar/Sentry/GitHub service or credential failure.
- `security_block`: secret, permission, dependency or policy violation.

Only one isolated rerun is permitted for flake classification. A full green run
is still required for a push permit; rerun success does not erase the original
flake evidence.

## Monitoring And Retention

- Warn at 70% disk, block new heavy jobs at 80%, critical at 90%.
- Warn when available RAM drops below 8 GiB; serialize heavy jobs below 6 GiB.
- Block E2E when PostgreSQL or required Supabase health checks are red.
- Alert on container restarts, stale CI databases, stale ports and failed cleanup.
- Retain successful full-run evidence for 14 days.
- Retain failed-run evidence for 30 days unless it contains sensitive artifacts.
- Retain release evidence according to the existing release policy.

## Implementation Phases

### P0 — Baseline And Fail-Closed Inventory

- capture exact Z620 versions, services, ports, NUMA, disk and health;
- inventory GitHub jobs, local commands, secrets and external effects;
- record current known repository failures and E2E flakes;
- produce the first parity matrix.

Exit: no workflow is silently omitted.

### P1 — Task-Owned Runner Skeleton

- create run directories, manifest, locking, cleanup trap and result schema;
- add verify/e2e lane scheduling;
- add exact-SHA clean clone materialization;
- add unit tests for lifecycle and redaction.

Exit: a no-provider dry run produces valid evidence and leaves services healthy.

### P2 — Database And Port Isolation

- implement unique disposable DB lifecycle;
- make Playwright/E2E port configurable and remove the Forgejo conflict;
- add ownership, cleanup and contract tests.

Exit: Forgejo stays online during two consecutive E2E runs.

### P3 — Core GitHub-Parity Gates

- map audit, static, unit, security, build, migration, RLS and E2E jobs;
- implement change-policy fixtures;
- fail on unknown required workflow changes.

Exit: local full gate represents all non-provider GitHub blocking checks.

### P4 — Cache And Parallel Execution

- promote measured Turborepo cache;
- run verify and E2E preparation on separate NUMA lanes;
- add resource-aware queuing and timing reports.

Exit: two consecutive runs prove correctness and warm-cycle improvement without
Supabase/PostgreSQL restarts.

### P5 — Sonar Integration

- configure scoped secret injection;
- run coverage, scan and quality-gate wait;
- store redacted evidence and test missing/red provider behavior.

Exit: one passing and one synthetic failing quality-gate path are proven.

### P6 — Sentry Integration

- run local Sentry contracts and source-map validation;
- add read-only alert drift check;
- prove ordinary CI cannot call apply/release/upload operations.

Exit: Sentry validation passes without a provider mutation.

### P7 — Push Permit And Forgejo Automation

- wire Forgejo events to the trusted runner;
- add concurrency cancellation and status reporting;
- emit expiring push permits;
- keep actual push manual.

Exit: a clean candidate receives a permit; changed SHA, skip or failure does not.

### P8 — End-To-End Acceptance

- run two consecutive complete green pipelines for the same exact SHA;
- run one controlled negative case for each failure class;
- verify GitHub final checks after one explicitly approved branch push;
- compare local/GitHub job results and timing;
- document rollback, operator commands and remaining cloud-only boundaries.

Exit: the user accepts the evidence and the specification changes to
`status: implemented`.

## Acceptance Criteria

1. Mac Docker is not required for Interdomestik full verification.
2. Forgejo stays available during ordinary CI.
3. Every heavy job uses an exact clean SHA and task-owned resources.
4. Two jobs can run without database or port collision.
5. No test targets the active development database.
6. GitHub workflow parity detects additions and removals.
7. Required local gates cannot be skipped silently.
8. Sonar and Sentry credentials are scoped, masked and absent from untrusted jobs.
9. Pre-push Sentry validation has zero provider mutations.
10. Ordinary CI has no deployment credential and cannot deploy.
11. A full failure never produces a push permit.
12. A SHA change invalidates an existing permit.
13. PostgreSQL/Supabase finish acceptance with zero infrastructure-caused restarts.
14. Windows/NTFS/HDD remain untouched.
15. Two consecutive full pipelines pass before the system is declared complete.
16. One explicitly approved GitHub branch push confirms final-cloud parity.

## Stop Conditions

Stop and request authority before:

- changing GitHub branch protection or required checks;
- registering the Z620 as a GitHub self-hosted runner;
- creating provider tokens or broadening their scopes;
- changing Forgejo’s externally observed ports;
- applying Sentry alert changes or creating releases;
- triggering staging or production deployment;
- pushing any branch automatically;
- deleting non-task-owned databases, caches or artifacts;
- touching Windows, NTFS or the HDD.

## Rollback

- Disable Forgejo CI triggers first.
- Stop only task-owned runners and jobs.
- Remove only task-owned disposable databases and run directories.
- Restore the prior Playwright port default if its contract fails.
- Preserve evidence for the failed rollout.
- Leave GitHub workflows, branch protection, production, Supabase data, Forgejo
  repositories and Windows storage unchanged.

## Definition Of Done

This program is complete only when P0-P8 exit criteria and all acceptance
criteria are evidenced. “Installed”, “configured” or a single green partial run
is not completion.
