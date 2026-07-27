---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-CD-DG02
slice: IDA-CD02
revision: R0
date: 2026-07-27
authority: root-orchestrator
---

# IDA-CD-DG02 — Z620 Staging CD Runner

## Decision

Promote exactly one Tier-3 CD infrastructure slice: `IDA-CD02`.

`IDA-CD02` registers the HP Z620 as the repository's Linux GitHub Actions
runner and moves only the four staging execution jobs to it:

1. `build-staging`
2. `deploy-staging`
3. `e2e-staging`
4. `rollback-staging-alias`

Production evidence remains on GitHub-hosted Ubuntu. `build-production`,
`deploy-production` and `verify-production` remain on the Mac runner during this
controlled rollout. Moving production is a later decision after a green
same-SHA staging deployment and rollback-control proof on Z620.

The production job graph intentionally remains fail-closed behind successful
staging E2E. Therefore every tag or manual production release will depend on
Z620 availability during this transition even though production execution stays
on Mac. This gate authorizes no emergency bypass around staging or Z620.

Arben explicitly approved this staged allocation in the active 2026-07-27
session. This gate records that approval but authorizes no implementation,
runner registration, provider contact or deployment before the gate is merged
and separate exact runtime authority binds then-current clean `main`.

## Authority Base

- Repository: `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `5bacaaa7d6e5bd3893a62a6a3166c8feefe4c72b`
- Branch before gate: `main`
- Upstream: `origin/main`
- Resolver: `blocked_requires_current_authority`
- Resolver reason: `umbrella_without_concrete_promoted_slice`
- Active slice before this gate: `null`
- Predecessor closeout: PR `#1460`, squash merge
  `5bacaaa7d6e5bd3893a62a6a3166c8feefe4c72b`
- Failed CD evidence: run `30297612032`

Obsidian remains advisory. Repository program/tracker authority and this exact
gate are binding if advisory notes differ.

## Fresh Resource Evidence

### GitHub runner inventory

The repository runner API reports exactly one registered runner:

- `interdomestik-mac-Arbens-Mac-mini`
- online and idle;
- macOS / ARM64;
- labels `self-hosted`, `macOS`, `ARM64`, `interdomestik-mac`.

No Linux GitHub Actions runner is registered. The label `interdomestik-linux`
is already referenced by `release-candidate.yml` and
`multi-agent-benchmark-weekly.yml`; it is therefore pre-claimed and forbidden
for this staging-CD runner. Activating those unrelated workflows would widen
scope and could collide with the Z620's resident PostgreSQL port.

### Mac runner

The Mac data volume currently has about 24 GiB free after cleanup. The exact
failed CD run had substantially less headroom and failed during local Vercel
prebuild with `ENOSPC`, before deployment or alias mutation. The changing free
space does not remove the structural contention: development, browser builds,
Docker layers and CD share one smaller ARM64 host.

### HP Z620

Fresh read-only SSH evidence from host `interdomestik-z620` reports:

- Ubuntu Linux / `x86_64`;
- 196 GiB root filesystem, 107 GiB available, 43% used;
- 30 GiB RAM, about 24 GiB available;
- Docker active;
- Docker images 17.33 GB, about 3.99 GB reclaimable;
- Docker build cache about 539 MB, about 457 MB reclaimable;
- no GitHub Actions runner service detected.

The Z620 already hosts accepted local Docker/PostgreSQL/Supabase validation
work. That does not itself authorize GitHub runner installation or CD use.

## Resource Allocation

This is the accepted transitional split:

| Plane                     | Host                 | Responsibility                                                                     |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| Developer/control         | Mac                  | Codex, local editing, browser work, review and operator control                    |
| Heavy staging execution   | Z620                 | Docker build/attestation, Vercel prebuild/deploy, staging E2E and staging rollback |
| Light production evidence | GitHub-hosted Ubuntu | Existing `production-evidence` job                                                 |
| Production execution      | Mac, temporarily     | Existing production build/deploy/verify jobs until Z620 staging proof passes       |

