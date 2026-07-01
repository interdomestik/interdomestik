#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const codexHome = path.join(os.homedir(), '.codex');
const codexConfigPath = path.join(codexHome, 'config.toml');
const serverName = 'interdomestik_qa';
const requiredRepoQaTools = [
  'project_map',
  'read_files',
  'read_file_range',
  'code_search',
  'git_status_compact',
  'git_branch_info',
  'changed_files',
  'scope_audit',
  'check_health',
  'pr_verify',
  'security_guard',
  'e2e_gate',
];

if (typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim() !== '') {
  console.error(
    'CODEX_HOME is set; refusing to update local MCP config because this script only manages the default ~/.codex/config.toml.'
  );
  console.error('Unset CODEX_HOME first, or update $CODEX_HOME/config.toml manually.');
  process.exit(1);
}

function tomlString(value) {
  return JSON.stringify(value);
}

function createRepoQaBlock() {
  const enabledToolsString = requiredRepoQaTools.join(',');

  return [
    `[mcp_servers.${serverName}]`,
    'command = "/bin/bash"',
    'args = ["scripts/start-repo-qa.sh"]',
    `cwd = ${tomlString(rootDir)}`,
    `env = { MCP_ENABLED_TOOLS = ${tomlString(enabledToolsString)} }`,
  ].join('\n');
}

function replaceTomlTable(input, tableName, replacement) {
  const lines = input.split(/\r?\n/);
  const tableHeader = `[${tableName}]`;
  const startIndex = lines.findIndex(line => line.trim() === tableHeader);

  if (startIndex === -1) {
    const trimmed = input.trimEnd();
    return `${trimmed}${trimmed ? '\n\n' : ''}${replacement}\n`;
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (
      trimmed.startsWith('[') &&
      trimmed.endsWith(']') &&
      trimmed !== tableHeader &&
      !trimmed.startsWith(`[${tableName}.`)
    ) {
      endIndex = index;
      break;
    }
  }

  const nextLines = [...lines.slice(0, startIndex), replacement, ...lines.slice(endIndex)];
  return `${nextLines.join('\n').trimEnd()}\n`;
}

fs.mkdirSync(codexHome, { recursive: true });

const currentConfig = fs.existsSync(codexConfigPath)
  ? fs.readFileSync(codexConfigPath, 'utf8')
  : '';
const nextConfig = replaceTomlTable(
  currentConfig,
  `mcp_servers.${serverName}`,
  createRepoQaBlock()
);

if (nextConfig !== currentConfig) {
  fs.writeFileSync(codexConfigPath, nextConfig);
}

console.log('Codex local MCP config updated.');
console.log(`Configured ${serverName} with repository-scoped cwd.`);
