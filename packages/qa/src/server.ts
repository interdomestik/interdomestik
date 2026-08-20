import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools } from './tools/list-tools.js';
import { handleToolCall } from './tool-router.js';

function resolveServerName(rawName: string | undefined): string {
  const candidate = rawName?.trim();
  if (!candidate) return 'interdomestik-qa';
  return /^[a-z0-9_.-]{1,64}$/i.test(candidate) ? candidate : 'interdomestik-qa';
}

// Server name defaults to interdomestik-qa; override with MCP_SERVER_NAME if needed.
const serverName = resolveServerName(process.env.MCP_SERVER_NAME);
const server = new Server({ name: serverName, version: '1.0.0' }, { capabilities: { tools: {} } });

let enabledTools = tools;
if (process.env.MCP_ENABLED_TOOLS) {
  const allowed = new Set(process.env.MCP_ENABLED_TOOLS.split(',').map(s => s.trim()));
  enabledTools = tools.filter(t => allowed.has(t.name));
}
const enabledToolNames = new Set(enabledTools.map(tool => tool.name));

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: enabledTools }));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;
  if (!enabledToolNames.has(name)) {
    return {
      content: [{ type: 'text', text: `Tool ${name} is not enabled on this MCP surface` }],
      isError: true,
      structuredContent: { status: 'error', tool: name },
    };
  }
  return handleToolCall(name, args);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Interdomestik QA Server running on stdio (name=${serverName})`);
