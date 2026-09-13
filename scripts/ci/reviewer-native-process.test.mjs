import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runReviewerRoute } from './reviewer-route-runtime.mjs';
import * as nativeProcess from './reviewer-native-process.mjs';

// Exercise the unchanged module with only OS boundaries replaced. This does not
// expose an injectable transport or verification bypass in the production API.
function captureScenario(scenario) {
  const script = `
    import fs from 'node:fs';
    import vm from 'node:vm';
    import { EventEmitter } from 'node:events';
    const context = vm.createContext({ Buffer, Date, setTimeout, clearTimeout, process: { platform: 'darwin' } });
    let child;
    const scenario = process.argv[1];
    const fakeFs = { readFileSync: () => Buffer.from('signed fixture'), writeFileSync() {
      if (scenario === 'write-error') throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    }};
    const replacements = {
      'node:fs': { default: fakeFs },
      'node:crypto': { createHash: () => ({ update() { return this; }, digest: () => '${nativeProcess.EXECUTABLE_SHA256}' }) },
      'node:child_process': { execFileSync() {}, spawn() {
        child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        child.pid = 999; child.exitCode = 0; child.kill = () => true; return child;
      }},
    };
    const module = new vm.SourceTextModule(fs.readFileSync(process.argv[2], 'utf8'), { context });
    await module.link(async specifier => {
      const exports = replacements[specifier] ?? await import(specifier);
      return new vm.SyntheticModule(Object.keys(exports), function() {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    await module.evaluate();
    let result = { settled: false };
    const promise = module.namespace.captureNative('/test/agy', [], { env: {}, cwd: '/tmp', deadline: Date.now() + 2000, receiptPath: '/tmp/unused' });
    promise.then(record => { result = { settled: true, record }; }, error => { result = { settled: true, reason: error.message, record: error.record }; });
    const bytes = Buffer.from('Gjetje në kod: €');
    const cut = bytes.indexOf(Buffer.from('€')) + 1;
    for (const channel of ['stdout', 'stderr']) {
      child[channel].emit('data', bytes.subarray(0, cut));
      child[channel].emit('data', bytes.subarray(cut));
    }
    try { child.emit('close', 0, null); } catch (error) { result.escaped = error.code; }
    await Promise.resolve(); await Promise.resolve();
    console.log(JSON.stringify(result));
  `;
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      '--input-type=module',
      '-e',
      script,
      scenario,
      new URL('./reviewer-native-process.mjs', import.meta.url).pathname,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('capture persistence failure rejects with the complete process record', () => {
  const result = captureScenario('write-error');
  assert.equal(result.escaped, undefined);
  assert.equal(result.settled, true);
  assert.equal(result.reason, 'native_receipt_write_failed:ENOSPC');
  assert.equal(result.record.exitCode, 0);
});

test('capture preserves UTF-8 characters split across chunks on both pipes', () => {
  const result = captureScenario('utf8');
  assert.equal(result.record.stdout, 'Gjetje në kod: €');
  assert.equal(result.record.stderr, 'Gjetje në kod: €');
});

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
      nativeProtocol: options.nativeProtocol,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('native inference rejects arbitrary executables before accepting self-reported evidence', async () => {
  const receipt = await runFake(
    'flash',
    `console.log(JSON.stringify({model:'gemini-3.8-flash-low',response:'VERDICT: PASS',nativeEvidence:{verified:true,toolsDenied:true}}))`,
    { provider: 'google', model: 'gemini-3.8-flash-low', nativeProtocol: 'antigravity-v1' }
  );
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockerReason, 'native_executable_untrusted');
  assert.equal(receipt.stdout, '');
  assert.equal(receipt.providerReportedModel, null);
});

test('unknown native protocols cannot bypass existing model attestation', async () => {
  const receipt = await runFake(
    'flash',
    `console.log(JSON.stringify({model:'gemini-3.8-flash-low',response:'VERDICT: PASS'}))`,
    { provider: 'google', model: 'gemini-3.8-flash-low', nativeProtocol: 'unknown' }
  );
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockerReason, 'unsupported_native_protocol');
});

test('native failure receipt preserves actual subprocess and timeout evidence', () => {
  assert.equal(typeof nativeProcess.nativeFailureReceipt, 'function');
  const error = Object.assign(new Error('native_total_timeout'), {
    record: {
      stdout: 'partial native output',
      stderr: 'diagnostic',
      exitCode: null,
      signal: 'SIGTERM',
    },
  });
  const receipt = nativeProcess.nativeFailureReceipt(error, '/private/tmp/evidence');
  assert.equal(receipt.providerReportedModel, null);
  assert.equal(receipt.reviewVerdict, null);
  assert.equal(receipt.totalTimeout.timedOut, true);
  assert.equal(receipt.firstOutputTimeout.timedOut, false);
  assert.equal(receipt.exitCode, null);
  assert.equal(receipt.signal, 'SIGTERM');
  assert.equal(receipt.stdout, 'partial native output');
  assert.equal(receipt.evidenceDirectory, '/private/tmp/evidence');
});

test(
  'signed native Flash executes fresh controls and returns explicitly inferred evidence',
  {
    skip: process.env.RUN_NATIVE_REVIEWER_TEST !== '1',
    timeout: 600_000,
  },
  async () => {
    const receipt = await runReviewerRoute({
      routeName: 'flash',
      provider: 'google',
      model: 'gemini-3.8-flash-low',
      command: '/Users/arbenlila/.local/bin/agy',
      nativeProtocol: 'antigravity-v1',
      prompt:
        'Public connectivity test, no private repository content. Reply with exactly VERDICT: PASS',
      candidateIdentity: { scope: 'public-connectivity-only' },
    });
    assert.equal(receipt.status, 'ran', JSON.stringify(receipt));
    assert.equal(receipt.providerReportedModel, null);
    assert.equal(receipt.nativeSelectedModel, 'gemini-3.8-flash-low');
    assert.equal(receipt.evidenceBasis, 'native-selection-inference');
    assert.equal(receipt.nativeExecutionInference.controls.negative.completedReads, 0);
    assert.equal(receipt.nativeExecutionInference.controls.positive.completedReads, 1);
    assert.match(receipt.nativeExecutionInference.executable.sha256, /^[a-f0-9]{64}$/);
    assert.ok(receipt.nativeExecutionInference.review.pid > 0);
    assert.equal(receipt.reviewVerdict, 'PASS');
  }
);

test(
  'post-capture validation failure retains the actual invocation and output',
  {
    skip: process.env.RUN_NATIVE_FAILURE_TEST !== '1',
    timeout: 600_000,
  },
  async () => {
    const receipt = await runReviewerRoute({
      routeName: 'flash',
      provider: 'google',
      model: 'gemini-3.8-flash-low',
      command: '/Users/arbenlila/.local/bin/agy',
      nativeProtocol: 'antigravity-v1',
      commandInvoked: ['caller-metadata-must-not-replace-actual-invocation'],
      prompt:
        'Public failure-handling test. Reply with exactly RECEIPT_NEGATIVE_CONTROL and no verdict or other text.',
    });
    assert.equal(receipt.blockerReason, 'native_missing_verdict', JSON.stringify(receipt));
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.exitCode, 0, JSON.stringify(receipt));
    assert.match(receipt.stdout, /RECEIPT_NEGATIVE_CONTROL/);
    assert.match(receipt.commandInvoked[0], /native-reviewer-.*\/agy$/);
    assert.equal(receipt.failedStage, 'review');
  }
);
