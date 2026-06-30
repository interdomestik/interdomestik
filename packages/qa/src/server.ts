import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { tools } from './tools/list-tools.js';
import { handleToolCall } from './tool-router.js';
import { REPO_ROOT } from './utils/paths.js';
import { findRootEnvFile } from './tools/audits/utils.js';

function resolveServerName(rawName: string | undefined): string {
  const candidate = rawName?.trim();
  if (!candidate) return 'interdomestik-qa';
  return /^[a-z0-9_.-]{1,64}$/i.test(candidate) ? candidate : 'interdomestik-qa';
}

const envFile = findRootEnvFile(REPO_ROOT);
if (envFile) {
  dotenv.config({ path: envFile, quiet: true });
}

// Server name defaults to interdomestik-qa; override with MCP_SERVER_NAME if needed.
const serverName = resolveServerName(process.env.MCP_SERVER_NAME);
const server = new Server({ name: serverName, version: '1.0.0' }, { capabilities: { tools: {} } });

let enabledTools = tools;
if (process.env.MCP_ENABLED_TOOLS) {
  const allowed = new Set(process.env.MCP_ENABLED_TOOLS.split(',').map(s => s.trim()));
  enabledTools = tools.filter(t => allowed.has(t.name));
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: enabledTools }));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Interdomestik QA Server running on stdio (name=${serverName})`);
