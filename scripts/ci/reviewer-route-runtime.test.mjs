import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { modelReviewRoutes } from './model-review-routes.mjs';
import { runReviewerRoute } from './reviewer-route-runtime.mjs';
import { writeRouteReceipt } from './reviewer-route-receipts.mjs';
import { timeoutConfig } from './reviewer-route-utils.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

async function runFake(name, body, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  const file = path.join(root, 'fake.mjs');
  fs.writeFileSync(file, body);
  try {
    return await runReviewerRoute({
      routeName: name,
      provider: options.provider || 'test',
      model: options.model || 'fake',
      command: process.execPath,
      args: [file],
      commandInvoked: options.commandInvoked,
      timeoutPreset: options.timeoutPreset,
      candidateIdentity: options.candidateIdentity,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('OpenAI reviewer quota blocker writes deterministic JSON and Markdown receipts', async () => {
  const receipt = await runFake(
    'openai-reviewer',
    "console.error('429 quota exceeded'); process.exit(1);\n",
    { provider: 'openai', model: 'openai-cli' }
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

test('records provider-reported model and exact candidate identity', async () => {
  const candidateIdentity = {
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    treeSha: 'c'.repeat(40),
    diffSha256: 'd'.repeat(64),
  };
  const receipt = await runFake(
    'opus',
    'console.log(JSON.stringify({ model: "claude-opus-5", result: "VERDICT: PASS" }));\n',
    { provider: 'anthropic', model: 'claude-opus-5', candidateIdentity }
  );
  assert.equal(receipt.status, 'ran');
  assert.equal(receipt.providerReportedModel, 'claude-opus-5');
  assert.equal(receipt.reviewVerdict, 'PASS');
  assert.deepEqual(receipt.candidateIdentity, candidateIdentity);
});

test('Opus stream rejects any tool event before accepting a verdict', async () => {
  const receipt = await runFake(
    'opus',
    `for(const value of [{type:'system',model:'claude-opus-5'},{type:'assistant',message:{content:[{type:'tool_use'}]}},{type:'result',result:'VERDICT: PASS'}]) console.log(JSON.stringify(value))`,
    { provider: 'anthropic', model: 'claude-opus-5' }
  );
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockerReason, 'reviewer_tool_request');
  assert.equal(receipt.reviewVerdict, null);
});

for (const [name, body, error] of [
  ['opus-no-verdict', `{model:'claude-opus-5',result:'inspect'}`, /no explicit PASS|FINDINGS/u],
  ['opus-unattested', `{result:'VERDICT: PASS'}`, /provider model/u],
])
  test(`${name} fails closed`, async () => {
    const receipt = await runFake(name, `console.log(JSON.stringify(${body}))`, {
      provider: 'anthropic',
      model: 'claude-opus-5',
    });
    assert.equal(receipt.status, 'failed');
    assert.match(receipt.error, error);
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

for (const [preset, output, reason, first, total] of [
  ['test-no-output', '', 'reviewer_no_output_timeout', true, false],
  ['test-total', "console.log('started')", 'reviewer_total_timeout', false, true],
])
  test(`${preset} records its exact timeout`, async () => {
    const receipt = await runFake('timeout', `${output};setTimeout(()=>{},500)`, {
      timeoutPreset: preset,
    });
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.blockerReason, reason);
    assert.equal(receipt.firstOutputTimeout.timedOut, first);
    assert.equal(receipt.totalTimeout.timedOut, total);
  });

test('successful reviewer text is not treated as a quota blocker', async () => {
  const receipt = await runFake(
    'quota-text-route',
    "console.log('review references line 429 and rate limit docs');\n"
  );
  assert.equal(receipt.status, 'ran');
  assert.equal(receipt.blockerReason, '');
});

test('receipt command can redact prompt arguments', async () => {
  const receipt = await runFake('redacted-command-route', "console.log('ok');\n", {
    commandInvoked: [process.execPath, '-p', '<prompt>'],
  });
  assert.deepEqual(receipt.commandInvoked, [process.execPath, '-p', '<prompt>']);
});

test('package scripts route external reviewers through repo-owned helpers', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  for (const [route, suffix = ''] of [
    ['sonnet'],
    ['gemini'],
    ['opus', ' --allow-escalation'],
    ['opus48'],
  ])
    assert.equal(
      pkg.scripts[`review:${route}`],
      `node scripts/ci/run-model-reviewer-route.mjs --route ${route}${suffix}`
    );
});

test('Opus routes use explicit priority and lightweight model identifiers', () => {
  assert.equal(modelReviewRoutes.opus.model, 'claude-opus-5');
  assert.match(modelReviewRoutes.opus.label, /Opus 5/u);
  assert.ok(modelReviewRoutes.opus.args('<prompt>').includes('stream-json'));
  assert.equal(timeoutConfig('opus').totalTimeoutMs, 30 * 60_000);
  assert.equal(modelReviewRoutes.opus48.model, 'claude-opus-4-8');
  assert.match(modelReviewRoutes.opus48.label, /lightweight/u);
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
