#!/bin/bash

# Wrapper to start the repo-local Interdomestik QA MCP server with a stable repo root.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MCP_REPO_ROOT="$REPO_ROOT"
cd "$REPO_ROOT"

exec pnpm exec tsx packages/qa/src/index.ts
