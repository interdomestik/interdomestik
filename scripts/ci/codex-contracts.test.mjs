import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const interdomestikEvidenceRoot = ['', 'tmp', 'interdomestik-pilot-evidence'].join('/');

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
  assert.match(configToml, new RegExp(`evidence_root = "${interdomestikEvidenceRoot}"`));
  assert.doesNotMatch(configToml, /\/tmp\/pilot-evidence\/playwright-mcp/);
  assert.match(configToml, /--user-data-dir/);
  assert.match(configToml, new RegExp(`${interdomestikEvidenceRoot}/playwright-mcp-profile`));
  assert.match(configToml, /--output-dir/);
  assert.match(configToml, new RegExp(`${interdomestikEvidenceRoot}/playwright-mcp-output`));
  assert.match(configToml, /command = "\/bin\/bash"/);
  assert.match(configToml, /scripts\/start-repo-qa\.sh/);
  assert.doesNotMatch(configToml, /packages\/qa\/src\/index\.ts/);
  assert.doesNotMatch(configToml, /packages\/qa\/dist\/index\.js/);
});

test('mcp setup verifies Codex project config as well as local QA server prerequisites', () => {
  const setupScript = readText('scripts/setup-mcp.sh');
  const packageJson = JSON.parse(readText('package.json'));

  assert.match(setupScript, /\.codex\/config\.toml/);
  assert.match(setupScript, /openai_docs/);
  assert.match(setupScript, /context7/);
  assert.match(setupScript, /playwright/);
  assert.match(setupScript, /interdomestik_qa/);
  assert.match(setupScript, /scripts\/start-repo-qa\.sh/);
  assert.match(setupScript, /tools\/list/);
  assert.equal(packageJson.scripts['mcp:preflight'], 'node scripts/codex-mcp-preflight.mjs');
  assert.match(setupScript, /command -v codex/);
  assert.match(setupScript, /\bpnpm mcp:preflight\b/);
  assert.match(setupScript, /Skipping Codex MCP preflight/);
});

test('Codex MCP preflight checks CLI registration and live repo QA tool discovery', () => {
  const preflight = readText('scripts/codex-mcp-preflight.mjs');
  const discoveryContract = readText('scripts/ci/qa-mcp-discovery-contracts.test.mjs');

  assert.match(preflight, /codex/);
  assert.match(preflight, /mcp/);
  assert.match(preflight, /list/);
  assert.match(preflight, /--json/);
  assert.match(preflight, /Array\.isArray\(servers\)/);
  assert.match(preflight, /typeof server\.name !== 'string'/);
  assert.match(preflight, /interdomestik_qa/);
  assert.match(preflight, /scripts\/start-repo-qa\.sh/);
  assert.match(preflight, /qa-mcp-discovery-contracts\.test\.mjs/);
  assert.match(discoveryContract, /tools\/list/);
  assert.match(discoveryContract, /project_map/);
  assert.match(discoveryContract, /read_files/);
  assert.match(discoveryContract, /code_search/);
  assert.match(preflight, /try\s*{\s*await main\(\);/);
  assert.match(preflight, /unexpected preflight error/);
  assert.match(preflight, /restart Codex/i);
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
