# IDA-DG51 — T-115 OD#17 projection capability and terminal measurement

Status: exact candidate; no repository, provider, branch, PR, or runtime authority until
Arben approves the content-addressed artifacts named in this gate.

Base protected main: `6cf5227fcdf7247b801d9aa4673eabb08bceab98`.

## Decision

Finish T-115 without another speculative provider retry by separating the trusted-main
measurement capability from the one final measurement:

1. merge one inert capability PR that makes the protected-main OD#17 collector and
   verifier match the real Vercel-to-GitHub projection already captured;
2. on that exact corrected main, create one final measurement PR, one exact-head Preview,
   one protected-main canary, and one audit/finalizer rerun;
3. merge only the exact measured head, then merge one docs-only terminal closeout.

This is one T-115 outcome. It does not promote another product slice. The split is an
architectural trust boundary, not a retry: the canary job checks out protected `main`, so
unmerged collector code in the measurement PR cannot certify itself.

## Proven terminal input

The prior lifecycle is terminal and spent. PR #1597 closed unmerged on base
`6cf5227fcdf7247b801d9aa4673eabb08bceab98`. Its terminal receipt is
`IDA-T115-OD17-TERMINAL-PROJECTION-MISMATCH-R1`, 4,293 bytes, SHA-256
`7e415da8a3578e13057b215d72fbb640928e28273678b229ccd9fa339cae655a`.

The sole real non-production Preview was READY and healthy:

- Vercel deployment `GcE5wm6PkS4G195vLEBCc7CHDFsU`;
- immutable URL `https://interdomestik-i5yo55nz6-ecohub.vercel.app`;
- exact head `6ede23899a3b5b4c429f89739113073877f722d7`;
- no-cache summary `0/2 cached`;
- normal TypeScript completion in 50 seconds;
- total provider duration 8m38s.

With `deployment_status Events=ON`, Vercel created GitHub Deployment `5981435922` and
status `17012107025`. GitHub's authenticated REST record proves:

- `sha == ref == 6ede23899a3b5b4c429f89739113073877f722d7`;
- `task == deploy`;
- `environment == Preview`, `production_environment == false`;
- deployment and status creator are the server-issued bot identity
  `id=35613825`, `node_id=MDM6Qm90MzU2MTM4MjU=`, `login=vercel[bot]`, `type=Bot`,
  `html_url=https://github.com/apps/vercel`;
- `performed_via_github_app == null` on both records;
- latest status is `success`;
- `environment_url`, `target_url`, and `log_url` all equal the immutable URL above.

GitHub App `/apps/vercel` independently reports official app ID `8329`, node ID
`MDM6QXBwODMyOQ==`, slug `vercel`, and deployment-write permission. A caller cannot
supply GitHub's `creator`; GitHub binds it to the authenticated actor.

The existing implementation rejects the real record in four places:

1. collector requires branch-valued deployment `ref`;
2. collector requires non-null `performed_via_github_app.slug`;
3. collector and tests require the fictional host prefix `interdomestik-web-<9>`;
4. downstream PR-head verifier requires the same fictional host and branch-valued ref.

There is one additional protected-main compatibility gap: main's canary workflow expects
both `build-manifest.json` and `app-build-manifest.json`, while the already-proven final
preparation contract retains only `build-manifest.json`. The previous canary stopped
before reaching this path, so it must be corrected offline before the last measurement.

## Reviewer debate and disposition

The bounded Opus 5 route ran once for 340.847 seconds over an ignored 8,594-byte packet,
SHA-256 `e6c1d669e8f6510e6befd097cccd1ff427e833565c078b67d75241237285fbdf`.
Verdict: `REVISE`.

Accepted findings:

- Strategy A, a minimal GitHub Deployment adapter, is the smallest secure choice.
- Two technical PRs are mandatory because privileged code executes from main.
- Exact Vercel bot identity on both deployment and status is stronger than a mutable
  app slug and closes ordinary manual/spoofed GitHub Deployment attempts.
- SHA-valued `ref` is valid under GitHub's REST contract; branch identity remains bound
  independently by the live open same-repository PR object.
- The real immutable host shape and real payload must be regression-tested offline.
- A SHA/ref/environment-filtered query and exactly-one response remove the unfiltered
  100-record/N+1 ambiguity.

Rejected or bounded findings:

- Do not change TTFB sampling to a warmed second request. DG49-A1 already defines the
  first authenticated exact-content sample and explicitly includes conservative Trusted
  Source verification overhead. Changing the timing method would alter the approved
  measurement, while no current metric result proves a defect.
