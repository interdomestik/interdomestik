# Verification-machine marker

`AGENTS.md` R-04 counts `pnpm pr:verify` and `pnpm security:guard` as gate evidence only on the
dedicated macOS verification machine, recognised by a marker file outside the repository that
holds the machine's recorded configuration. Every other run is a pre-check.

## What the check does

`scripts/ci/verify-machine.mjs` is the first and the last step of both commands.

- `begin` reads `/Library/Application Support/Interdomestik/verify-machine.json`.
  - No file: the run is labelled `PRE-CHECK` and continues, even when no record can be written.
  - The run stops when the file is not a single-link regular file, or when the file or any
    directory above it is not owned by root, is writable by group or others, or is writable by the
    current user (which also covers macOS ACLs). The file is read through the descriptor that was
    checked, never followed through a link.
  - Otherwise the live machine must match every recorded field: hardware id (as a sha256), arch,
    macOS version and build, Node, pnpm, container context and engine, the database container's
    pinned image (equal to the CI postgres image) and every published binding (only `5432/tcp` on
    the recorded loopback port), every database URL, `PW_PORT` and `PORT`, every Playwright tenant
    host and `PLAYWRIGHT_BASE_URL` (recorded port, loopback host), free disk on the repository
    volume and on `/`, and a clean working tree. `SENTRY_AUTH_TOKEN` must be unset. None of these
    settings may come from the `.env` files that the gatekeeper, the build or the E2E server load.
    Ports 3000 and 54322 are always refused. Any difference stops the run.
- `stamp` runs only after every other step passed, in the same shell as its `begin`: the pending
  record is kept per shell process and lane, so a later or concurrent `stamp` cannot use it. It
  re-checks the marker, the live configuration, `HEAD` and the tracked files, then writes the run
  record to `~/Library/Logs/interdomestik-verify/` and prints its mode, head, marker sha256 and
  record sha256 for the PR body. A `pending-*` file without a final record is a run that did not
  pass.
- Hosted runs (`GITHUB_ACTIONS=true`) skip the check: hosted checks are separate evidence.

The check proves which machine and configuration a run used. It is not a cryptographic attestation:
the full run log on the frozen head stays the evidence of which steps ran.

## Creating the marker (owner only)

Agents never create or edit the marker. With the isolated database container of the Mac verify
running (`ida-mac-verify-pg`, CI postgres image, `127.0.0.1:55438`), the owner runs from a checkout.
The candidate is written straight into the root-owned directory, so no other process can change the
reviewed bytes:

```bash
sudo install -d -o root -g wheel -m 755 "/Library/Application Support/Interdomestik"
```

```bash
node scripts/ci/verify-machine.mjs describe | sudo tee "/Library/Application Support/Interdomestik/verify-machine.candidate.json" > /dev/null
```

After reviewing `sudo cat` of that candidate, the owner activates the same bytes:

```bash
sudo chown root:wheel "/Library/Application Support/Interdomestik/verify-machine.candidate.json"
```

```bash
sudo chmod 644 "/Library/Application Support/Interdomestik/verify-machine.candidate.json"
```

```bash
sudo mv "/Library/Application Support/Interdomestik/verify-machine.candidate.json" "/Library/Application Support/Interdomestik/verify-machine.json"
```

`describe` accepts `--container=`, `--db-host=`, `--db-port=`, `--db-name=`, `--app-port=` and
`--min-free-gib=`. After a macOS, Node, pnpm or container-runtime update the check fails until the
owner creates the marker again; that is intended, because the configuration is part of the
evidence.
