import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { tools } from './tools/list-tools.js';
import { handleToolCall } from './tool-router.js';
import { REPO_ROOT } from './utils/paths.js';
import { findRootEnvFile } from './tools/audits/utils.js';

const envFile = findRootEnvFile(REPO_ROOT);
if (envFile) {
  dotenv.config({ path: envFile, quiet: true });
}

// Server name defaults to interdomestik-qa; override with MCP_SERVER_NAME if needed.
const serverName = process.env.MCP_SERVER_NAME || 'interdomestik-qa';
const server = new Server({ name: serverName, version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Interdomestik QA Server running on stdio (name=${serverName})`);
