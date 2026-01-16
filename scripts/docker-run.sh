#!/bin/bash
# Helper to run commands inside the Golden Path Docker environment
# Usage: ./scripts/docker-run.sh [command]
# Example: ./scripts/docker-run.sh pnpm test:smoke

if [ -z "$1" ]; then
  echo "Usage: $0 [command]"
  echo "Example: $0 pnpm test:smoke"
  exit 1
fi

# Ensure docker compose is up or at least built?
# We assume the user has run `docker compose up -d` or wants this to spin up a standalone runner.
# Using `run` allows interactive, one-off.

echo "🐳 Running in Docker: $@"
docker compose run --rm playwright "$@"
