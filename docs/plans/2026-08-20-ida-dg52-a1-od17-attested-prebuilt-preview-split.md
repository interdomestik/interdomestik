# IDA-DG52-A1 — OD17 Attested-Prebuilt Preview Capability Split

Status: exact candidate only. No repository branch, pull request, implementation writer,
GitHub environment/provider control, token, OIDC mint, workflow dispatch, deployment, or
measurement is authorized until Arben exact-approves the final UTF-8 bytes and SHA-256 and
the resulting authority-only pull request is merged on healthy protected `main`.

Authority base: `main@182fe71b3a50ad076f2a8746bf1b6401a724d2d0`.

Parent authority: `IDA-DG52-OD17-ATTESTED-PREBUILT-PREVIEW-R1`, 34,724 UTF-8 bytes,
SHA-256 `a1170987331531853e168077263093a2d9a5dec197c1cc57ab30c43f54449ab9`.

Parent admission: `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY-ADMISSION-V1`,
7,461 UTF-8 bytes, SHA-256
`d71e241293e37d0d49c8f9fbb05db62f9a7a444c08b936c2bae5301109a132fc`.

## Decision

The parent strategic decision remains correct: GitHub-hosted protected-main jobs build,
hash, attest, verify, and upload one prebuilt Vercel Preview; Vercel performs no source
build; the same sole immutable deployment supplies the OD17 measurement.

The parent Phase-B topology is superseded. Exact Vercel CLI source review, Opus 5 review,
and independent line/security audits proved that one eleven-writer implementation pull
request cannot contain the required archive, toolchain, mutation-confinement, browser/OIDC,
and independent-evidence contracts readably under the repository's unconditional
150-physical-line ceiling. The indispensable thirteenth writer activates DG52's own split
condition. Hiding the work in compressed one-line blocks, an umbrella admission, an
untested helper, a legacy near-limit file, or a silent policy exception is forbidden.

Phase B is therefore decomposed into exactly three sequential, provider-inert child slices:

1. `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-ARTIFACT-FOUNDATION`;
2. `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-DEPLOYMENT-CONFINEMENT`;
3. `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-MEASUREMENT-INTEGRATION`.

The three child outcomes are independently invalidatable and may not be collapsed into one
umbrella admission. Each has its own admission receipt, exact-main R1 approval, one clean
writer/worktree, one implementation branch/PR, exact-head review/check proof, exact-merge
CD containment, exact-main health, and a preauthorized docs-only closeout/next-child
promotion PR. Child N+1 cannot begin until child N's merged closeout has converged canonical
program/tracker state and protected main is exact and healthy.

Only after the third closeout may one separately exact-approved R2 authorize the single
protected-main Z1→Z4 dispatch, one Vercel CLI invocation, exactly one created Preview
deployment, qualification and measurement on that same deployment, cleanup, and one
terminal closeout. No child implementation or transition PR contacts Vercel, mints OIDC,
changes the GitHub `Preview` environment or Trusted Source, or dispatches the workflow.

## Preserved authority

This addendum does not reopen or relabel historical T-115, DG51, or their terminal
`INCONCLUSIVE — measurement_capability_missing/provider_failure` result. It does not alter
OD17 thresholds or timing:

- every locale Lighthouse mobile performance score is strictly greater than 90;
- every locale deployed initial JavaScript total is strictly below 122,880 gzip bytes;
- every locale's first authenticated exact-content Edge TTFB is strictly below 100 ms.

It preserves the parent trust zones, existing Vercel Preview project/team, Preview-only
target, GitHub attestation, exact-main source, one shared runtime consumer, one special
environment, one provider deployment, one canary/evidence result, terminal classifications,
rollback, forward `OD17_READY` semantics, and all non-goals unless narrowed below.

The old eleven-writer admission remains immutable historical evidence and is marked
superseded for Phase-B execution. The abandoned 30,376-byte draft capability R1 and its
212,810-byte lock envelope were never approved and authorize nothing.

## Child A — artifact foundation

Outcome: install a provider-neutral, secretless, inert foundation that canonicalizes the
final Vercel Build Output file set and materializes a pinned, independently validated
Vercel CLI/project input without any workflow or provider call.

Exact semantic writer paths (eight):

1. `scripts/ci/od17-prebuilt-archive.mjs`;
2. `scripts/ci/od17-prebuilt-archive-codec.mjs`;
3. `scripts/ci/od17-prebuilt-archive-codec.test.mjs`;
4. `scripts/ci/od17-prebuilt-runtime-inputs.mjs`;
5. `scripts/ci/od17-prebuilt-runtime-inputs.test.mjs`;
6. `scripts/ci/od17-vercel-cli-lock.json`;
7. `scripts/ci/od17-vercel-project-settings.json`;
8. `scripts/repo-size-budget.json`, changed only by the unchanged deterministic generator.

