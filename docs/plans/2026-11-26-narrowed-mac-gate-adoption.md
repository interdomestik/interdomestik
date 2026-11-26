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
> required exact-head reviews. The M4 queue records the ticket ID, repository, pull request or
> train and attempt. Dispatch, both stamps and publication use that queued identity. The lead
> independently resolves the head, tree, current main and tested merge at queue, dispatch and
> acceptance. The head tree
> must equal the tested merge tree. A head, main, review, policy or configuration change,
> cancellation, superseding attempt or ticket expiry voids the ticket and its evidence. M4
> accepts only one complete authenticated M5 receipt for that ticket with matching log and report
> digests and a successful dispatcher finish for the same receipt. M4 runs all retained lanes
> in the manifest, including its own migration, seed and
> standalone build for full E2E, and produces separate passed PR and security stamps. The PR stamp
> binds the digest of the M5 receipt. The M4 dispatcher captures both run IDs and record hashes
> from the invocation whose successful exit it observes. Publication and merge acceptance require
> that captured pair and the successful M4 dispatcher finish on the current ticket scope.
> With unusable M5 evidence, run the full `pnpm pr:verify` and separate
> `pnpm security:guard` on marked M4, retaining actual failures for triage. Trial evidence and
> pre-checks have no merge authority. The existing single-E2E-flake, train and clean-main-update
> provisions apply only under their existing proofs.

The cross-reference above leaves the lane inventory in its manifest for R-03. Apply the
approved text in its binding locations only after the adoption decision.

## Owner procedure

1. Independently review the exact implementation head. Install the trusted copies from that
   head at a root-owned, local path on M4 and M5. Use a checkout or staged bundle containing
   `package.json`, the evidence module and its verifier imports. Every path to the bundle and
   enrolled tools must be protected against the execution accounts. Use root-owned M5 tools
   in protected directories so package command contracts also admit the installation.
   Invoke the installed copy
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

4. The owner stages and reviews the marker in a directory under root control on M5. Inspect the
   existing directory and marker first if either is present. Check the entire ancestor chain with
   `ls -lde`, including `/Library/Application Support`. It must be root-owned, non-writable to
   group, others and the supervisor, with no granting ACL. The files must be regular, single-link
   files. Stage the bytes first, then review the staged file and retain its full digest in the
   owner's enrollment record.

   ```sh
   support='/Library/Application Support/Interdomestik'
   sudo install -d -o root -g wheel -m 0755 "$support"
   owner_stage="$(sudo mktemp -d "$support/.enrollment.XXXXXX")"
   sudo install -o root -g wheel -m 0600 "$draft/verify-machine.json" "$owner_stage/verify-machine.json"
   sudo cat "$owner_stage/verify-machine.json"
   sudo /usr/bin/shasum -a 256 "$owner_stage/verify-machine.json"
   ```

   Set `reviewed_sha256` from the digest retained by the owner after review. Compare the staged bytes
   before installing and compare the installed bytes again using the trusted marker reader as
   the non-root supervisor.

   ```sh
   staged="$(sudo /usr/bin/shasum -a 256 "$owner_stage/verify-machine.json")" &&
     test "${staged%% *}" = "$reviewed_sha256" &&
     sudo install -o root -g wheel -m 0644 \
       "$owner_stage/verify-machine.json" "$support/verify-machine.json" || exit 1
   sudo install -o root -g wheel -m 0644 \
     "$bundle/scripts/ci/verification-evidence/worker.mjs" "$support/gate-m5-worker.mjs" || exit 1
   installed="$(env -i PATH="$m5_path" LANG=C node --input-type=module -e '
     import { pathToFileURL } from "node:url";
     const { readTrustedMarker } = await import(pathToFileURL(process.argv[1]));
     const result = readTrustedMarker();
     if (result.status !== "trusted" || result.marker.role !== "m5-delegated" ||
         result.marker.slot !== "A") process.exit(1);
     console.log(result.sha256);
   ' "$bundle/scripts/ci/verify-machine-trust.mjs")" &&
     test "$installed" = "$reviewed_sha256" || exit 1
   ```

5. Provision two dedicated Ed25519 host signing keys under their separate authority accounts,
   using `ssh-keygen -t ed25519 -f ~/.ssh/interdomestik-gate-m4` on M4 and
   `ssh-keygen -t ed25519 -f ~/.ssh/interdomestik-gate-m5` on M5. For unattended file-based
   signing leave the key passphrase empty at the prompts. Restrict the private key and authority
   account directories to their owners. Create a root-owned single-link file
   `gate-evidence-allowed-signers` in `$support` on each host containing the two public key lines in
   the following format. Install the reviewed lead resolver and launcher as root-owned
   executables `$support/gate-m4-context` and `$support/gate-m4-runner` on M4. Run M4 authority
   and M4 verification under separate accounts. Keep the M4 signing key, queue state,
   collection and captured output private to the authority account. The verification
   account can read the signed grant through a supervisor-owned directory and write its own
   verifier records. Give the authority account read access to those records for capture,
   with fresh run IDs for every invocation and no write access from the verification account
   to the authority's paths. The verification account runs the reviewed head using the
   marked M4 setup and its isolated database, with no authority or GitHub credentials.

   ```text
   interdomestik-gate-m4 namespaces="interdomestik-gate-v1" ssh-ed25519 <M4 public key body>
   interdomestik-gate-m5 namespaces="interdomestik-gate-v1" ssh-ed25519 <M5 public key body>
   ```

