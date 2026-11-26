# Narrowed Mac gate adoption proposal

T6 delivery and evidence rules. Status is prepared for review. The rule text below is a proposal
for owner approval. The replay and timing pilot are pending.

## Proposed binding text

Add this sentence to the local verification paragraph of `AGENTS.md` §3 (R-04).

> The owner-approved delegation in `RULES.md`, R-04, may supply named lanes for an eligible local run.

Add this paragraph to `docs/engineering/RULES.md`, R-04, after **Mac use**.

> **Delegated Mac evidence.** After R-10 adoption and owner approval, the lead may use the composed
> M4 verification chain for a reviewed final head. The owner enrolls one M5 slot with its own
> root-owned external marker. Its authority is limited to the M5 lanes in
> `scripts/ci/verification-evidence/manifest.mjs`. The lead obtains an M4-issued ticket after all
> required exact-head reviews and independently resolves the repository, pull request or train,
> head, tree, current main and tested merge at queue, dispatch and acceptance. The head tree
> must equal the tested merge tree. A head, main, review, policy or configuration change,
> cancellation, superseding attempt or ticket expiry voids the ticket and its evidence. M4
> accepts only one complete authenticated M5 receipt for that ticket with matching log and report
> digests. M4 runs all retained lanes in the manifest, including its own migration, seed and
> standalone build for full E2E, and produces separate passed PR and security stamps. The PR stamp
> binds the digest of the M5 receipt. The lead verifies both records and the current ticket scope
> at merge. With unusable M5 evidence, run the full `pnpm pr:verify` and separate
> `pnpm security:guard` on marked M4, retaining actual failures for triage. Trial evidence and
> pre-checks have no merge authority. The existing single-E2E-flake, train and clean-main-update
> provisions apply only under their existing proofs.

The cross-reference above leaves the lane inventory in its manifest for R-03. Apply the
approved text in its binding locations only after the adoption decision.

## Owner procedure

1. Independently review the exact implementation head. Install the trusted copies from that
   head at a root-owned, local path on M4 and M5. Use a checkout or staged bundle containing
   `package.json`, the evidence module and its verifier imports. Every path to the bundle and
   enrolled tools must be protected against the execution accounts. Invoke the installed copy
   for lead-side acceptance, ticket signing and M5 supervision.
2. Give M5 supervision its own standard macOS account. Provision a dedicated non-login worker
   named `_interdomestik_gate_worker` with a private group. Allow the supervision account to use
   passwordless `sudo` solely as that worker on this host. The worker has no administrative
   rights, login, SSH or forwarded agents, GitHub credentials, signer access, Docker socket
   access, or access to the supervisor's private job output. Reserve its UID for this dispatcher.
   The supervisor can access OrbStack to inspect its dedicated, loopback-only verification
   Postgres. Run no pre-check concurrently on the enrolled slot or with that UID.
