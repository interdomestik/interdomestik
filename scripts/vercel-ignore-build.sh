#!/bin/bash
set -euo pipefail

# Always build on production branches
if [[ "${VERCEL_GIT_COMMIT_REF:-}" == "main" || "${VERCEL_GIT_COMMIT_REF:-}" == "master" || "${VERCEL_GIT_COMMIT_REF:-}" == "production" ]]; then
  echo "✅ Force build for production branch: ${VERCEL_GIT_COMMIT_REF:-}"
  exit 1
fi

echo "🔎 turbo-ignore check for @interdomestik/web…"

# Prefer pnpm dlx (consistent toolchain). If it fails for any reason, fall back to build (exit 1).
# Note: VERCEL_GIT_PREVIOUS_SHA is required for turbo-ignore to work correctly.
# Vercel handles this automatically in most cases.
if pnpm -w dlx turbo-ignore @interdomestik/web; then
  echo "🛑 No relevant changes detected. Skipping build."
  exit 0
else
  echo "✅ Relevant changes (or error/uncertainty). Proceeding with build."
  exit 1
fi
