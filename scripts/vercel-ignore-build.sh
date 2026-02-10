#!/bin/bash
set -u

# Vercel Ignore Build Command
echo "🔍 VERCEL_GIT_COMMIT_REF: ${VERCEL_GIT_COMMIT_REF:-'unknown'}"

# 1. Always build main/master/production
if [[ "${VERCEL_GIT_COMMIT_REF:-}" == "main" || "${VERCEL_GIT_COMMIT_REF:-}" == "master" || "${VERCEL_GIT_COMMIT_REF:-}" == "production" ]]; then
  echo "✅ Force build for production branch"
  exit 1
fi

# 2. Skip builds for non-app changes using turbo-ignore
echo "🔍 Running turbo-ignore for @interdomestik/web..."

# Use npx --yes to ensure non-interactive download in Vercel's pre-install env
if npx --yes turbo-ignore @interdomestik/web; then
  # exit 0 means changes were detected => Build Required
  echo "✅ changes detection: YES (code 0). Proceeding with build."
  exit 1
else
  # exit code is non-zero
  CODE=$?
  
  if [[ $CODE -eq 1 ]]; then
    # exit 1 means NO changes detected => Skip Build
    echo "🛑 changes detection: NO (code 1). Skipping build."
    exit 0
  else
    # exit > 1 means error happened => Fail Safe (Build)
    echo "⚠️ turbo-ignore failed with error (code $CODE). Proceeding to be safe."
    exit 1
  fi
fi
