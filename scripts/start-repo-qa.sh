#!/bin/bash

# Wrapper to start the repo-local Interdomestik QA MCP server with a stable repo root.
# Do not launch stdio MCP servers through `pnpm exec`; the extra wrapper can interfere
# with the initialize handshake by sitting in the stdin/stdout path.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MCP_REPO_ROOT="$REPO_ROOT"
cd "$REPO_ROOT"

exec "$REPO_ROOT/node_modules/.bin/tsx" packages/qa/src/index.ts