The target end-state may move production execution to Z620, but this gate does
not authorize it. This split isolates execution hosts, not release
prerequisites: Z620 staging remains a hard dependency of the production chain.

The architecture difference is explicit and accepted for this transition:
staging build/attestation becomes Linux X64 while production build/attestation
remains macOS ARM64. The Vercel artifact is built separately from the attested
container image; this gate preserves exact per-job digest/provenance checks but
does not claim cross-architecture image parity. Moving production to Linux X64
is the later parity decision.

## Exact Future Repository Writer Map

Only these eight repository paths may change:

1. `.github/workflows/cd.yml`
2. `scripts/ci/cd-runner-preflight.mjs` — new
3. `scripts/ci/cd-runner-preflight.test.mjs` — new
4. `scripts/ci/cd-runner-contract.test.mjs` — new
5. `scripts/ci/configure-vercel-gate-url.mjs`
6. `scripts/ci/configure-vercel-gate-url.test.mjs`
7. `scripts/ci/cd-deploy-env-scope.test.mjs`
8. `scripts/repo-size-budget.json` — deterministic sync only

Any ninth repository path stops implementation for a fresh exact disposition.
New production and test files must stay below 150 lines. The existing
`cd-deploy-env-scope.test.mjs` must not grow above 150 lines.
Rollback movement-signal, missing-artifact and staging/production label
contracts belong in the new `cd-runner-contract.test.mjs`. The existing
`cd-deploy-env-scope.test.mjs` may only be kept within its ceiling through
equivalent tightening, not by losing current coverage. The modified
`configure-vercel-gate-url.mjs` must also remain below 150 lines.

## Exact External Mutation Map

After this gate merges and separate runtime authority exists, external mutation
is limited to:

1. install one pinned GitHub Actions runner release in a dedicated Z620
   directory owned by the existing non-root `arben` operator;
2. register it only to `interdomestik/interdomestik`;
3. assign the exclusive custom label `interdomestik-z620-staging` while
   retaining GitHub's `self-hosted`, `Linux` and `X64` labels; do not assign
   `interdomestik-linux` or `interdomestik-mac`;
4. install and start its dedicated systemd service;
5. create its task-owned GitHub Actions workspace and runner diagnostic files
   with runner home and `_work` inaccessible to unrelated service accounts;
6. when a threshold requires reclamation, prune only the dedicated
   `interdomestik-cd-staging` Buildx builder cache older than seven days.

Do not modify or stop PostgreSQL, Supabase, Forgejo runner, tunnel, backup,
restore or Docker services. Do not copy Mac `node_modules`, `.next`, Docker
state, browser caches or credentials to Z620. The short-lived registration
token must not be logged or persisted outside the runner's GitHub-managed
credential files. Runner home, `_work` and diagnostic directories must be owned
by the runner user and mode `0700` or equivalently restrictive. Staging secrets
must not be persisted outside GitHub-managed step scope.

The only authorized Docker reclamation is the equivalent of
`docker buildx --builder interdomestik-cd-staging prune --filter until=168h`.
It may run only after evidence shows a threshold breach, and it must not prune
the default builder, images, containers, volumes or another service's cache.

## Required Behavior

### Runner readiness

- The runner must appear online and idle in the repository runner API before
  the workflow changes may merge.
- Repository evidence must continue to show that
  `interdomestik-z620-staging` is referenced only by the four staging CD jobs.
  Existing `interdomestik-linux` workflows remain unchanged and unscheduled.
- The service must run as non-root.
- Docker access, Node/pnpm prerequisites and Playwright Chromium installation
  must be proven on the task-owned runner workspace.
- Every staging job must fail before build, provider contact or alias mutation
  if either the filesystem containing `RUNNER_TEMP` or the filesystem containing
  Docker's reported data root has less than 30 GiB available.