- Do not add a predicate for `log_url`: it is not consumed. Contrary to the review's
  packet-based inference, the actual status has `log_url` and it equals the immutable
  URL. The implementation will require `environment_url == target_url` and will retain
  `log_url` only in the content-addressed historical record.
- Do not add a thirteenth fixture path. The sanitized actual projection is embedded in
  the focused test and bound to deployment/status IDs; the complete raw source remains
  content-addressed in the terminal receipt.
- Do not migrate to `repository_dispatch` or add a Vercel token/API. Those are larger
  new trust surfaces and are not required for this closeout.

Two independent read-only audits agreed with the two-PR trust-boundary split, found the
same real host/ref/bot mismatches, and identified the manifest compatibility gap.

## Exact capability contract

The capability PR uses branch `codex/ida-t115-od17-projection-capability`. It is inert:
no provider control, Preview, deployment, canary, audit retry, production action, or
measurement is permitted.

The final hardened versions of these twelve existing T-115 verification paths are the
complete implementation writer map:

1. `.github/actions/setup/action.yml`
2. `.github/workflows/ci.yml`
3. `.github/workflows/od17-preview-canary.yml`
4. `apps/web/scripts/check-size.mjs`
5. `apps/web/scripts/check-size.test.mjs`
6. `package.json`
7. `scripts/ci/docs-closeout-main-push-contract.test.mjs`
8. `scripts/ci/od17-authenticated-lighthouse.test.mjs`
9. `scripts/ci/od17-public-shell-performance.mjs`
10. `scripts/ci/od17-public-shell-performance.test.mjs`
11. `scripts/ci/workflow-contracts.test.mjs`
12. `scripts/ci/z620-parity.json`

The gate document, capability receipt, current-program and current-tracker are separate
governance writers and do not expand the implementation map. No other repository path
may change. Repository size metadata may be synchronized only if the staged twelve paths
make the deterministic size check require it; that would consume the single consolidated
remediation and must be reported before writing.

### Projection predicates

For the exact final measurement branch only, accept a GitHub Deployment if and only if:

1. the live PR is open, same-repository, non-fork, branch exactly
   `codex/ida-t115-od17-performance-proof`, and its head equals the requested 40-hex SHA;
2. the deployment API query is filtered by that exact SHA, the same SHA as `ref`, and
   `environment=Preview`;
3. the query returns exactly one deployment;
4. deployment `sha == ref == expectedHeadSha`, `task == deploy`,
   `environment == Preview`, and `production_environment == false`;
5. deployment and latest-status IDs are positive safe integers;
6. deployment and latest-status creators both equal the official immutable Vercel bot
   numeric ID, node ID and Bot type, with login and app URL as consistency checks;
7. `performed_via_github_app` is either null, as observed, or the exact official Vercel
   App identity (`id=8329`, node ID above, slug `vercel`); any other non-null app fails;
8. latest status is `success`, its environment is `Preview`, and its environment URL
   equals its target URL;
9. the URL is HTTPS with no credentials, port, query, fragment or non-root path and its
   host matches exactly `^interdomestik-[a-z0-9]{9}-ecohub\.vercel\.app$`.

Zero, duplicate, mixed-creator, mutable-alias, wrong-host, wrong-head, wrong-ref,
wrong-task, non-Preview, production, failed or malformed records fail closed before OIDC
or Lighthouse. The returned ref remains the exact head SHA; branch identity is never
inferred from the deployment record.

### Preserved hardening

Reconcile the prior reviewed tree rather than blindly cherry-picking. Preserve:

- bounded, checksum-pinned non-root ripgrep setup with no apt fallback;
- exact preparation run/attempt/artifact/digest binding;
- content-addressed canary selection independent of conclusion;
- trusted-runner file writes and absolute `gh` resolution;
- single `build-manifest.json` structural preparation/recomputation;
- authenticated exact-origin Lighthouse/remote-byte evidence and token redaction;
- independent audit recomputation and the original three thresholds;
- no PR-controlled executable code in the protected-main OIDC job;
- all file-size/modularity and CI/finalizer contracts.

No TTFB method, threshold, metric, provider target, product code, route, auth, tenant,
schema, billing, dependency, lockfile, workflow permission, workflow event or production
behavior changes.

## Focused capability proof

The first implementation action is a RED replay test using the sanitized exact shape of
Deployment `5981435922` and status `17012107025`. It must fail on current main and pass
only after the adapter is implemented.

Focused acceptance is:

1. controller replay returns the exact IDs, SHA-ref, and immutable origin;
2. adversarial cases reject wrong deployment/status bot identity, mixed creators,
   login-only spoof, branch ref, wrong SHA/task/environment/state, production, bad or
   mutable host, path/query/fragment, zero IDs and duplicates;
