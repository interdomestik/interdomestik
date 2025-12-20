#!/bin/bash

# Wrapper to start interdomestik-qa with correct MCP_REPO_ROOT
set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MCP_REPO_ROOT="$REPO_ROOT"
export MCP_SERVER_NAME="interdomestik-qa"

# Execute the server
exec node "$REPO_ROOT/packages/qa/dist/index.js"
