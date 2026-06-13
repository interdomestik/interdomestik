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
pnpm docker:gate
```

Inspect a failing gate:

```bash
docker compose --profile infra --profile gate --profile ci-local ps
docker compose --profile gate logs -f web playwright redis mailpit minio
```

Reclaim gate cache manually:

```bash
pnpm docker:reclaim:gate
```

## Low-Disk CI Parity

Use the smallest useful lane first:

```bash
pnpm ci:local:quick
```

Use PR/full lanes only when the slice needs them:

```bash
pnpm ci:local:pr
pnpm ci:local:full
```

If CI-local leaves cache behind after an interrupted run:

```bash
bash scripts/docker-reclaim-ci-local.sh
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

| Name                                  | Command                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Interdomestik: start dev infra        | `pnpm docker:infra:up`                                                     |
| Interdomestik: low-disk gate          | `pnpm docker:gate`                                                         |
| Interdomestik: CI quick low-disk      | `pnpm ci:local:quick`                                                      |
| Interdomestik: show containers        | `docker compose --profile infra --profile gate --profile ci-local ps`      |
| Interdomestik: gate logs              | `docker compose --profile gate logs -f web playwright redis mailpit minio` |
| Interdomestik: reclaim gate cache     | `pnpm docker:reclaim:gate`                                                 |
| Interdomestik: reclaim CI-local cache | `bash scripts/docker-reclaim-ci-local.sh`                                  |
