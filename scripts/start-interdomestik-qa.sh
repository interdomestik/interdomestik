#!/bin/bash

# Wrapper to start interdomestik-qa with correct MCP_REPO_ROOT
export MCP_REPO_ROOT="/Users/arbenlila/development/interdomestikv2"
export MCP_SERVER_NAME="interdomestik-qa"

# Execute the server
exec node /Users/arbenlila/development/interdomestikv2/packages/qa/dist/index.js
