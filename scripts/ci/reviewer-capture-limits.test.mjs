import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  STDERR_CAPTURE_BYTES,
  STDOUT_CAPTURE_DEFAULT_BYTES,
  STDOUT_CAPTURE_ENV,
  STDOUT_CAPTURE_MAX_BYTES,
  resolveCaptureLimits,
} from './reviewer-capture-limits.mjs';
import { runReviewerRoute } from './reviewer-route-runtime.mjs';
import { timeoutConfig } from './reviewer-route-utils.mjs';

const fromEnv = value => resolveCaptureLimits(undefined, { [STDOUT_CAPTURE_ENV]: value });
const emit = bytes =>
  `const l='x'.repeat(999)+'\\n';for(let i=0;i<${Math.ceil(bytes / 1000)};i++)process.stdout.write(l);`;
// Stays alive until terminated; exits on its own after 15 s so a termination regression fails fast.
const linger = 'setTimeout(() => process.exit(3), 15000);';

async function run(body, { env, ...options } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-limits-'));
  const file = path.join(root, 'fake.mjs');
  fs.writeFileSync(file, body);
  const base = { ...process.env };
  delete base[STDOUT_CAPTURE_ENV];
  try {
    return await runReviewerRoute({
      routeName: 'capture',
      provider: 'test',
      model: 'fake',
      command: process.execPath,
      args: [file],
      env: { ...base, ...env },
      ...options,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('defaults are unchanged and independent of the environment being empty or absent', () => {
  for (const env of [undefined, {}, { [STDOUT_CAPTURE_ENV]: '' }]) {
    const { limits, error } = resolveCaptureLimits(undefined, env);
    assert.equal(error, '');
    assert.deepEqual(limits, { stdoutBytes: 256_000, stderrBytes: 20_000, source: 'default' });
  }
  assert.equal(STDOUT_CAPTURE_DEFAULT_BYTES, 256_000);
  assert.equal(STDERR_CAPTURE_BYTES, 20_000);
});

test('a valid override applies to stdout only, at both bounds, and never moves the stderr limit', () => {
  for (const value of ['1', '524288', String(STDOUT_CAPTURE_MAX_BYTES)]) {
    const { limits } = fromEnv(value);
    assert.deepEqual(limits, {
      stdoutBytes: Number(value),
      stderrBytes: STDERR_CAPTURE_BYTES,
      source: 'environment',
    });
  }
  const explicit = resolveCaptureLimits(128, { [STDOUT_CAPTURE_ENV]: '524288' });
  assert.deepEqual(explicit.limits, { stdoutBytes: 128, stderrBytes: 20_000, source: 'option' });
});

test('every non-canonical or out-of-range environment value is rejected, never clamped', () => {
  const invalid = ['0', '-1', '1.5', '1e6', '0x10', '512k', ' 512000', '512000 ', '+512000'];
  invalid.push(
    '512_000',
    '01000',
    'NaN',
    'Infinity',
    '٥١٢٠٠٠',
    String(STDOUT_CAPTURE_MAX_BYTES + 1)
  );
  invalid.push('9'.repeat(400));
  for (const value of invalid) {
    const { limits, error } = fromEnv(value);
    assert.equal(limits, null, `accepted ${JSON.stringify(value)}`);
    assert.match(error, /REVIEWER_MAX_STDOUT_BYTES must be an integer from 1 to 1048576/u);
    assert.ok(error.length < 160, 'error must not echo an unbounded value');
  }
});

test('every invalid explicit option is rejected, and an invalid environment value cannot leak in', () => {
  const invalid = [0, -1, 1.5, NaN, Infinity, STDOUT_CAPTURE_MAX_BYTES + 1, null, '', true, {}, []];
  for (const value of [...invalid, 10n, '  ', Number.MAX_SAFE_INTEGER + 2]) {
    const { limits, error } = resolveCaptureLimits(value, { [STDOUT_CAPTURE_ENV]: '524288' });
    assert.equal(limits, null, `accepted ${String(value)}`);
    assert.match(error, /^maxCaptureBytes must be an integer/u);
  }
});

test('an invalid override blocks before any reviewer is spawned', async () => {
  const marker = path.join(os.tmpdir(), `capture-limits-spawned-${process.pid}`);
  const body = `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'x');`;
  const receipt = await run(body, { env: { [STDOUT_CAPTURE_ENV]: '512k' } });
  assert.equal(fs.existsSync(marker), false, 'the reviewer must not have been started');
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockerReason, 'reviewer_capture_limit_invalid');
  assert.equal(receipt.exitCode, 125);
  assert.equal(receipt.captureLimits, null);
  assert.equal(receipt.stdout, '');
  assert.match(receipt.error, /received "512k"/u);
});

test(
  'default overflow terminates the reviewer and records the effective limits',
  { timeout: 30_000 },
  async () => {
    const receipt = await run(`${emit(300_000)}${linger}`);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.blockerReason, 'reviewer_output_limit');
    assert.ok(Buffer.byteLength(receipt.stdout) <= STDOUT_CAPTURE_DEFAULT_BYTES);
    assert.deepEqual(receipt.captureLimits, {
      stdoutBytes: 256_000,
      stderrBytes: 20_000,
      source: 'default',
    });
  }
);

test('a valid override lets the same output complete and is recorded in the receipt', async () => {
  const receipt = await run(emit(300_000), { env: { [STDOUT_CAPTURE_ENV]: '524288' } });
  assert.equal(receipt.status, 'ran');
  assert.equal(receipt.blockerReason, '');
  assert.ok(Buffer.byteLength(receipt.stdout) >= 300_000);
  assert.equal(receipt.captureLimits.stdoutBytes, 524_288);
  assert.equal(receipt.captureLimits.source, 'environment');
});

test(
  'the override terminates the run and retention is bounded by UTF-8 bytes',
  { timeout: 30_000 },
  async () => {
    for (const ch of ['é', '中', '😀']) {
      const cap = Buffer.byteLength(ch) * 1000 - 1; // cuts inside the first character
      const env = { [STDOUT_CAPTURE_ENV]: String(cap) };
      const receipt = await run(`process.stdout.write('${ch}'.repeat(1000));${linger}`, { env });
      assert.equal(receipt.blockerReason, 'reviewer_output_limit');
      assert.equal(receipt.stdout, ch.repeat(999));
      assert.ok(Buffer.byteLength(receipt.stdout) <= cap);
    }
  }
);

test(
  'the stderr limit is independent: it neither follows the stdout limit nor blocks the run',
  { timeout: 30_000 },
  async () => {
    const stderr = "process.stderr.write('e'.repeat(50000)+'TAIL');";
    const raised = await run(`${stderr}${emit(1000)}`, { env: { [STDOUT_CAPTURE_ENV]: '524288' } });
    assert.equal(raised.status, 'ran');
    assert.equal(Buffer.byteLength(raised.stderr), 20_000);
    assert.ok(raised.stderr.endsWith('TAIL'), 'the retained stderr is the tail');
    const lowered = await run(`${stderr}${emit(2000)}${linger}`, { maxCaptureBytes: 128 });
    assert.equal(lowered.blockerReason, 'reviewer_output_limit');
    assert.equal(
      Buffer.byteLength(lowered.stderr),
      20_000,
      'a tiny stdout cap no longer shrinks stderr'
    );
  }
);

test(
  'a raised cap does not bypass model identity, tool restrictions or timeouts',
  { timeout: 30_000 },
  async () => {
    const env = { [STDOUT_CAPTURE_ENV]: '524288' };
    const anthropic = { provider: 'anthropic', model: 'claude-opus-5', env };
    const result = model =>
      `console.log(JSON.stringify({type:'result',${model}result:'ok\\nVERDICT: FINDINGS'}))`;
    const unattested = await run(result(''), anthropic);
    assert.equal(unattested.status, 'failed');
    assert.equal(unattested.error, 'provider model unattested');
    const attested = await run(result("model:'claude-opus-5',"), anthropic);
    assert.equal(attested.status, 'ran');
    assert.equal(attested.providerReportedModel, 'claude-opus-5');
    const tool = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use' }] },
    });
    const blocked = await run(`console.log(${JSON.stringify(tool)});${linger}`, { env });
    assert.equal(blocked.blockerReason, 'reviewer_tool_request');
    assert.equal(attested.firstOutputTimeout.timeoutMs, 300_000);
    assert.equal(attested.totalTimeout.timeoutMs, 600_000);
    assert.equal(timeoutConfig('opus').totalTimeoutMs, 1_800_000);
  }
);
