#!/bin/bash
set -euo pipefail

# Vercel Ignore Build Command
# Use this to skip builds when changes don't affect the web application or its dependencies.

echo "VERCEL_GIT_COMMIT_REF: ${VERCEL_GIT_COMMIT_REF:-}"

# 1. Always build main/master/production
if [[ "${VERCEL_GIT_COMMIT_REF:-}" == "main" || "${VERCEL_GIT_COMMIT_REF:-}" == "master" || "${VERCEL_GIT_COMMIT_REF:-}" == "production" ]]; then
  echo "✅ Force build for production branch"
  exit 1
fi

# 2. Skip builds for non-app changes using turbo-ignore
# We use pnpm dlx to ensure we use the workspace-compatible version and avoid npx bloat
set +e
pnpm -w dlx turbo-ignore @interdomestik/web
CODE=$?
set -e

if [[ $CODE -eq 0 ]]; then
  # turbo-ignore exit 0 means "build is required" (changes detected)
  echo "✅ Changes detected in @interdomestik/web or dependencies. Proceeding."
  exit 1
elif [[ $CODE -eq 1 ]]; then
  # turbo-ignore exit 1 means "no changes detected" (safe to skip)
  echo "🛑 No relevant changes detected. Skipping build."
  exit 0
else
  # turbo-ignore error or unknown state
  echo "⚠️ turbo-ignore errored (code=$CODE). Proceeding to be safe."
  exit 1
fi
