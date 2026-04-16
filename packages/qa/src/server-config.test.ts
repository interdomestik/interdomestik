import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testFileDir, '../../..');
const codexConfigPath = path.join(repoRoot, '.codex/config.toml');

test('interdomestik_qa MCP server runs from the repo root', async () => {
  const config = await readFile(codexConfigPath, 'utf8');
  const serverBlockMatch = config.match(/\[mcp_servers\.interdomestik_qa\][\s\S]*?(?=\n\[|$)/);

  assert.ok(serverBlockMatch, 'Expected interdomestik_qa MCP server config to exist');
  assert.match(
    serverBlockMatch[0],
    /^cwd = "\."$/m,
    'Expected interdomestik_qa MCP server cwd to point at the repo root'
  );
});
