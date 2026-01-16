# Docker Golden Path Playbook

This document describes how to run the `interdomestikv2` environment in a deterministic, containerized stack. This ensures parity between local dev and CI.

## Ports & Services

| Service      | Internal        | Host Port                      | Login                       |
| ------------ | --------------- | ------------------------------ | --------------------------- |
| **Web**      | `web:3000`      | `3000`                         | -                           |
| **Mailpit**  | `mailpit:1025`  | `8025` (UI)                    | -                           |
| **MinIO**    | `minio:9000`    | `9000` (API), `9001` (Console) | `minioadmin` / `minioadmin` |
| **Redis**    | `redis:6379`    | `6379`                         | -                           |
| **Postgres** | `postgres:5432` | `5432` (Optional)              | `postgres` / `password`     |

## Prerequisites

1.  Docker & Docker Compose installed.
2.  `docker/.env` file exists (copy from `docker/.env.example`).
3.  Host `.env` configured with `DATABASE_URL`.

## Fresh Machine Verification

1.  **Clone Repo**: `git clone ...`
2.  **Setup Env**:
    ```bash
    cp .env.example .env
    cp docker/.env.example docker/.env
    ```
3.  **Start Stack**:
    ```bash
    docker compose up -d --build
    ```
4.  **Install Deps (Container Isolation)**:
    Since `node_modules` are valid only for linux, install them inside the runner:
    ```bash
    ./scripts/docker-run.sh pnpm install
    ```

## Golden Commands

### 1. Database & Seed

Connects to host or optional container DB.

```bash
./scripts/docker-run.sh pnpm db:migrate
./scripts/docker-run.sh pnpm --filter @interdomestik/database seed:e2e -- --reset
./scripts/docker-run.sh pnpm --filter @interdomestik/database seed:assert-e2e
```

### 2. Run Smoke Tests

Runs the E2E smoke suite (headless) within the container.

```bash
./scripts/docker-run.sh pnpm test:smoke
```

### 3. Run Full E2E Suite

```bash
./scripts/docker-run.sh pnpm test:e2e
```

### 4. Optional: Self-contained Postgres

To run a fully isolated stack including database:

```bash
docker compose --profile db up -d
```

_Note: Update `docker/.env` to point to `postgresql://postgres:password@postgres:5432/interdomestik`_

## Troubleshooting

- **"Connection refused" to DB**:
  - **Host Mac/Win**: Use `host.docker.internal` in `DATABASE_URL`.
  - **Linux**: Use `172.17.0.1` or `--net=host`.
- **"MinIO URL errors"**: Ensure `S3_PUBLIC_URL=http://localhost:9000` matches your browser access.
- **"Missing Modules"**: Run `./scripts/docker-run.sh pnpm install` again.
- **"Docker permissions"**: If `node_modules` appear on host owned by root, run `sudo chown -R $USER .` (Anonymous volumes should prevent this, but bind mounts for source code remain).
