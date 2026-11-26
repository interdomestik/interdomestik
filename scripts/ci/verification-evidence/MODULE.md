# Verification evidence

This module defines the delegated M5 lanes and the composed M4 verification chain. The existing full
M4 chain remains the fallback. The owner-approved, external host configuration supplies the
machine and signer identities, current gate authority, and worker isolation.

- `manifest.mjs` reconciles the full, delegated and retained commands.
- `ticket.mjs` binds an attempt to the reviewed head, current main and tested merge.
- `host.mjs` checks protected enrollment and authenticates byte artifacts.
- `machine.mjs` and `m5.mjs` observe the enrolled slot and run the fixed delegated commands.
- `worker.mjs` provides the separate macOS worker account bridge for the enrolled slot.
- `receipt.mjs` validates the complete collected attempt. `m4.mjs` issues tickets, rechecks
  authority and accepts the two local M4 records. The verifier stamps consume that same contract.

New tests in `scripts/ci/*.test.mjs` run in the standard contract shards.
