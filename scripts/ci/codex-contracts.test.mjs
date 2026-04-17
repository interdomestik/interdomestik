import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('project-scoped Codex config registers the repo MCP servers Interdomestik depends on', () => {
  const configToml = readText('.codex/config.toml');

  assert.match(configToml, /\[mcp_servers\.openai_docs\]/);
  assert.match(configToml, /\[mcp_servers\.context7\]/);
  assert.match(configToml, /\[mcp_servers\.playwright\]/);
  assert.match(configToml, /\[mcp_servers\.interdomestik_qa\]/);

  assert.match(configToml, /url = "https:\/\/developers\.openai\.com\/mcp"/);
  assert.match(configToml, /command = "npx"/);
  assert.match(configToml, /@upstash\/context7-mcp/);
  assert.match(configToml, /@playwright\/mcp/);
  assert.match(configToml, /--user-data-dir/);
  assert.match(configToml, /\/tmp\/pilot-evidence\/playwright-mcp-profile/);
  assert.match(configToml, /--output-dir/);
  assert.match(configToml, /\/tmp\/pilot-evidence\/playwright-mcp-output/);
  assert.match(configToml, /command = "bash"/);
  assert.match(configToml, /scripts\/start-repo-qa\.sh/);
  assert.doesNotMatch(configToml, /packages\/qa\/src\/index\.ts/);
  assert.doesNotMatch(configToml, /packages\/qa\/dist\/index\.js/);
});

test('mcp setup verifies Codex project config as well as local QA server prerequisites', () => {
  const setupScript = readText('scripts/setup-mcp.sh');

  assert.match(setupScript, /\.codex\/config\.toml/);
  assert.match(setupScript, /openai_docs/);
  assert.match(setupScript, /context7/);
  assert.match(setupScript, /playwright/);
  assert.match(setupScript, /interdomestik_qa/);
  assert.match(setupScript, /scripts\/start-repo-qa\.sh/);
  assert.match(setupScript, /tools\/list/);
});

test('Codex PR review workflow uses the official action with a repo-owned review prompt', () => {
  const workflow = readText('.github/workflows/codex-review.yml');

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.ok(
    workflow.includes(
      ['    permissions:', '      contents: read', '      pull-requests: write'].join('\n')
    )
  );
  assert.match(workflow, /name:\s*Check OPENAI_API_KEY availability/);
  assert.match(workflow, /configured=true/);
  assert.match(workflow, /configured=false/);
  assert.match(workflow, /if:\s*steps\.openai_key\.outputs\.configured == 'true'/);
  assert.match(workflow, /Skipping Codex review because OPENAI_API_KEY is not configured/);
  assert.match(workflow, /uses:\s*openai\/codex-action@c25d10f3f498316d4b2496cc4c6dd58057a7b031/);
  assert.match(workflow, /prompt-file:\s*\.github\/codex\/prompts\/review\.md/);
  assert.match(workflow, /safety-strategy:\s*drop-sudo/);
  assert.match(workflow, /sandbox:\s*workspace-write/);

  const prompt = readText('.github/codex/prompts/review.md');
  assert.match(prompt, /Phase C/i);
  assert.match(prompt, /apps\/web\/src\/proxy\.ts/);
  assert.match(prompt, /member|agent|staff|admin/);
  assert.match(prompt, /find bugs, regressions, security issues, and missing tests/i);
});
