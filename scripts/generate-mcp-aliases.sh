#!/bin/bash

# scripts/generate-mcp-aliases.sh
# description: Generates shell aliases for MCP servers defined in .vscode/mcp.json

MCP_CONFIG=".vscode/mcp.json"

if [ ! -f "$MCP_CONFIG" ]; then
    echo "Error: $MCP_CONFIG not found"
    exit 1
fi

echo "# Add these aliases to your shell config (e.g. .zshrc) or run directly:"
echo ""

# Use jq if available, otherwise simple grep/awk parsing (fragile)
# Assuming developer has jq or python
if command -v jq &> /dev/null; then
    # Parse keys
    SERVERS=$(jq -r '.mcpServers | keys[]' "$MCP_CONFIG")
    
    for SERVER in $SERVERS; do
        CMD=$(jq -r ".mcpServers[\"$SERVER\"].command" "$MCP_CONFIG")
        ARGS=$(jq -r ".mcpServers[\"$SERVER\"].args | join(\" \")" "$MCP_CONFIG")
        ENV_VARS=$(jq -r ".mcpServers[\"$SERVER\"].env // {} | to_entries | map(\"\(.key)=\(.value)\") | join(\" \")" "$MCP_CONFIG")
        
        # Determine alias name (e.g., mcp-postgres, mcp-stripe)
        ALIAS_NAME="mcp-$SERVER"
        
        echo "alias $ALIAS_NAME='$ENV_VARS $CMD $ARGS'"
    done
else
    echo "# jq not found. Please install jq to auto-generate aliases."
    echo "# Manual mapping required."
fi

echo ""
echo "# Usage: eval \"\$(./scripts/generate-mcp-aliases.sh)\""
