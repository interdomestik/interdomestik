# Verification evidence

This module defines the delegated M5 lanes and the composed M4 verification chain. The existing full
M4 chain remains the fallback. The owner-approved, external host configuration supplies the
machine and signer identities, current gate authority, and worker isolation.

- `manifest.mjs` reconciles the full, delegated and retained commands.
- `ticket.mjs` binds an attempt to the reviewed head, current main and tested merge.
- `host.mjs` checks protected enrollment and authenticates byte artifacts.
- `machine.mjs` and `m5.mjs` observe the enrolled slot and run the fixed delegated commands.
- `worker.mjs` provides the separate macOS worker account bridge for the enrolled slot. The
  supervisor sets its checkout as the working directory and supplies the probed tool profile.
  The bridge checks the command-line paths against that context.
- `worker-paths.mjs` confines paths to the checkout, including paths that may not exist yet.
  It also checks access to worker paths and protects the enrolled tool paths. The owner installs
  it beside the worker bridge and enrolls both file digests.
- `receipt.mjs` validates the complete collected attempt. `m4.mjs` issues tickets, binds them
  to the authority's queue, and implements collection, locked dispatch, publication and merge
  recheck. `m4-dispatch.mjs` defines the signed invocation grant consumed by the verifier stamps,
  observes the stamp results from the launcher, and verifies the record bytes before capture.
- `worker-profile.mjs` carries the enrolled worker's exact Git admission and Bash executable
  into commands that otherwise use a reduced environment or a fixed system Bash.

New tests in `scripts/ci/*.test.mjs` run in the standard contract shards.
