#!/bin/bash
set -u

# Vercel Ignore Build Command
# Explicitly checks if changes are relevant to the web app using git diff.

echo "🔍 VERCEL_GIT_COMMIT_REF: ${VERCEL_GIT_COMMIT_REF:-'unknown'}"
echo "🔍 VERCEL_GIT_PREVIOUS_SHA: ${VERCEL_GIT_PREVIOUS_SHA:-'HEAD^'}"
echo "🔍 VERCEL_GIT_COMMIT_SHA: ${VERCEL_GIT_COMMIT_SHA:-'HEAD'}"

# 1. Always build main/master/production
if [[ "${VERCEL_GIT_COMMIT_REF:-}" == "main" || "${VERCEL_GIT_COMMIT_REF:-}" == "master" || "${VERCEL_GIT_COMMIT_REF:-}" == "production" ]]; then
  echo "✅ Force build for production branch"
  exit 1
fi

# 2. Identify Changed Files
# We use git diff to find what changed between the previous deployment and now.
# If VERCEL_GIT_PREVIOUS_SHA is empty (first deploy), we fallback to HEAD^ (last commit).
BASE_SHA="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
TARGET_SHA="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

# Fetch history if shallow (Vercel sometimes does shallow clones)
# We might need to fetch a bit more depth if the SHA is missing, but typically 'Full' clone setting handles this.
# git fetch --depth=100 origin $VERCEL_GIT_COMMIT_REF || true

echo "🔍 Diffing $BASE_SHA...$TARGET_SHA"
CHANGED_FILES=$(git diff --name-only "$BASE_SHA" "$TARGET_SHA")

echo "📂 Changed files:"
echo "$CHANGED_FILES"

# 3. Filter for Relevant Changes
# Triggers build if changes match:
# - apps/web/**
# - packages/** (shared code)
# - package.json / pnpm-lock.yaml / turbo.json (dependencies)
# - .env.local / .env (config)

if echo "$CHANGED_FILES" | grep -qE "^(apps/web/|packages/|package\.json|pnpm-lock\.yaml|turbo\.json|\.env)"; then
  echo "✅ Relevant changes detected. Proceeding with build."
  exit 1
else
  echo "🛑 No changes in web app or shared packages. Skipping build."
  exit 0
fi
