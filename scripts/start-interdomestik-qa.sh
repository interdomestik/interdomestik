#!/bin/bash

# Wrapper to start interdomestik-qa with correct MCP_REPO_ROOT
export MCP_REPO_ROOT="/Users/arbenlila/development/interdomestikv2"

# Execute the server
exec node /Users/arbenlila/development/interdomestikv2/packages/qa/dist/index.js
