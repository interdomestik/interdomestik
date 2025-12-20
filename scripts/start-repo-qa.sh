#!/bin/bash

# Wrapper to start repo-qa-server with correct MCP_REPO_ROOT
set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MCP_REPO_ROOT="$REPO_ROOT"

# Execute the server
exec node /Users/arbenlila/development/mcp-toolkit/servers/repo-qa-server/src/index.mjs