3. In the supervisor's account select the actual M5 slot A container and ports. Verify that the
   running database uses the CI-pinned Postgres digest and only publishes its DB port to
   `127.0.0.1`. Reserve a different, free loopback app port. Define `bundle` as the absolute path of
   the reviewed bundle, `m5_path` as the enrolled PATH with the intended Node, pnpm, Bash 4 or newer
   and Docker ahead of system fallbacks, `container` and `database` as the plain enrolled names,
   and `db_port` and `app_port` as their decimal ports. From a clean clone that has the CI pin, run
   the following as the non-root supervisor. This stages a draft in a private directory.

   ```sh
   umask 077
   draft="$(mktemp -d)"
   env -i HOME="$HOME" PATH="$m5_path" LANG=C node "$bundle/scripts/ci/verify-machine.mjs" describe \
     --container="$container" --db-name="$database" --db-host=127.0.0.1 \
     --db-port="$db_port" --app-port="$app_port" --min-free-gib=30 > "$draft/base.json"
   env -i HOME="$HOME" PATH="$m5_path" LANG=C node --input-type=module - "$draft/base.json" \
     > "$draft/verify-machine.json" <<'NODE'
   import { execFileSync } from 'node:child_process';
   import { accessSync, constants, realpathSync, readFileSync } from 'node:fs';
   import path from 'node:path';
   const run = (file, args) => execFileSync(file, args, { encoding: 'utf8' }).trim();
   const resolve = tool => {
     for (const dir of process.env.PATH.split(':')) {
       const file = path.join(dir, tool);
       try { accessSync(file, constants.X_OK); return realpathSync(file); } catch (error) {
         if (error.code !== 'ENOENT') throw error;
       }
     }
     throw new Error('Required tool missing');
   };
   const marker = JSON.parse(readFileSync(process.argv[2], 'utf8'));
   marker.schema = 'interdomestik.verify-machine/2';
   marker.role = 'm5-delegated';
   marker.slot = 'A';
   marker.tool_path = process.env.PATH;
   marker.executables = Object.fromEntries(['node', 'pnpm', 'bash'].map(tool => [tool, resolve(tool)]));
   marker.bash_version = run(marker.executables.bash, ['--noprofile', '--norc', '-c',
     'printf "%s" "$BASH_VERSION"']);
   const docker = resolve('docker');
   marker.container_runtime.socket = JSON.parse(run(docker, ['context', 'inspect',
     marker.container_runtime.context, '--format', '{{json .Endpoints.docker.Host}}']));
   console.log(JSON.stringify(marker, null, 2));
   NODE
   ```

4. The owner reviews the draft on M5 and installs the marker and bridge. Inspect the existing
   directory and marker first if either is present. Check the entire ancestor chain with
   `ls -lde`, including `/Library/Application Support`. It must be root-owned, non-writable to
   group, others and the supervisor, with no granting ACL. The files must be regular, single-link
   files. Run the marker readback as the non-root supervisor with the reviewed bundle.

   ```sh
   support='/Library/Application Support/Interdomestik'
   sudo install -d -o root -g wheel -m 0755 "$support"
   sudo install -o root -g wheel -m 0644 "$draft/verify-machine.json" "$support/verify-machine.json"
   sudo install -o root -g wheel -m 0644 \
     "$bundle/scripts/ci/verification-evidence/worker.mjs" "$support/gate-m5-worker.mjs"
   env -i PATH="$m5_path" LANG=C node --input-type=module -e '
     import { pathToFileURL } from "node:url";
     const { readTrustedMarker } = await import(pathToFileURL(process.argv[1]));
     const result = readTrustedMarker();
     if (result.status !== "trusted" || result.marker.role !== "m5-delegated" ||
         result.marker.slot !== "A") process.exit(1);
     console.log(result.sha256);
   ' "$bundle/scripts/ci/verify-machine-trust.mjs"
   ```

5. Provision two dedicated Ed25519 host signing keys under their separate authority accounts,
   using `ssh-keygen -t ed25519 -f ~/.ssh/interdomestik-gate-m4` on M4 and
   `ssh-keygen -t ed25519 -f ~/.ssh/interdomestik-gate-m5` on M5. For unattended file-based
   signing leave the key passphrase empty at the prompts. Restrict the private key and authority
   account directories to their owners. Create a root-owned single-link file
   `gate-evidence-allowed-signers` in `$support` on each host containing the two public key lines in
   the following format. Install the reviewed lead resolver as root-owned executable
   `$support/gate-m4-context` on M4.

   ```text
   interdomestik-gate-m4 namespaces="interdomestik-gate-v1" ssh-ed25519 <M4 public key body>
   interdomestik-gate-m5 namespaces="interdomestik-gate-v1" ssh-ed25519 <M5 public key body>
   ```

