#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Infra (Dev Fast Mode)..."
echo "Services: Redis, Mailpit, MinIO"

# Only start infra profile services.
# No build happens here usually, as images are pulled.
docker compose --profile infra up -d
docker compose --profile infra run --rm --no-deps createbuckets >/dev/null

echo "✅ Infra is up!"
echo "   - Mailpit: http://localhost:8025"
echo "   - MinIO:   http://localhost:9001"
echo ""
echo "Now run 'pnpm dev' on your host to start the app."
