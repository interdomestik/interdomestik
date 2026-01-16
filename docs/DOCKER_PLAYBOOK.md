# Docker Playbook (Dev Fast Mode)

We use a split-mode Docker workflow to balance speed and reliability.

## 1. Daily Dev (Fast Mode) - **Default**

Use this for feature development.

- **App**: Runs on host (`pnpm dev`) for hot-reload.
- **Infra**: Runs in Docker (Redis, Mailpit, MinIO).

```bash
# Start Infra
./scripts/docker-dev-up.sh

# Run App (on host)
pnpm dev
```

- **Mailpit UI**: http://localhost:8025
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

## 2. Parity Gate (CI Mode)

Use this before pushing code to verify it works in a rigid, Linux-based production environment.

- **App**: Runs in Docker (`next start`).
- **Tests**: Run in Docker container.

```bash
./scripts/docker-gate.sh
```

_This rebuilds the app image ensuring production compatibility._

## 3. Clean Slate

If data is corrupted or you need to free space:

```bash
./scripts/docker-clean.sh
```

## 4. Troubleshooting

- **"Service not found"**: If you run `docker compose up`, nothing happens because profiles are hidden. Use the scripts or flags (`--profile infra`).
- **"Connection Refused" (App to MinIO)**: Ensure `MINIO_SERVER_URL=http://localhost:9000` is set in compose.
- **"ELF Header Error in Gate"**: Run `./scripts/docker-run.sh pnpm install` manually if the gate script fails to hydrate.