6. Once the rule wording is approved, prepare identical `gate-evidence-approval.json` bytes for
   both hosts in trial mode. Install the file as root with owner `root:wheel` and mode `0644`.
   Use full SHA-256 from `shasum -a 256` on each installed file and on the exact approved rule
   text. Get the two generated digests by running
   `node "$bundle/scripts/ci/verification-evidence/m4.mjs" digests` on both installed copies.
   Verify that the M4 and M5 marker digests come from their respective hosts.

   ```json
   {
     "schema": "interdomestik.gate-evidence-approval/1",
     "approved": true,
     "mode": "trial",
     "rulesSha256": "<approved rule text>",
     "m4MarkerSha256": "<M4 verify-machine.json>",
     "m5MarkerSha256": "<M5 verify-machine.json>",
     "m5RunnerSha256": "<digests m5RunnerSha256>",
     "manifestSha256": "<digests manifestSha256>",
     "allowedSignersSha256": "<gate-evidence-allowed-signers>",
     "m4ResolverSha256": "<gate-m4-context>",
     "m5WorkerSha256": "<gate-m5-worker.mjs>"
   }
   ```

7. Verify enrollment with a trial ticket, a complete signed result from the Mac dispatcher and
   `m4.mjs trial-verify` on M4. This exercises the actual worker PATH and the start and finish
   hardware, macOS, runtime, readiness and Git probes. Verify the M4 composed trial yields two
   `TRIAL-EVIDENCE` stamps and that `m4.mjs publish` refuses them. After review of the replay and
   the timing pilot, apply the approved rule text and switch both approval files to `"mode":"gate"`
   only on the owner's activation decision. Issue new tickets. Removing the approval files or
   revoking enrollment disables composition. Handle all pending tickets under the full-M4 fallback.

## Lead tooling changes

**M4 authority**. Install a small trusted resolver at the pinned path above. Its positional
interface is `<queue|dispatch|accept> <trial|gate> <checkout> <owner/repo> <pr:number|train:id>
<attempt-uuid>`. At queue, dispatch and acceptance independently refresh the PR head, current
main, reviewed exact-head verdicts, tested Git merge graph and active gate attempt from their
authoritative sources. For live gates require the open eligible PR or existing R-04 train proof.
For trial use private frozen historical sources reconstructed from the merge evidence. Cancel or
retire earlier attempts in an authoritative lead-side ledger. Invalidate the live attempt on
every bound change and keep that invalidation even if the previous value returns. Resolve all required identities
and check the actual checkout and Git objects locally. Emit only `{"state":"eligible","identity":…}`
on success. The identity fields are `repo`, `subject`, `attempt`, `head`, `tree`, `main`, `merge`
(`commit`, `parents`, `tree`), `reviewSha256` and `configurationSha256`. The review digest covers
verdicts, reviewers and review state on the final head. The configuration digest covers the
effective gate and dispatch configuration and protected tool/configuration identities, with
secret values excluded. Abort on refresh failure, cancellation, supersession, policy change,
missing exact-head approval or an ineligible merge graph. An authority failure is nonzero.

**`lead-gate/precheck.sh` and `mac-job`**. Add a distinct delegated entry that accepts a ticket
directory and the exact Git objects. Send it through `mac-job` on M5 under one exclusive lock with
the usual cancellation and drain behavior. Keep ordinary arbitrary-command pre-checks in their
existing class. Provision a fresh detached clone owned by the supervisor with `origin/main` at
the ticket base, all ticket objects present and no Git alternates. Use a real `.git` directory with a read-only
index, HEAD, objects, config and refs for the worker. A fresh ignored `.git/worktrees` registry can
be writeable by the worker for the two QA contracts that create temporary linked worktrees.
Grant group write access only to that registry and fresh ignored scratch and dependency directories.
Install in the worker with a fresh local store and a frozen lockfile. Skip its Husky prepare
hook because the worker's Git configuration is protected.
Create empty root and workspace `node_modules` and `tmp/m5-tmp` directories. In the fresh
`tmp/m5-home`, seed only a `.gitconfig` with the exact clone path as `safe.directory`. Create job
inputs, worker scratch, and the supervisor output in distinct locations. Keep the output
directory outside worker-readable paths. Deliver the ticket and immutable Git objects without
sharing the slot's remote-tracking refs or dependency store. Resolve staleness again at the
dispatch boundary and cancel expired jobs. Run the fixed
`pnpm --dir "$bundle" pr:verify:m5-evidence "$ticket_dir" "$checkout" "$new_m5_outbox"` through
`mac-job`. The bridge drains the worker UID after each command. The dispatcher holds its lock on
cancellation until the bridge, worker and children are gone. Require a successful dispatcher
finish and complete transfer to a new M4 directory of mode `0700`. A copy, signature, hash,
report, job-status or receipt failure returns nonzero. Keep the failed run and raw transcripts
privately for triage. Publish only after strict verification with the installed `m4.mjs verify`
or `trial-verify` for the pilot. Never combine artifacts from different attempts.

