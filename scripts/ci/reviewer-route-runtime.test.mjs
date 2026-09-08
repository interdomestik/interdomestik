import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { defaultReviewers, modelReviewRoutes } from './model-review-routes.mjs';
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
      maxCaptureBytes: options.maxCaptureBytes,
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
  const previousCwd = process.cwd();
  const isolatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-receipts-'));
  try {
    process.chdir(isolatedCwd);
    const paths = writeRouteReceipt(receipt);
    for (const file of [paths.jsonPath, paths.mdPath]) {
      assert.equal(
        path.relative(fs.realpathSync(isolatedCwd), fs.realpathSync(file)).startsWith('..'),
        false
      );
      assert.equal(
        path.isAbsolute(path.relative(fs.realpathSync(isolatedCwd), fs.realpathSync(file))),
        false
      );
    }
    const json = JSON.parse(fs.readFileSync(paths.jsonPath, 'utf8'));
    const markdown = fs.readFileSync(paths.mdPath, 'utf8');
    assert.equal(json.status, 'blocked');
    assert.equal(json.blockerReason, 'quota_or_rate_limit');
    assert.match(markdown, /quota_or_rate_limit/u);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(isolatedCwd, { recursive: true, force: true });
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
    ['flash'],
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
  const isolatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-skip-'));
  const root = path.join(isolatedCwd, 'tmp/reviewer-routes');
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(scriptDir, 'run-model-reviewer-route.mjs'), '--route', 'opus'],
      { cwd: isolatedCwd, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const receiptFile = fs.readdirSync(root).find(file => file.endsWith('.json'));
    const receipt = JSON.parse(fs.readFileSync(path.join(root, receiptFile), 'utf8'));
    assert.equal(receipt.status, 'skipped');
    assert.equal(receipt.blockerReason, 'opus_escalation_not_required');
  } finally {
    fs.rmSync(isolatedCwd, { recursive: true, force: true });
  }
});

test('current reviewer routes keep fast work optional and pin the requested models', () => {
  assert.deepEqual(defaultReviewers, ['sonnet']);
  for (const [route, model] of [
    ['sonnet', 'claude-sonnet-5'],
    ['opus', 'claude-opus-5'],
    ['gemini', 'gemini-3.1-pro-preview'],
    ['flash', 'gemini-3.8-flash'],
  ]) {
    const config = modelReviewRoutes[route];
    assert.equal(config.model, model);
    const args = config.args('bounded review');
    assert.equal(args[args.indexOf('--model') + 1], model);
    assert.ok(args.includes('--model'));
    assert.ok(args.includes('--output-format'));
    assert.equal(
      args[args.indexOf('--output-format') + 1],
      route === 'opus' ? 'stream-json' : 'json'
    );
  }
});

for (const [name, models, status] of [
  ['exact', { 'gemini-3.8-flash': {} }, 'ran'],
  ['fallback', { 'gemini-3.1-pro-preview': {} }, 'failed'],
  ['mixed', { 'gemini-3.8-flash': {}, 'gemini-3.1-pro-preview': {} }, 'failed'],
  ['missing', {}, 'failed'],
]) {
  test(`Gemini pretty JSON ${name} model evidence`, async () => {
    const payload = { response: 'VERDICT: PASS', stats: { models } };
    const receipt = await runFake(
      'flash',
      `console.log(JSON.stringify(${JSON.stringify(payload)}, null, 2));`,
      { provider: 'google', model: 'gemini-3.8-flash' }
    );
    assert.equal(receipt.status, status);
    assert.equal(receipt.reviewVerdict, 'PASS');
  });
}

for (const [body, expected] of [
  ['VERDICT: PASS\nQuoted earlier answer.\nVERDICT: FINDINGS\n\n', 'FINDINGS'],
  ['VERDICT: PASS\nMore unresolved analysis.', null],
  ['```\nVERDICT: PASS\n```', null],
  ['VERDICT: PASS with exceptions', null],
])
  test(
    'only the final nonempty verdict line is authoritative: ' + JSON.stringify(body),
    async () => {
      const receipt = await runFake(
        'flash',
        `console.log(JSON.stringify(${JSON.stringify({ model: 'gemini-3.8-flash', response: body })}))`,
        { provider: 'google', model: 'gemini-3.8-flash' }
      );
      assert.equal(receipt.reviewVerdict, expected);
      assert.equal(receipt.status, expected ? 'ran' : 'failed');
    }
  );

for (const payloads of [
  [{ model: 'gemini-3.8-flash' }, { model: 'gemini-3.1-pro-preview', response: 'VERDICT: PASS' }],
  [
    {
      model: 'gemini-3.8-flash',
      modelUsage: { 'gemini-3.1-pro-preview': {} },
      response: 'VERDICT: PASS',
    },
  ],
  [
    {
      modelUsage: { 'gemini-3.8-flash': {} },
      stats: { models: { 'gemini-3.1-pro-preview': {} } },
      response: 'VERDICT: PASS',
    },
  ],
])
  test('mixed provider model evidence fails across every source', async () => {
    const receipt = await runFake(
      'flash',
      `for(const p of ${JSON.stringify(payloads)})console.log(JSON.stringify(p))`,
      { provider: 'google', model: 'gemini-3.8-flash' }
    );
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.providerReportedModel, null);
  });

test('empty modelUsage still considers stats model evidence', async () => {
  const receipt = await runFake(
    'flash',
    `console.log(JSON.stringify({modelUsage:{},stats:{models:{'gemini-3.8-flash':{}}},response:'VERDICT: PASS'}))`,
    { provider: 'google', model: 'gemini-3.8-flash' }
  );
  assert.equal(receipt.status, 'ran');
});

test('output overflow cannot discard earlier model evidence then succeed', async () => {
  const receipt = await runFake(
    'flash',
    `console.log('x'.repeat(512));console.log(JSON.stringify({model:'gemini-3.8-flash',response:'VERDICT: PASS'}))`,
    { provider: 'google', model: 'gemini-3.8-flash', maxCaptureBytes: 128 }
  );
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockerReason, 'reviewer_output_limit');
});

test('Google reviewers install a fixed deny-all policy before tool execution', () => {
  for (const route of ['gemini', 'flash']) {
    const args = modelReviewRoutes[route].args('review');
    assert.equal(args[args.indexOf('--approval-mode') + 1], 'default');
    assert.equal(args[args.indexOf('--extensions') + 1], 'none');
    assert.ok(args.includes('--admin-policy'));
    const policy = args[args.indexOf('--admin-policy') + 1];
    assert.equal(policy, path.join(scriptDir, 'reviewer-no-tools.toml'));
    assert.equal(
      fs.readFileSync(policy, 'utf8'),
      '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n'
    );
  }
});

test('Google route refuses system policy overrides and unreadable policy directories', t => {
  for (const operation of [
    () => ['admin.toml'],
    () => {
      throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
    },
  ]) {
    const mock = t.mock.method(fs, 'readdirSync', operation);
    assert.throws(() => modelReviewRoutes.flash.args('review'));
    mock.mock.restore();
  }
});
