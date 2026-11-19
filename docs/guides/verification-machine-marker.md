# Verification-machine marker

`AGENTS.md` R-04 counts `pnpm pr:verify` and `pnpm security:guard` as gate evidence only on the
dedicated macOS verification machine, recognised by a marker file outside the repository that
holds the machine's recorded configuration. Every other run is a pre-check.

## What the check does

`scripts/ci/verify-machine.mjs` is the first and the last step of both commands.

- `begin` reads `/Library/Application Support/Interdomestik/verify-machine.json`.
  - No file: the run is labelled `PRE-CHECK` and continues.
  - The file or its directory is not owned by root, is writable by group or others, is a link, or
    is malformed: the run stops.
  - Otherwise the live machine must match every recorded field: hardware id (as a sha256), arch,
    macOS version and build, Node, pnpm, container context and engine, the database container's
    pinned image (equal to the CI postgres image) and its loopback binding, every database URL,
    `PW_PORT`, free disk on the repository volume and on `/`, a clean working tree, and no
    `SENTRY_AUTH_TOKEN`. Ports 3000 and 54322 are always refused. Any difference stops the run.
- `stamp` runs only after every other step passed. It checks that `HEAD`, the tracked files and the
  marker did not change, then writes the run record to `~/Library/Logs/interdomestik-verify/` and
  prints its mode, head, marker sha256 and record sha256 for the PR body. A `pending-*` file without
  a final record is a run that did not pass.
- Hosted runs (`GITHUB_ACTIONS=true`) skip the check: hosted checks are separate evidence.

## Creating the marker (owner only)

Agents never create or edit the marker. With the isolated database container of the Mac verify
running (`ida-mac-verify-pg`, CI postgres image, `127.0.0.1:55438`), the owner runs from a checkout:

```bash
node scripts/ci/verify-machine.mjs describe > "$TMPDIR/verify-machine.json"
```

reviews the JSON, then installs it as root:

```bash
sudo install -d -o root -g wheel -m 755 "/Library/Application Support/Interdomestik"
sudo install -o root -g wheel -m 644 "$TMPDIR/verify-machine.json" "/Library/Application Support/Interdomestik/verify-machine.json"
```

`describe` accepts `--container=`, `--db-host=`, `--db-port=`, `--db-name=`, `--app-port=` and
`--min-free-gib=`. After a macOS, Node, pnpm or container-runtime update the check fails until the
owner creates the marker again; that is intended, because the configuration is part of the
evidence.