**`lead-gate/gate-corrected.sh`**. Issue via the trusted M4 authority account after review
using `m4.mjs issue <checkout> <owner/repo> <scope> <attempt-uuid> <new-ticket-dir>`. Under the
M4 `mac-job` lock, re-resolve dispatch scope and run the existing isolated setup. Select
`INTERDOMESTIK_M4_EVIDENCE_DIR=<collected-dir> pnpm pr:verify:composed` only after the installed
`m4.mjs verify` passes. The existing gatekeeper migrates, seeds and builds for full E2E.
Composed verification runs the separately stamped `pnpm security:guard` internally. Require the
composed command's successful exit and two stamps from this invocation. Run the installed
`m4.mjs publish <checkout> <collected-dir> <pr-record> <security-record> <new-publish-dir>`.
The publication index binds both final records to their run IDs, head, base, tree, mode, marker
and record hashes, plus the M5 run ID and receipt digest. At merge, recheck the published pair,
hashes, scope, latest reviews, attempt and main against fresh authority. A stale queued attempt
is discarded. Absent or unusable M5 evidence selects the unchanged full `pnpm pr:verify` plus a
separate `pnpm security:guard` on marked M4. If evidence becomes unusable after dispatch, void
the composed attempt and dispatch the full gate on the current reviewed scope. Preserve a failed
test and its own artifacts for
triage. Use the existing R-04 flake proof only with all of its conditions and the retained failed
run. Record actual dispatcher and child exits. Mark attempts superseded or cancelled on the
authority side before releasing their result for consideration. Hosted checks keep their
existing path.

## R-10 replay and timing pilot

Defect class **granting merge evidence for a lane that did not pass on the reviewed head, current
base and approved machine**. Use PR #2157 as a negative replay fixture. Its M5 pre-gate passed on
`774a6443d` and the final M4 run passed on `0d56cac89`.

1. Freeze the last 20 merged PRs at replay start. For each recover its actual tier, exact final
   reviewed head, contemporaneous main SHA, tested merge commit, ordered parents and tree, its
   review and hosted records, and its original local evidence or valid exception.
2. Record one row per PR with the old decision, proposed decision, exact lanes covered by each
   host, fallback reason, queue, install, M5 run, M4 lock occupancy and review-to-merge durations.
   Record source links and gaps in the historical evidence. Report accepted narrowed, full-M4
   fallback, ineligible and false-refusal counts separately. Count a historical full-M4 pass as
   fallback unless a fresh authenticated trial exercised the narrowed decision.
3. For eligible historical heads without M5 evidence, issue trial tickets and run on the
   reconstructed Git objects with the matching full-chain manifest. Use `trial-verify` to
   record whether M4 would accept the ticket and collected lanes. Record any historical command
   difference or unrecoverable data explicitly. Seed missing, empty, unparseable and
   valid-but-empty inputs, replacement of both receipt and log, wrong markers and runtime,
   skipped or failed lanes, a zero-exit pre-check, missing coverage, same-tree different head,
   moving main, cancellation and superseding attempts.
4. Compare the genuine narrowed-path results with historical decisions. Require zero false
   refusals and rejection of every seeded defect before asking the owner to activate the rule.
   On eligible prospective heads, run matched trial gates on both paths and record queue time,
   M5 time, M4 occupancy and review-to-merge elapsed time. Compare the observed occupancy with
   the target of about 42 to 18 minutes, or 24 minutes saved. Account for retries, moved main
   and fallback in elapsed time. The replay and timing figures remain pending until measured.