The archive public boundary owns closed schema, normalized path/mode/metadata policy,
manifest/digest orchestration, served-metadata insertion, and revalidation. The codec owns
only canonical framing, bounded decode/encode, collision detection, and no-follow,
create-exclusive extraction. Its dedicated test covers both codec and public archive
boundary; no archive behavior is hidden in another slice's test.

The runtime-input helper owns closed-schema validation and native `.vercel/project.json`
materialization, canonical base64 decode/re-encode and hashes, lock/package graph validation,
fresh isolated `npm ci --ignore-scripts`, exact CLI identity, and the declared consumer/API
matrix. Its dedicated test covers unknown/malformed snapshot fields, lock/root/integrity/
registry/override/consumer mutations, version drift, fresh-directory behavior, and exact
materialized bytes.

Vercel CLI remains exactly `59.1.4`, but the abandoned Undici 6.28 lock is forbidden.
Child-A R1 must bind a freshly generated npm lock in which every resolved Undici record is
exactly `7.29.0`. Prefer exact consumer-scoped nested overrides for `vercel@59.1.4`,
`@vercel/node@5.10.1`, `@vercel/blob@2.8.0`, and `@vercel/sandbox@2.4.0`; each maps only its
declared Undici child to `7.29.0`. If npm 11.12.1 cannot deduplicate that exact shape, the
only fallback is the closed range `undici@>=5.0.0 <7.29.0 -> 7.29.0` plus the same exact
four-consumer lock assertion. Node 24 satisfies its engine. Static proof must enumerate
`vercel`'s 5.29, `@vercel/node`'s 5.28.4, `@vercel/blob`'s `^6.23.0`, and
`@vercel/sandbox`'s `^7.27.1` declared edges and prove their exact runtime API surface:
Agent/ProxyAgent/dispatch/close/destroy, Headers/request, and fetch. Dynamic proof must show
one 7.29.0
resolution, zero npm-audit findings, exact local import/API smoke, exact `vercel --version`,
and later the real secretless Z1 build. A second Undici version or shared security-policy
exception is a stop. `scripts/security-guard.mjs`, workspace manifests, and shared locks
remain read-only.

## Child B — deployment confinement

Outcome: install and adversarially prove a provider-inert deployment controller plus a
stateful default-deny mutation firewall. No workflow, provider credential, provider read,
or deployment is exercised in this slice.

Exact semantic writer paths (five):

1. `scripts/ci/od17-prebuilt-deployment.mjs`;
2. `scripts/ci/od17-prebuilt-deployment.test.mjs`;
3. `scripts/ci/od17-vercel-mutation-firewall.mjs`;
4. `scripts/ci/od17-vercel-mutation-firewall.test.mjs`;
5. `scripts/repo-size-budget.json`, changed only by the unchanged deterministic generator.

The deployment controller owns exact identity/settings comparison, constant CLI argument
vector, closed child environment, child lifecycle, bounded read-only provider observations,
complete alias/Production pre/post comparison, terminal deployment polling, derived Preview
identity, sanitized receipt, and cleanup. It does not implement HTTP forwarding or mutation
state transitions.

The mutation firewall owns the exclusive canonical loopback origin, Authorization and
request canonicalization, TLS-verified fixed upstream, redirect rejection, JSON/body/count
bounds, the one create/missing-files/upload/final-create state machine, and default denial
of every other method/path/query/state. Its test owns the full smuggling, redirect,
certificate/domain/alias/project/environment/promotion/redeploy/delete, auth, port,
encoded-path, duplicate-query, size/count/retry, `cert_missing`, child-kill, cleanup, and
non-emission matrix. The controller test owns workflow-independent argv, closed environment,
local project link, one-shot, observation, pagination, target derivation, receipt, and
controller/firewall integration.

The future Z3 CLI child uses a canonical bare `http://127.0.0.1:43117` `--api` origin and
one no-shell absolute invocation equivalent to `vercel deploy --yes --prebuilt
--archive=tgz --target=preview --no-wait --json`. Only deployment creation and declared
missing-file uploads are permitted mutations. Every controller/provider HTTP observation
and every CLI request—including the exact project, active Production, paginated alias, and
captured-deployment polling reads—must traverse this same loopback firewall; direct
provider-API egress is forbidden. R1-B must enumerate and statefully allow only those exact
read routes, counts, queries, schemas, and order. Project/domain/certificate/alias/
environment/promotion/redeploy/rollback/delete mutations, a second deployment creation,
and any extra or out-of-state GET are rejected before forwarding. Upstream redirects are
consumed and rejected locally; tests must prove direct-egress and extra-read denial.

