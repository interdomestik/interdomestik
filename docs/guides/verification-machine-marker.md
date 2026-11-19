# Verification-machine marker

`AGENTS.md` R-04 counts `pnpm pr:verify` and `pnpm security:guard` as gate evidence only on the
dedicated macOS verification machine, recognised by a marker file outside the repository that
holds the machine's recorded configuration. Every other run is a pre-check.

## What the check does

`scripts/ci/verify-machine.mjs` is the first and the last step of both commands.

- `begin` reads `/Library/Application Support/Interdomestik/verify-machine.json`.
  - No file: the run is labelled `PRE-CHECK` and continues, even when no record can be written.
  - The run stops when the file is not a single-link regular file, or when the file or any
    directory above it is not owned by root, is writable by group or others, is writable by the
    current user, or carries a macOS ACL entry that allows anything (an ACL can grant rights such
    as `writesecurity` that a write check does not show; deny-only entries are accepted). The file
    is read through the descriptor that was checked, never followed through a link.
  - Otherwise the live machine must match every recorded field: hardware id (as a sha256), arch,
    macOS version and build, Node, pnpm, container context and engine, the database container's
    pinned image (equal to the CI postgres image) and every published binding (only `5432/tcp` on
    the recorded loopback port), every database URL (exactly
    `postgresql://[user[:password]@]host:port/database`, nothing more), `PW_PORT` and `PORT`
    (decimal), every Playwright tenant host (a bare `host:port`) and `PLAYWRIGHT_BASE_URL`
    (`http://host:port`) on the recorded port and a loopback host, free disk on the repository
    volume and on `/`, and a clean working tree, executable bits included, with no file hidden from
    `git status` (`assume-unchanged` or `skip-worktree`). `SENTRY_AUTH_TOKEN`
    must be unset, and none of the checked settings may be set to an empty value, since some steps
    then fall back to a default. Ports 3000 and 54322 are always refused.
  - Any difference makes the run a `PRE-CHECK` (the owner, 2026-11-19): it prints every
    difference and continues, and it is never gate evidence. Only an untrusted marker stops it.
  - Every setting comes from the checked environment only. The gatekeeper, the build, the E2E
    server and package loaders read env files in different ways, so the checkout may hold no local
    `.env` or `.env.<suffix>` file at all, in any directory (nested checkouts and build output
    included; only `.git` and `node_modules` are skipped) and any letter case, tracked or not. Only
    `.env.example` files, which no loader reads, are fine. The files on disk are searched, since
    git cannot list them all. Every variable whose name contains `DATABASE_URL` is checked. The
    checked repository must be the checkout that runs the lane.
  - The environment is a closed list (`scripts/ci/verify-machine-env-names.mjs`): the login basics
    (`HOME`, `PATH`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `LANG`, `TERM` and what the shell adds),
    the names pnpm adds to a lifecycle script, the checked gate settings and the Mac verify
    isolation settings (`PLAYWRIGHT_BROWSERS_PATH` as an absolute path,
    `INTERDOMESTIK_TASK_OWNS_PORT=1`, `SKIP_DOCKER_DOCTOR=1`, `HOSTNAME=127.0.0.1`). Any other
    variable, such as `NODE_OPTIONS`, `NODE_DEBUG`, `GIT_*`, `PG*` or a test override, makes the run
    a `PRE-CHECK`: the verifier then prints the names (never the values), starts no command and
    records nothing, so no tracing variable can print an environment. The marker is still checked
    first (its ACL listing runs with an empty environment), and an untrusted marker still stops the
    run.
- `stamp` runs only after every other step passed, in the same shell as its `begin`: the pending
  record is kept per shell process (PID and start time) and lane, so a later or concurrent
  `stamp` cannot use it, even in a shell that reuses the PID. It
  re-checks the marker, the live configuration, `HEAD` and the tracked files, then writes the run
  record to `~/Library/Logs/interdomestik-verify/` and prints its mode, head, marker sha256 and
  record sha256 for the PR body. A gate run that stopped matching during the run is recorded as a
  `PRE-CHECK` with the reasons; a moved `HEAD` fails in either mode. A `pending-*` file without a
  final record is a run that did not pass. Gate evidence is only the line that starts with
  `GATE-EVIDENCE`.
- With a marker present, `begin` and `stamp` must run inside the unchanged `pnpm pr:verify` or
  `pnpm security:guard` chain: their parent shell must be exactly `sh -c <committed script>`, so
  `stamp` is reached only after every step before it exited 0. Running the steps by hand never
  produces `GATE-EVIDENCE`. pnpm's `bail` setting must stay on (with `bail=false` a failing nested
  workspace run exits 0), and no lifecycle hook may run after `stamp`: no `post<script>` script
  and no `node_modules/.hooks` directory.
- Both commands take no arguments. pnpm appends arguments to the last step of the chain, which is
  `stamp`, so `stamp` refuses them; run a step with its own arguments directly instead.
- Hosted runs (`GITHUB_ACTIONS=true`) skip the check: hosted checks are separate evidence.
- Without a marker, or without a git repository, the run is a pre-check and its record is
  best-effort: an unreadable repository or a full disk never fails a command that passed.

## Running the lanes on the marked Mac

Once the marker is installed, every run on that Mac is checked against it, in every checkout. Daily
runs in the main checkout, on an uncommitted tree or through the QA MCP tools (which build their
environment from each worktree's own env files) do not match, so they are pre-checks, as before.
For gate evidence, run the lanes from a terminal in a dedicated verify worktree that has no local
`.env` files, with the `ida-mac-verify-pg` container running on `127.0.0.1:55438`, in a clean
environment that holds only the login basics and the gate settings, and check that the last line
starts with `GATE-EVIDENCE`:

```bash
DB=postgresql://postgres:postgres@127.0.0.1:55438/interdomestik_test
env -i HOME="$HOME" PATH="$PATH" USER="$USER" LOGNAME="$LOGNAME" SHELL="$SHELL" TMPDIR="$TMPDIR" \
  LANG="$LANG" TERM="$TERM" DATABASE_URL="$DB" DATABASE_URL_RLS="$DB" E2E_DATABASE_URL="$DB" \
  E2E_DATABASE_URL_RLS="$DB" PW_PORT=3310 PILOT_HOST=pilot.127.0.0.1.nip.io:3310 \
  INTERDOMESTIK_TASK_OWNS_PORT=1 SKIP_DOCKER_DOCTOR=1 HOSTNAME=127.0.0.1 \
  PLAYWRIGHT_BROWSERS_PATH="$HOME/development/rc31-scratch/.pw-browsers" pnpm pr:verify
```

A run from an ordinary shell, which carries many other variables, is a `PRE-CHECK` that says which
names to leave out.

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
env -i HOME="$HOME" PATH="$PATH" node scripts/ci/verify-machine.mjs describe | sudo tee "/Library/Application Support/Interdomestik/verify-machine.candidate.json" > /dev/null
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
`--min-free-gib=`. After a macOS, Node, pnpm or container-runtime update every run is a PRE-CHECK
until the owner creates the marker again; that is intended, because the configuration is part of
the evidence.

Do not run a lane with `NODE_DEBUG` set: pnpm then prints the environment of the commands it
starts, credentials included. The verifier itself starts no command while it is set.