6. Once the rule wording is approved, prepare identical `gate-evidence-approval.json` bytes for
   both hosts in trial mode. Install the file as root with owner `root:wheel` and mode `0644`.
   Use full SHA-256 from `shasum -a 256` on each installed file and on the exact approved rule
   text. `rulesSha256` is the owner's attestation to that text. The code validates the
   digest format and binds the whole approval file to tickets and dispatch grants.
   The owner compares the attested digest with the effective rule text before activation.
   Get the two generated digests by running
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
     "m4LauncherSha256": "<gate-m4-runner>",
     "m5WorkerSha256": "<gate-m5-worker.mjs>"
   }
   ```

7. Verify enrollment with a trial ticket, a complete signed result from the Mac dispatcher and
   `m4.mjs trial-verify <authority-checkout> <queued-job.json> <collected-dir>` on M4. This
   exercises the actual worker PATH and the start and finish
   hardware, macOS, runtime, readiness and Git probes. Verify the M4 composed trial yields two
   `TRIAL-EVIDENCE` stamps and that `m4.mjs publish` refuses them. After review of the replay and
   the timing pilot, apply the approved rule text and switch both approval files to `"mode":"gate"`
   only on the owner's activation decision. Issue new tickets. Removing the approval files or
   revoking enrollment disables composition. Handle all pending tickets under the full-M4 fallback.

## Lead tooling changes

The repository supplies the ticket issuer, authenticated collector, dispatch decision and stamp
capture, publisher, and merge-time verifier. The lead deploys the host adapters below in its own
tooling. Verify them through the real Mac queues before activation.

**M4 authority.** Install the protected resolver with this positional interface.

```text
gate-m4-context <queue|record|collect|dispatch|accept|finish> <trial|gate> <authority-checkout> <owner/repo> <pr:number|train:id> <attempt-uuid> [ticket-id]
```

- At every stage independently resolve the PR head, current main, exact-head reviews, tested
  merge graph and active attempt from authoritative sources. Require an open eligible PR or
  existing R-04 train proof. For trial use frozen historical sources reconstructed from the
  merge evidence. Invalidate a live attempt on every bound change and retain that invalidation
  if the old value returns. Refresh failures and ineligible attempts return nonzero.
- `queue` admits a new attempt. `record` atomically records the newly issued ticket ID against
  that attempt while the scope is still current, then returns the independent queue row. Refuse
  an attempt with a previously recorded ticket. The lead retains the issuer's JSON stdout as
  `queued-job.json` in the M4 authority's private directory. All later stages retrieve their
  `ticketId` from that protected queue row. The final argument is a lookup assertion.
- Every successful reply has shape `{"state":"eligible","identity":{…}}`. The identity contains
  `repo`, `subject`, `attempt`, `head`, `tree`, `main`, `merge` (`commit`, `parents`, `tree`),
  `reviewSha256` and `configurationSha256`. The review digest covers verdicts, reviewers and
  review state. The configuration digest covers effective gate and dispatch configuration and
  protected tool identities, with secret values excluded. Responses from `record`, `collect`,
  `dispatch`, `accept` and `finish` include the stored `ticketId`. After successful M5 transfer,
  include the protected M5 outcome as `m5: {dispatcherExit, runId, receiptSha256}`.
- For `dispatch` and `accept`, require the caller to belong to the current M4 `mac-job` running
  under the exclusive lock for this attempt. Bind the queue row to its unique `macJobId`.
  At `finish`, require the same job's terminal ledger event to be `finish` with status zero.
  Include `macJobId` at all three stages and `dispatcherExit` at `finish`. The lead records
  cancellation, failed drain, and supersession in the protected queue before considering the
  result. A cancelled, stale or incomplete result cannot authorize publication.

**`lead-gate/precheck.sh` and M5 `mac-job`.** Add a delegated entry for a ticket directory and
exact Git objects. Route it through the one exclusive M5 lock with the existing cancellation
and drain behavior. Keep ordinary pre-checks on their existing path and serialize any use
of the enrolled slot or worker UID with that lock. On an eligible dispatch, provision a fresh
supervisor-owned detached clone with all bound Git objects, pinned historical objects used by
the contracts, `origin/main` at the ticket base, the canonical GitHub origin URL and no alternates.
Give the worker read-only tracked inputs, HEAD, index, objects, config and
refs. The empty ignored `.git/worktrees` registry is writable for the linked-worktree contract.
Grant the worker write access to fresh ignored scratch, root and workspace `node_modules`,
`tmp/m5-home` and `tmp/m5-tmp`. The bridge installs the exact `safe.directory` entry only in
the child Git environment. Keep the supervisor output outside the worker's readable paths.

Run the fixed command below through M5 `mac-job`. The bridge uses the enrolled Bash and exact
Git profile and drains the worker UID. Keep the dispatch lock until those children exit.

```sh
pnpm --dir "$bundle" pr:verify:m5-evidence "$ticket_dir" "$checkout" "$new_m5_outbox"
```

Require a matching successful dispatcher finish, then copy the complete M5 outbox to a new M4
authority directory of mode `0700`. Record the observed finish and the transferred receipt's
run ID and SHA-256 in the protected queue row. Call the installed
`m4.mjs verify <authority-checkout> <queued-job.json> <collected-dir>` for gate mode, or
`trial-verify` with the same arguments for the pilot. A failed dispatcher status, cancelled
attempt, transfer, signature, hash, report or receipt fails the delegated entry with nonzero
status. Clear its M5 outcome and retain the transcript and artifacts privately for triage.
The next eligible M4 dispatch selects the full path. Never reuse output from an earlier attempt.

**`lead-gate/gate-corrected.sh` and the protected M4 launcher.** Issue through the trusted
M4 authority account with `m4.mjs issue <authority-checkout> <owner/repo> <scope> <attempt-uuid>
<new-ticket-dir>`. Keep the authority's clean checkout private and use a separate checkout of the
same reviewed head for the M4 verifier account. Enqueue the installed dispatcher as the
command of the ordinary M4 gate job. Use the attempt UUID in the unique `m4-<attempt-uuid>`
label and bind it to the `mac-job` row in the protected resolver.

```sh
"$mac_job" run gate lead "$authority_checkout" "$head" --label "m4-$attempt" -- \
  "$node" "$bundle/scripts/ci/verification-evidence/m4.mjs" dispatch \
  "$authority_checkout" "$queued_job" "$collected_dir" "$m4_checkout" \
  "$new_grant_dir" "$m4_verifier_record_dir" "$new_capture_dir"