Before the sole R2 deployment/upload data-plane mutation path and sole mutation-capable
CLI invocation, the controller must read and validate the exact existing project, the
exact active Production deployment, and a complete bounded paginated alias inventory.
These bounded observations and the later READY/postcondition reads are provider calls but
never mutations. The separately preimage-bound Vercel Trusted Source configure/restore
control mutations are mandatory R2 lifecycle operations and are not counted as a second
deployment/upload mutation path. Alias pages use a
canonical fixed endpoint/query, strictly progressing cursor,
closed record schema, duplicate rejection, per-page/page/total caps, exact team/project
filter, and in-memory canonical comparison. Evidence persists only sanitized counts and
digests, never domain names. After READY it re-reads the same surfaces and permits only the
new deployment's provider-generated `*.vercel.app` Preview alias set. Production pointer,
existing aliases, protection/settings, project/team, and custom-domain assignment remain
identical. Missing pages, cursor loops, truncation, ambiguity, schema drift, or any other
delta is terminal `INCONCLUSIVE — integrity_failure`.

The terminal deployment record must be a closed object with an own `target` property equal
to `null`; `customEnvironment` must be absent or null; exact project/team/owner, READY,
deployment ID, immutable HTTPS root URL, receipt metadata, and the sole created deployment
must agree. `resolvedTarget="preview"` and `production=false` are derived facts; no code may
accept a missing target, invent a returned `Preview` string, or trust a nonexistent provider
`production` boolean. Exact pre-read plus local project name/IDs, firewall-denied project
writes, exact create body, and returned project ID must prove an existing project was used;
an explicit auto-create adversary is mandatory.

All Vercel CLI processes receive fresh HOME/XDG/config/cache state and telemetry/update/
plugin suppression. Z1 remains secretless and receives no Vercel token, OIDC token, DB/auth
secret, or Vercel org/project/team environment variable. Only the sole future Z3 deploy
stage receives `VERCEL_TOKEN`; its child environment is closed and scrubs the three Vercel
ID variables so the exact local `projectName` path is selected. App-principal/OAuth/device
flow, proxy variables, custom CA, Sentry, raw CLI streaming, and unrelated subprocesses are
forbidden.

## Child C — measurement integration

Outcome: integrate the already merged Artifact and Deployment primitives into one inert
protected-main workflow and independently prove authenticated measurement and verdict logic.
The workflow is not dispatched in this slice.

Exact semantic writer paths (ten):

1. `.github/workflows/od17-attested-prebuilt-preview.yml`;
2. `scripts/ci/od17-prebuilt-lighthouse.mjs`;
3. `scripts/ci/od17-prebuilt-lighthouse.test.mjs`;
4. `scripts/ci/od17-prebuilt-browser.mjs`;
5. `scripts/ci/od17-prebuilt-browser.test.mjs`;
6. `apps/web/scripts/check-size-prebuilt.mjs`;
7. `apps/web/scripts/check-size-prebuilt.test.mjs`;
8. `apps/web/scripts/check-size-prebuilt-evidence.mjs`;
9. `apps/web/scripts/check-size-prebuilt-evidence.test.mjs`;
10. `scripts/repo-size-budget.json`, changed only by the unchanged deterministic generator.

The one workflow remains orchestration-only and at or below 150 physical lines. Z1 is a
secretless exact-main build/archive/upload job. Z2 independently reconstructs and verifies
the final archive/predicate, then alone receives attestation write authority. Z3 begins only
after its job-level protected `Preview` approval, independently re-verifies the attestation
and exact file set, then gives the broad repository-scoped token only to the final bounded
deploy stage. Z4 has no provider token or deploy permission; it verifies receipt,
attestation, served metadata, protection, evidence, and verdict and receives only the exact
Trusted Source OIDC grant. Attestation read is explicit in Z3/Z4; write exists only in Z2.
GitHub Deployment delta evidence is either removed or given an explicit read-only
`deployments: read` grant; it is never silently claimed with insufficient permission.

The Lighthouse public boundary owns receipt/attestation/provenance admission, protection
preflight, locale ordering, first exact-content TTFB, evidence schema/bounds, and cleanup.
The browser helper owns Chrome lifecycle, OIDC acquisition, CDP request interception,
mobile Lighthouse, and exact served-JavaScript closure/body/digest/gzip collection. Node
fetches use `redirect: "manual"`. CDP removes any inherited Trusted Source header from every
request and adds it only when the parsed request origin equals the exact immutable Preview
origin; redirects, workers, frames, and third-party subresources never receive it. Chrome
global extra headers are forbidden. Token reflection, persistence, logging, artifact upload,
or inclusion in evidence is terminal.

