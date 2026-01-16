# Docker Daily Playbook

## 1. Daily Development (Fastest Workflow)

This workflow optimizes for iteration speed. You run the App locally but use instant, isolated Docker infrastructure.

### Start Infrastructure Only

```bash
docker compose up -d redis mailpit minio
# (Optional: add 'postgres' if you need the isolated DB)
```

### Run App on Host

```bash
pnpm dev
# App: http://localhost:3000
# Mailpit: http://localhost:8025
# MinIO: http://localhost:9001
```

## 2. Parity Checks (Golden Path)

When you need to verify your code works in a production-like environment (equivalent to CI/CD), use the full container stack.

### Boot Full Stack

```bash
docker compose up -d --build
# --build ensures the Playwright runner and Web app are fresh
```

### Run Migrations & Seeds (Inside Container)

This ensures the DB is in a known state compatible with the containerized app.

```bash
./scripts/docker-run.sh pnpm db:migrate
./scripts/docker-run.sh pnpm --filter @interdomestik/database seed:e2e -- --reset
```

### Run Tests

```bash
# Smoke Test (Fast check)
./scripts/docker-run.sh pnpm test:smoke

# Full E2E (Comprehensive)
./scripts/docker-run.sh pnpm test:e2e
```

## 3. CI-Parity Gate

This single command sequence replicates exactly what should happen in CI to approve a PR. If this passes, your branch is safe to merge.

**Usage:**

```bash
# From repo root
./scripts/safe-gate.sh
```

## 4. Troubleshooting

| Symptom                           | Cause                                                  | Fix                                                                                 |
| :-------------------------------- | :----------------------------------------------------- | :---------------------------------------------------------------------------------- |
| **"ELF header" or binary error**  | Host `node_modules` (macOS) visible to Linux container | Run `./scripts/docker-run.sh pnpm install` to hydrate Linux binaries in the volume. |
| **Tests flake / crashing**        | Playwright running out of shared memory                | Ensure `shm_size: '1gb'` is in `docker-compose.yml`.                                |
| **Browser: "Connection Refused"** | MinIO URL points to docker network name                | Set `MINIO_SERVER_URL=http://localhost:9000` in compose.                            |
| **Build: "Heap out of memory"**   | Next.js build needs more RAM                           | Ensure `NODE_OPTIONS="--max-old-space-size=4096"` in `apps/web/Dockerfile`.         |
| **"No space left on device"**     | Docker VM disk full                                    | `docker system prune -a --volumes`                                                  |

## 5. Environment Reference

See `docker-compose.yml` for exact ports.

- **Web**: `web:3000` (internal), `localhost:3000` (browser)
- **Mailpit**: `mailpit:1025` (smtp), `localhost:8025` (ui)
- **MinIO**: `minio:9000` (api), `localhost:9001` (console)
