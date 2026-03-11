#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Infra (Dev Fast Mode)..."
echo "Services: Redis, Mailpit, MinIO"

# Only start infra profile services.
# No build happens here usually, as images are pulled.
docker compose --profile infra up -d redis mailpit minio
echo "⏳ Waiting for MinIO and provisioning buckets..."
docker compose --profile infra run --rm --no-deps createbuckets
echo "✅ MinIO buckets provisioned."

echo "✅ Infra is up!"
echo "   - Mailpit: http://localhost:${DOCKER_MAILPIT_UI_PORT:-8025}"
echo "   - MinIO:   http://localhost:${DOCKER_MINIO_CONSOLE_PORT:-9001}"
echo ""
echo "Now run 'pnpm dev' on your host to start the app."