```

The dispatcher selects under that lock. The grant directory is a fresh child of a
supervisor-owned absolute path whose parents permit traversal by the verifier. Keep the
capture path within a private authority directory. The protected `gate-m4-runner` accepts
`composed <checkout> <grant-dir> <queued-job-json>` or
`full <checkout> <head> <main> <tree>`. It drops to the verifier account, uses the existing
isolated setup, launches the fixed package commands, reports the actual status, and drains
the account's children before returning. The composed invocation sets only the checked gate
environment plus `INTERDOMESTIK_M4_DISPATCH_DIR` and `INTERDOMESTIK_M4_QUEUE_SCOPE` from those
arguments, then runs `pnpm pr:verify:composed`. The full invocation checks the exact Git scope
and runs `pnpm pr:verify` and separate `pnpm security:guard`, requiring both standard passed M4
stamps. Keep the existing full launcher for hosts without delegated enrollment.

Publish only after both the command and M4 dispatcher finish successfully and a composed
capture exists. Use the trusted scripts through merge.

```sh
"$node" "$bundle/scripts/ci/verification-evidence/m4.mjs" publish \
  "$authority_checkout" "$queued_job" "$collected_dir" "$new_capture_dir" "$new_publish_dir"
"$node" "$bundle/scripts/ci/verification-evidence/m4.mjs" merge-check \
  "$authority_checkout" "$queued_job" "$collected_dir" "$new_publish_dir"
```

The signed publication binds each passed record's run ID and hash to the observed invocation,
queue ticket, M4 `mac-job` ID, exact Git scope, and M5 receipt. With missing or unusable M5
evidence, use the full path under the lock while the queue is eligible. Discard an ineligible
queue entry. Preserve a composed lane failure and its own artifacts for triage. Apply an R-04
flake proof only with all its existing conditions and the retained failed run. Before
activation exercise the real dispatchers with a clean narrowed run, wrong same-head ticket,
absent M5 output, cancelled M5 and M4 runs, and a composed test failure. Check the ledger
outcome, M4 selection, and refusal to publish incomplete or cancelled captures. Hosted checks
keep their existing path.

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
   difference or unrecoverable data explicitly. A historical checkout that cannot execute
   the enrolled profile counts as a coverage gap for the replay. Seed missing, empty, unparseable and
   valid-but-empty inputs, replacement of both receipt and log, wrong markers and runtime,
   skipped or failed lanes, a zero-exit pre-check, missing coverage, same-tree different head,
   moving main, cancellation and superseding attempts.
4. Compare the genuine narrowed-path results with historical decisions. Require zero false
   refusals and rejection of every seeded defect before asking the owner to activate the rule.
   On eligible prospective heads, run matched trial gates on both paths and record queue time,
   M5 time, M4 occupancy and review-to-merge elapsed time. Compare the observed occupancy with
   the target of about 42 to 18 minutes, or 24 minutes saved. Account for retries, moved main
   and fallback in elapsed time. The replay and timing figures remain pending until measured.
