import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runProbe } from './model-review-access.mjs';
import { modelReviewRoutes } from './model-review-routes.mjs';
import { claudeRestrictedArgs } from './reviewer-claude-execution.mjs';
import { reviewerLifecycle } from './reviewer-process-lifecycle.mjs';
import { runReviewerRoute } from './reviewer-route-runtime.mjs';
import { writeRouteReceipt } from './reviewer-route-receipts.mjs';

test('restricted Claude flags exclude hooks, tools, MCP, Chrome and inherited settings', () => {
  const args = claudeRestrictedArgs('public', 'claude-sonnet-5');
  for (const [flag, value] of [
    ['--tools', ''],
    ['--setting-sources', ''],
    ['--settings', '{"disableAllHooks":true}'],
    ['--mcp-config', '{"mcpServers":{}}'],
    ['--output-format', 'stream-json'],
    ['--model', 'claude-sonnet-5'],
  ])
    assert.equal(args[args.indexOf(flag) + 1], value);
  for (const flag of [
    '--strict-mcp-config',
    '--no-chrome',
    '--no-session-persistence',
    '--disable-slash-commands',
  ])
    assert.ok(args.includes(flag));
  assert.ok(!args.includes('--bare'));
});

for (const routeName of ['sonnet', 'gemini', 'flash']) {
  test(`${routeName} access calls reject an executable wrapper via the same restricted runner`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-wrapper-'));
    const command = path.join(root, 'wrapper');
    fs.writeFileSync(command, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    try {
      const route = { ...modelReviewRoutes[routeName], command };
      const presence = await runProbe(route, 'command', routeName);
      assert.equal(presence.status, 'available');
      assert.match(presence.reason, /not probed/u);
      const call = await runProbe(route, 'call', routeName);
      assert.equal(call.status, 'blocked');
      assert.equal(call.receipt.providerReportedModel, null);
      assert.equal(call.receipt.reviewVerdict, null);
      assert.match(call.receipt.error, /untrusted|codesign/u);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('missing native binary yields blocked diagnostic without another provider', async () => {
  const result = await runProbe(
    { ...modelReviewRoutes.flash, command: '/missing/native-agy' },
    'call',
    'flash'
  );
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /unavailable/u);
});

test('receipt shows native inference and null server model distinctly', () => {
  const receipt = {
    routeName: 'native-inference-test',
    status: 'ran',
    provider: 'google',
    model: 'gemini-3.8-flash-low',
    providerReportedModel: null,
    nativeSelectedModel: 'gemini-3.8-flash-low',
    evidenceBasis: 'native-selection-inference',
    nativeExecutionInference: { limitation: 'No independent server attestation.' },
    commandInvoked: ['agy'],
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    elapsedMs: 1,
    firstOutputTimeout: { timedOut: false },
    totalTimeout: { timedOut: false },
  };
  const files = writeRouteReceipt(receipt);
  try {
    const md = fs.readFileSync(files.mdPath, 'utf8');
    assert.match(md, /provider-reported model: null/u);
    assert.match(md, /native-selected model: gemini-3.8-flash-low/u);
    assert.match(md, /native-selection-inference/u);
    assert.match(md, /No independent server attestation/u);
  } finally {
    for (const file of Object.values(files)) fs.rmSync(file);
  }
});

test('AbortSignal cancels a reviewer and removes process listeners', async () => {
  const controller = new AbortController();
  const before = process.listenerCount('SIGTERM');
  const promise = runReviewerRoute({
    routeName: 'cancel-test',
    provider: 'test',
    model: 'test',
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 30);
  const result = await promise;
  assert.equal(result.status, 'blocked');
  assert.equal(result.blockerReason, 'reviewer_cancelled');
  assert.equal(process.listenerCount('SIGTERM'), before);
});

test('owned process group cancellation stops a descendant retaining output pipes', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
    const {spawn} = require('node:child_process');
    const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: ['ignore', 1, 2]});
    console.log(descendant.pid);
    setInterval(() => {}, 1000);
  `,
    ],
    { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const lifecycle = reviewerLifecycle(child, () => {});
  const pid = await new Promise(resolve =>
    child.stdout.once('data', chunk => resolve(Number(chunk.toString().trim())))
  );
  const closed = new Promise(resolve => child.once('close', resolve));
  lifecycle.stop();
  await closed;
  const cleanupError = lifecycle.close();
  assert.equal(cleanupError, undefined);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
