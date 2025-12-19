#!/bin/bash

# Wrapper to start ecohub-qa (interdomestik context) with correct MCP_REPO_ROOT
export MCP_REPO_ROOT="/Users/arbenlila/development/interdomestikv2"
export MCP_SERVER_NAME="ecohub-qa"

# Execute the server
exec node /Users/arbenlila/development/interdomestikv2/packages/qa/dist/index.js