- Every staging job must also fail before heavy execution or provider contact
  when host-available memory is below 8 GiB.
- The preflight must prove Linux/X64, the
  `interdomestik-z620-staging` exclusive-label contract, Docker availability,
  both disk targets and bounded memory evidence without printing secrets.
- `build-staging` and `e2e-staging` must each receive a bounded execution timeout
  once scheduled.
  GitHub does not provide a repository workflow primitive that times out an
  offline self-hosted runner while it remains queued, so queue availability is
  an explicit operator control rather than a falsely claimed automatic guard.
- Immediately before merging the workflow change and before any tag/manual
  production release, the operator must prove the named Z620 runner online and
  idle through the repository runner API.
- For the first automatic main proof, a queued Z620 job that has not started
  within 10 minutes must be cancelled; the exact label change must be reverted
  before another CD attempt. The non-cancelling concurrency group must not be
  left wedged. No production bypass is allowed.
- Cleanup may remove only task-owned workspace/cache artifacts. No global
  `docker system prune`, unrelated container removal or broad directory deletion
  is allowed. The workflow must use the dedicated
  `interdomestik-cd-staging` Buildx builder so bounded age-filtered reclamation
  cannot target another workload.

### Workflow allocation

- The four staging jobs must use
  `[self-hosted, interdomestik-z620-staging]`.
- `production-evidence` must remain `ubuntu-latest`.
- The three production execution jobs must remain
  `[self-hosted, interdomestik-mac]`.
- Ordinary pushes to `main` must continue to skip every production job.
- Existing tag and manual production semantics must not change in this slice.
- Proof must use the automatic push-to-`main` run; manual dispatch is forbidden
  because the current workflow also selects production on `workflow_dispatch`.
- `production-evidence` must continue to depend on successful `e2e-staging`.
  Z620 failure therefore blocks, rather than bypasses, the production chain.

### Staging safety

- Preserve image digest, attestation, Vercel environment, canonical alias,
  health, provenance, P0 release-gate and artifact contracts.
- Preserve job-scoped staging secrets and environment protections.
- Expose the composite action's existing non-secret `alias_moved` output as an
  explicit `deploy-staging` job output. This is the independent same-run
  discriminator when the preimage artifact cannot be downloaded.
- A failure before creation of a staging alias preimage must produce a
  contained `not-required` rollback receipt and must not fail a second time only
  because no artifact exists.
- The download step may tolerate artifact absence only long enough to run the
  local guard. The guard must distinguish missing-file `ENOENT` from malformed
  JSON/receipt and ingest the exact `needs.deploy-staging.outputs.alias_moved`
  signal through a non-secret environment input.
- Missing preimage plus `alias_moved == 'true'` is hard red and must never emit
  `not-required`. Missing preimage plus any other movement signal is a contained
  no-op because movement is unconfirmed.
- A malformed receipt, confirmed alias movement without usable preimage, failed
  restore or post-restore provenance mismatch remains hard red.
- The download step must explicitly continue to the guard on missing artifact.
  The existing exact job-output `deepEqual` contract must be updated to include
  `alias_moved`, not weakened or removed.
- A narrow residual remains if both the job-output propagation and the artifact
  upload are lost after a real alias move. The implementation must minimize this
  dual-loss window, preserve hard-red behavior whenever either signal confirms
  movement, and must not claim the window is eliminated.
- No rollback path may contact production or alter a non-canonical alias.

## Acceptance Evidence

Focused deterministic proof must cover:

1. exact staging/production runner-label allocation;
2. 30 GiB pass/fail cases for both `RUNNER_TEMP` and Docker data-root;
3. unsupported OS/architecture rejection;
4. unavailable Docker rejection;
5. 8 GiB available-memory pass and fail cases;
6. exclusive-label proof and no staging-runner activation of existing
   `interdomestik-linux` workflows;