The verifier public boundary owns artifact/receipt/attestation identity, served/local
provenance crosslinks, unchanged thresholds, terminal-class precedence, and bounded verdict.
The evidence helper independently reloads and validates raw evidence, reconstructs remote
bodies/digests/gzip/closure, matches every served JavaScript byte to its attested local
counterpart, and rejects duplicate/missing/replayed evidence. The final archive and served
metadata are attested; the CLI re-archives only the exact revalidated file set. Dynamic HTML
is hashed and retained as remote evidence but is not falsely claimed byte-identical to a
local static file. OD17 PASS binds served metadata and the complete measured JavaScript
closure; it does not claim equality for unrelated dynamic or non-JavaScript bytes.

## Modularity and proof contract

The unique semantic union is exactly 21 paths; `scripts/repo-size-budget.json` repeats in
all three implementation PRs. Every new workflow, production helper, and test is readable,
Prettier-normalized, and at or below 150 physical lines. No line exception,
`prettier-ignore` compression, generated-code fiction, orphan test, hidden import, or
modularity/security-guard exception is authorized.

Each child has exactly one product/capability outcome, at most three independently
invalidatable implementation proof surfaces (offline focused contracts, exact-head
required checks/review, exact-main health/containment), no provider runtime, and the same
single future R2 consumer. Tests under `scripts/ci/*.test.mjs` are collected directly.
Out-of-glob `apps/web` tests must be explicitly imported by an in-glob test and the exact
import/source contract asserted. Skip is failure for every declared focused contract.

The admission schema's required `currentHeadCanaryBeforeFullCi:true` field means only the
repository current-head contract/admission ordering for these inert children. It never
authorizes a Vercel Preview, workflow dispatch, OIDC mint, provider call, or measurement;
all of those remain forbidden until R2.

Any twenty-second unique semantic path, fourth child, second workflow/runtime consumer,
second special environment, shared production-CD file, product-source edit, line breach,
uncollected test, or inability to fit the frozen responsibility map stops for fresh
strategic authority before implementation.

## Governance and exact ordering

This addendum and three child admissions first merge through one authority-only PR based on
the exact bound main. That PR changes only the addendum, three admission JSON files,
`current-program.md`, `current-tracker.md`, and conditional unchanged-generator
`repo-size-budget.json`. It promotes only Child A to `awaiting_runtime_authority` with
`runtime_authorized:false`. No implementation or provider control is permitted.

Each implementation PR uses exactly the `governanceWriterPaths` frozen by its own admission:
its one named `docs/plans/2026-08-20-...-runtime-r1.md`, `current-program.md`, and
`current-tracker.md`, together with only that admission's semantic `writerPaths`. No other
governance writer is permitted.

Each of the three preauthorized transition PRs may change only its one exact stable,
sanitized child-closeout document, `current-program.md`, `current-tracker.md`, and
conditional unchanged-generator `repo-size-budget.json`:

- Child A:
  `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-artifact-foundation-closeout.md`;
- Child B:
  `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-deployment-confinement-closeout.md`;
- Child C:
  `docs/plans/2026-08-20-ida-od17-attested-prebuilt-preview-measurement-integration-closeout.md`.

Every literal `2026-08-20` prefix in those closeout paths and in the three admission-frozen
R1 paths is the A1 authority date, not the later materialization date. It remains unchanged
when a future child R1 or closeout is created; a different dated path requires fresh
authority rather than an implicit rename.

Each records only the completed child's immutable PR/merge/check/health identities and
promotes only the named next hold; it creates no new receipt, strategy, implementation
writer, or runtime authority and cannot edit this addendum, any admission, architecture,
or another document. The R2 terminal closeout retains the parent DG52 scope: one stable
sanitized terminal evidence document, those same two current-authority files, and the
conditional deterministic size metadata—nothing else.

Thereafter the exact sequence is:

1. exact approve R1-A on healthy authority main;
2. one Child-A implementation PR, then exact merge/CD containment/main health;
3. one preauthorized docs-only Child-A closeout/Child-B promotion PR, then containment and
   exact-main health;
4. exact approve R1-B on that exact main;
5. one Child-B implementation PR, then exact merge/CD containment/main health;
6. one preauthorized docs-only Child-B closeout/Child-C promotion PR, then containment and
   exact-main health;
