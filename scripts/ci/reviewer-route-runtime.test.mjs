import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runReviewerRoute } from './reviewer-route-runtime.mjs';
import { writeRouteReceipt } from './reviewer-route-receipts.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

function tempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function fakeScript(root, name, body) {
  const file = path.join(root, name);
  fs.writeFileSync(file, body);
  return file;
}

async function runFake(name, body, options = {}) {
  const root = tempRoot(name);
  const file = fakeScript(root, 'fake.mjs', body);
  try {
    return await runReviewerRoute({
      routeName: name,
      provider: options.provider || 'test',
	      model: options.model || 'fake',
	      command: process.execPath,
	      args: [file],
	      timeoutPreset: options.timeoutPreset,
	    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('Codex quota blocker writes deterministic JSON and Markdown receipts', async () => {
  const receipt = await runFake(
    'codex-senior-reviewer',
    "console.error('429 quota exceeded'); process.exit(1);\n",
    { provider: 'openai', model: 'codex-cli' }
  );
  const root = path.join(repoRoot, 'tmp/reviewer-routes');
  fs.rmSync(root, { recursive: true, force: true });
  try {
    const paths = writeRouteReceipt(receipt);
    const json = JSON.parse(fs.readFileSync(paths.jsonPath, 'utf8'));
    const markdown = fs.readFileSync(paths.mdPath, 'utf8');
    assert.equal(json.status, 'blocked');
    assert.equal(json.blockerReason, 'quota_or_rate_limit');
    assert.match(markdown, /quota_or_rate_limit/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing reviewer CLI is structurally blocked', async () => {
  const receipt = await runReviewerRoute({
    routeName: 'sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    command: 'definitely-missing-reviewer-cli',
    args: [],
  });
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockerReason, 'missing_cli');
  assert.equal(receipt.exitCode, 127);
});

test('no-output timeout is recorded separately from total timeout', async () => {
  const receipt = await runFake('silent-route', 'setTimeout(() => {}, 500);\n', {
    timeoutPreset: 'test-no-output',
  });
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockerReason, 'reviewer_no_output_timeout');
  assert.equal(receipt.firstOutputTimeout.timedOut, true);
  assert.equal(receipt.totalTimeout.timedOut, false);
});

test('total timeout is recorded after first output arrives', async () => {
  const receipt = await runFake('slow-route', "console.log('started'); setTimeout(() => {}, 500);\n", {
    timeoutPreset: 'test-total',
  });
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockerReason, 'reviewer_total_timeout');
  assert.equal(receipt.firstOutputTimeout.timedOut, false);
  assert.equal(receipt.totalTimeout.timedOut, true);
});

test('package scripts route reviewers through repo-owned helpers', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['codex:senior-head-engineer-reviewer'], 'node scripts/codex-senior-head-engineer-reviewer.mjs');
  assert.equal(pkg.scripts['review:codex'], 'pnpm codex:senior-head-engineer-reviewer');
  assert.equal(pkg.scripts['review:sonnet'], 'node scripts/ci/run-model-reviewer-route.mjs --route sonnet');
  assert.equal(pkg.scripts['review:gemini'], 'node scripts/ci/run-model-reviewer-route.mjs --route gemini');
  assert.equal(pkg.scripts['review:opus'], 'node scripts/ci/run-model-reviewer-route.mjs --route opus --allow-escalation');
});

test('Opus helper skips escalation unless explicitly required', () => {
  const root = path.join(repoRoot, 'tmp/reviewer-routes');
  fs.rmSync(root, { recursive: true, force: true });
  try {
    const result = spawnSync(
      process.execPath,
      ['scripts/ci/run-model-reviewer-route.mjs', '--route', 'opus'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const receiptFile = fs.readdirSync(root).find(file => file.endsWith('.json'));
    const receipt = JSON.parse(fs.readFileSync(path.join(root, receiptFile), 'utf8'));
    assert.equal(receipt.status, 'skipped');
    assert.equal(receipt.blockerReason, 'opus_escalation_not_required');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