3. downstream verifier accepts only the exact SHA-valued deployment ref and real host;
4. workflow tests prove main-only checkout, OIDC isolation, exact preparation shape,
   no new secret, no trigger/permission weakening, and no PR-code execution;
5. setup contract proves pinned ripgrep download/checksum and no apt path;
6. `git diff --check`, Prettier, focused Node tests, modularity guard, parity and repo-size
   check pass before GitHub-hosted required checks;
7. current-head Sonar, CodeQL, security, gitleaks, pnpm audit, static, unit, CI E2E gate,
   one PR E2E, Pilot, feedback and finalizer pass before exact-head squash merge.

The historical provider record is a regression fixture only. It cannot be claimed as a
new measurement and no old PR check authorizes the new head.

## Runtime and PR sequence

### Phase A — capability

After exact approval of this gate, a separate capability runtime receipt and passing
admission receipt may authorize one clean writer/worktree, one capability branch/PR, the
twelve implementation writers and compact current-program/current-tracker reconciliation.
No provider runtime is allowed. Merge only the exact reviewed head. Immediately contain
automatic CD before jobs, verify exact main, and remove only the capability branch/worktree.

### Phase B — final measurement

Only after capability main is exact and healthy may a separate exact-main runtime receipt
be generated for the final measurement. It is the sole remaining human approval hold; it
may not alter this strategy, writer map, provider, thresholds or one-shot ceiling.

That receipt may authorize one measurement PR on
`codex/ida-t115-od17-performance-proof`, compact receipt/status writers, one current-head
preparation, one feedback intake, and exactly these temporary provider controls:

- `ENABLE_VERCEL_DEPLOYMENTS=1`, Sensitive, Preview-only, exact branch;
- `VERCEL_FORCE_NO_BUILD_CACHE=1`, non-sensitive, Preview-only, exact branch;
- exact GitHub Actions Trusted Source for main
  `.github/workflows/od17-preview-canary.yml`, audience
  `https://github.com/interdomestik`, environment `preview`;
- `deployment_status Events=ON`, restored to its preimage OFF at terminal cleanup.

Materialize the branch while deployments remain disabled; prove no deployment. Create
and re-read all four controls. One tree-identical empty commit is the sole real Preview
trigger. Require one READY exact-head non-production Preview, raw no-cache/TypeScript
events, exactly one accepted GitHub Deployment, and one exact preparation artifact.
Then dispatch exactly one protected-main canary. Only a complete canary permits exactly
one audit and one finalizer rerun. Never rerun E2E/Sonar/CodeQL merely because the canary
or provider failed.

### Phase C — terminal closeout

On PASS, merge only the exact measured head, contain automatic CD before jobs, verify
exact-main checks, restore/delete only task-owned provider controls, and merge one
pre-authorized docs-only current-program/current-tracker closeout with exact PR/head/
merge/evidence/metrics and the remaining UI-tree choice. Then remove only exact slice
refs/worktrees. Preserve this chat's bound worktree path by returning it to clean detached
`origin/main`; do not delete the directory.

On any non-PASS terminal, close unmerged, roll back task controls/refs, record one honest
terminal closeout, and stop. No DG51-R2/A1, second Preview/canary, alternate provider,
metric change or hidden retry is permitted.

## Terminal classifications

- `PASS`: exact Preview READY; unique adapter match; one canary artifact; all `/sq`,
  `/mk`, `/en` Lighthouse scores >90; max deployed initial JS <122,880 gzip bytes; each
  attributable exact-content Edge TTFB <100 ms; audit/finalizer and required exact-head
  checks green; exact head merged; provider rollback and canonical closeout complete.
- `budget_failed` / `product_defect`: the measurement or a deterministic repository-owned
  stage actually executed and failed. Do not relabel it.
- `INCONCLUSIVE — measurement_capability_missing/provider_failure`: another identity,
  OIDC, Chrome, network or provider capability failure. This is terminal under DG51.

## Rollback and non-goals

Rollback capability before merge by closing its PR; after merge by reverting its exact
squash merge. Rollback measurement by closing unmerged and deleting only task-owned
provider controls/ref/worktree. P0A/P0B remain intact.

No local Docker/Supabase/dependency install/full build/E2E; no AI OS publication or
maintenance; no Vercel CLI/API/manual deployment; no Production; no provider plan or
machine change; no cache purge; no product/UI/auth/routing/proxy/tenant/schema/RLS/
billing mutation; no T-118/T-117/T-116 implementation; no manufactured metric or review;
no unrelated branch/worktree/stash; no repository_dispatch or provider-neutral
attestation in this lifecycle.
