#!/bin/bash

# Wrapper to start Interdomestik QA from the attested control source.
# Do not launch stdio MCP servers through `pnpm exec`; the extra wrapper can interfere
# with the initialize handshake by sitting in the stdin/stdout path.
set -euo pipefail
LAUNCHER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOLVER="$LAUNCHER_ROOT/scripts/qa-mcp-control-runtime.mjs"
CONTROL_JSON="$(node "$RESOLVER")"
control_field() {
  node -e 'const value = JSON.parse(process.argv[1]); process.stdout.write(value[process.argv[2]])' "$CONTROL_JSON" "$1"
}
CONTROL_ROOT="$(control_field root)"
CONTROL_HEAD="$(control_field head)"
DEPENDENCY_ROOT="$(control_field dependencyRoot)"
export MCP_REPO_ROOT="$CONTROL_ROOT"
export MCP_SERVER_SOURCE_ROOT="$CONTROL_ROOT"
export MCP_SERVER_SOURCE_HEAD="$CONTROL_HEAD"
export MCP_SERVER_NAME="interdomestik_qa"
cd "$CONTROL_ROOT"

exec "$DEPENDENCY_ROOT/node_modules/.bin/tsx" "$CONTROL_ROOT/packages/qa/src/index.ts"
