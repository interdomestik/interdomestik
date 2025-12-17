#!/bin/bash

# Wrapper to start repo-qa-server with correct MCP_REPO_ROOT
export MCP_REPO_ROOT="/Users/arbenlila/development/interdomestikv2"

# Execute the server
exec node /Users/arbenlila/development/mcp-toolkit/servers/repo-qa-server/src/index.mjs