7. dedicated-builder and age-filtered cleanup proof with no broad/global cleanup
   command;
8. ordinary main pushes skip all production jobs;
9. current workflow-dispatch production semantics remain unchanged;
10. pre-alias failure with no artifact reaches a local no-op guard;
11. the exact composite `alias_moved` output is exposed at job scope and missing
    receipt with `alias_moved == 'true'` remains hard red;
12. the download step continues to the guard on absent artifact;
13. ENOENT becomes no-op only without confirmed movement, while malformed
    receipt remains hard red;
14. the exact existing job-output assertion gains `alias_moved` and is not
    removed;
15. confirmed post-alias failure restores only the exact staging preimage;
16. successful staging E2E does not schedule rollback;
17. credentials remain job/action scoped;
18. existing digest/attestation/canonical-alias contracts remain intact;
19. preflight is immediately after checkout and before setup, build, provider,
    alias or release-gate steps in all four staging jobs;
20. `build-staging` and `e2e-staging` have bounded scheduled execution timeouts;
21. production evidence still depends on staging E2E, with no bypass;
22. runner home/workspace permissions exclude unrelated service accounts.

Required local proof:

- focused Node contract tests for all changed/new scripts;
- `node --test scripts/ci/cd-attestation-contract.test.mjs`;
- `node --test scripts/ci/cd-staging-canonical-gate-contract.test.mjs`;
- `pnpm repo:size:check`;
- `git diff --check`;
- `pnpm pr:verify`;
- `pnpm security:guard`;
- `pnpm e2e:gate`.

No Codex Security diff scan is authorized or claimed. Repository-native security
gates and current-head GitHub security checks remain mandatory.

Post-merge operational proof must bind one exact main SHA and show:

- all four staging jobs scheduled on the named Z620 runner;
- build and attestation green;
- staging deploy, health and provenance green;
- staging P0 E2E and evidence artifact green;
- rollback skipped on success;
- all production jobs skipped;
- final Z620 disk, Docker and runner service health still within thresholds.

## Failure And Rollback

- Runner registration failure: remove only the attempted registration/service;
  do not change the workflow.
- Runner readiness failure: keep staging jobs on Mac and return to authority.
- Workflow merged but Z620 remains queued/offline for 10 minutes: cancel the
  run, revert the exact runner-label workflow change and keep production
  blocked; do not dispatch or bypass staging.
- Build/prebuild failure before alias movement: record contained failure and
  `not-required` rollback; do not contact production.
- Failure after confirmed alias movement: preserve the existing exact-preimage
  restore contract.
- Either disk target below 30 GiB or available memory below 8 GiB: block the job
  before provider contact; perform only the exact dedicated-builder cleanup
  under separate operator control and re-measure before retry.
- Any PostgreSQL/Supabase/Forgejo/tunnel regression: stop the GitHub runner,
  preserve evidence and revert this slice before further CD attempts.

## Explicit Exclusions

This gate does not authorize:

- production runner migration or production deploy/verify changes;
- production deployment or manual workflow dispatch;
- changing Vercel projects, aliases, environment variables or secrets;
- broad Docker cleanup or removal of unrelated images, containers or volumes;
- PostgreSQL, Supabase, Forgejo, tunnel, backup or restore changes;
- database, migration, schema, RLS or seed behavior;
- P0a2 or any migration-kernel integration;
- proxy, routing, auth, session, tenancy, product UI or billing changes;
- README, AGENTS, architecture-doc or package/dependency changes;
- any successor slice.

## Promotion Boundary

This docs-only gate sets:

- `runtime_authorized:false`
- `runner_registration_authorized:false`
- `deployment_authorized:false`
- `production_authorized:false`

After this exact gate is merged and the resolver selects only `IDA-CD02`, a
separate exact runtime receipt may authorize the eight-path repository map and
the six-item external mutation map. The next active governed implementation
goal is exactly one canonical tracker slice: `IDA-CD02`.