7. exact approve R1-C on that exact main;
8. one Child-C implementation PR, then exact merge/CD containment/main health;
9. one preauthorized docs-only Child-C closeout/R2 promotion PR, then containment and
   exact-main health;
10. exact approve one R2 bound to all 21 final blobs, exact workflow/main, environment,
    provider project/team, token names only, project/alias/settings preimages, one run,
    one attempt, one deployment, one evidence artifact, rollback, and terminal closeout;
11. perform only that one dispatch/deployment/measurement and one preauthorized terminal
    closeout PR.

Content-addressed strategic approval holds from this point are exactly five: this A1
package, R1-A, R1-B, R1-C, and R2. The later protected `Preview` GitHub-environment
approval remains a mandatory execution stop-and-confirm that enforces R2; it is not a
sixth strategic/content-addressed approval. Docs-only transition/terminal closeouts are
preauthorized and introduce no new strategy hold. Repository PRs before provider contact
are exactly seven: one A1 authority PR, three implementation PRs, and three transition PRs.
The terminal R2 closeout is the eighth PR.

Every PR in this eight-PR sequence that merges to `main`—authority, implementation,
transition, or terminal closeout—pre-arms exact-SHA CD containment. Merge is forbidden
unless read-only preflight proves no online/busy runner capable of immediately executing the
matching self-hosted CD job and no conflicting active concurrency run. Cancel only the exact
merge-SHA CD run and require no runner assignment and zero executed steps; any assignment or
step is containment failure, not clean evidence.

## Runtime and terminal invariants

R2 retains exactly one `workflow_dispatch`, `run_attempt=1`, canonical protected-main
workflow/source, one build, one final archive/attestation chain, one mutation-capable CLI
invocation, one created non-production deployment, one qualification+measurement result,
and one terminal closeout. Same-deployment bounded polling and read-only paginated
observations are not retries. Any second dispatch, deployment creation, redeploy, alias,
promotion, provider build, canary, or alternate environment is forbidden.

Terminal classes remain disjoint and exhaustive through final closeout. Pre-data-plane
approved main/config drift is `NOT_RUN — authority_drift`. Any returned-but-invalid,
duplicate, target/project/alias/provenance/attestation/digest/final-identity mismatch,
including a wrong restored provider-control tuple, is `INCONCLUSIVE — integrity_failure`.
A deterministic trusted repository-owned code or closeout-content failure after valid
environment inputs is `product_defect`; an executed threshold failure is `budget_failed`.

Zero provider record, one otherwise identity-valid record that never reaches READY, a
valid READY Preview that becomes provider/Edge/protection/network unavailable before valid
metrics, or inability to restore a provider control to its preimage is
`INCONCLUSIVE — measurement_capability_missing/provider_failure`. GitHub-hosted runner,
package-registry/runner network, resource, Chrome, pinned-toolchain, GitHub artifact/control,
cleanup, closeout-merge, CD-containment, or exact-main-health infrastructure that becomes
unavailable or is interrupted at any stage before final PASS is
`INCONCLUSIVE — execution_environment_failure` only when objective evidence attributes the
failure there and no earlier class applies. Any otherwise identity-valid Preview
unavailability not objectively attributable to the execution environment belongs
exclusively to provider failure.

A valid metric/verifier result is only candidate-PASS. Only completed provider/environment
restoration, merged terminal closeout, exact-main health, containment, and cleanup yield
final `PASS`. Every first terminal result consumes R2 and proceeds to the bounded cleanup
and one closeout without retry; a cleanup/closeout failure records its terminal class and
cannot authorize another runtime.

## Non-goals

No T-115 retry or history rewrite; no automatic Git Preview, remote Vercel source build,
empty trigger, measurement PR, Production/staging/custom alias, provider plan/project/team
change, credential creation/rotation, CD workflow/action modification, product/UI/route/
proxy/auth/session/tenant/schema/RLS/billing change, threshold/timing change, local product
build/Docker/Supabase/E2E, second runtime, second provider, AI OS mutation, or downstream
T-118/T-117/T-116 promotion is authorized.

## Approval binding

Before human approval, this addendum must be final UTF-8 bytes with one SHA-256. Three
separate child admission receipts must each bind this exact hash and base main, contain one
outcome and only its exact writer map, pass the admission checker independently, and receive
their own exact byte count and SHA-256. Any wording, path, topology, pin, threshold, provider
boundary, terminal class, approval count, or base change invalidates the package and requires
new exact approval before an authority PR.

Each child receipt's `baseSha` records this addendum's authority base only. It does not
pre-authorize a future implementation base: R1-A, R1-B, and R1-C must each bind the exact
then-current protected-main SHA after every required predecessor closeout and health proof.
