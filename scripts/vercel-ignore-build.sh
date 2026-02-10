#!/bin/bash

# Vercel Ignore Build Command
# Use this to skip builds when changes don't affect the web application or its dependencies.

echo "VERCEL_GIT_COMMIT_REF: $VERCEL_GIT_COMMIT_REF"

# 1. Always build main/master/production
if [[ "$VERCEL_GIT_COMMIT_REF" == "main" || "$VERCEL_GIT_COMMIT_REF" == "master" || "$VERCEL_GIT_COMMIT_REF" == "production" ]]; then
  echo "✅ Force build for production branch"
  exit 1;
fi

# 2. Skip builds for non-app changes using turbo-ignore
# This checks if the @interdomestik/web package or its dependencies changed
npx turbo-ignore @interdomestik/web
BUILD_REQUIRED=$?

if [ $BUILD_REQUIRED -eq 1 ]; then
  echo "✅ Changes detected in @interdomestik/web or dependencies. Proceeding with build."
  exit 1;
else
  echo "🛑 No relevant changes detected. Skipping build."
  exit 0;
fi
