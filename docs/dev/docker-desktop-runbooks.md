# Docker Desktop Runbooks

Use these runbooks from Docker Desktop or the terminal when local disk space is tight.

## Daily Dev Infra

Start only the lightweight services:

```bash
pnpm docker:infra:up
```

Then run the app on the host:

```bash
pnpm dev
```

Use Docker Desktop:

- Containers: confirm `redis`, `mailpit`, and `minio` are running.
- Logs: inspect failing service output.
- Volumes: do not delete `minio_data` unless you want to reset local object storage.

Stop infra:

```bash
pnpm docker:infra:down
```

## Low-Disk Gate

Run the production-like Docker smoke gate and reclaim cache afterward:

```bash
pnpm docker:gate:lowdisk
```

Inspect a failing gate:

```bash
pnpm docker:ps
pnpm docker:logs:gate
```

Reclaim gate cache manually:

```bash
pnpm docker:reclaim:gate
```

## Low-Disk CI Parity

Use the smallest useful lane first:

```bash
pnpm ci:local:quick:lowdisk
```

Use PR/full lanes only when the slice needs them:

```bash
pnpm ci:local:pr:lowdisk
pnpm ci:local:full:lowdisk
```

If CI-local leaves cache behind after an interrupted run:

```bash
pnpm docker:reclaim:ci-local
```

## Disk Checks

Check Docker disk use:

```bash
pnpm docker:df
```

Light cleanup:

```bash
pnpm docker:reclaim
```

Aggressive cleanup:

```bash
pnpm docker:reclaim:full
```

## Docker Desktop Runbook Entries

Create these entries in Docker Desktop Runbooks:

| Name                                  | Command                        |
| ------------------------------------- | ------------------------------ |
| Interdomestik: start dev infra        | `pnpm docker:infra:up`         |
| Interdomestik: low-disk gate          | `pnpm docker:gate:lowdisk`     |
| Interdomestik: CI quick low-disk      | `pnpm ci:local:quick:lowdisk`  |
| Interdomestik: show containers        | `pnpm docker:ps`               |
| Interdomestik: gate logs              | `pnpm docker:logs:gate`        |
| Interdomestik: reclaim gate cache     | `pnpm docker:reclaim:gate`     |
| Interdomestik: reclaim CI-local cache | `pnpm docker:reclaim:ci-local` |
