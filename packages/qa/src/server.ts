import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import path from 'path';
import { tools } from './tools/list-tools.js';
import { handleToolCall } from './tool-router.js';
import { REPO_ROOT } from './utils/paths.js';

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const server = new Server(
  { name: 'interdomestik-qa', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Interdomestik QA Server running on stdio');
