import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

// Required check `audit`, step "Run lightweight governance audits": each of the three governance
// audits runs even when another fails, and any failure fails the step. Defect class: a required
// check that reports green while an audit fails or never runs (`a && b && c` under `bash -e`).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const step = workflow.jobs.audit.steps.find(s => s.name === 'Run lightweight governance audits');
const AUDITS = ['track:audit', 'plan:audit', 'repo:size:check'];
// The shell GitHub Actions uses for `run:` on Linux runners, by absolute path (Sonar S4036).
const BASH_ARGS = ['--noprofile', '--norc', '-eo', 'pipefail'];

// Runs a step body with stub `pnpm` and `node` on PATH. Each stub logs its arguments and fails
// when its first argument is listed in `fail`.
function runStep(body, { fail = [], legacy = 'false', broad = 'true' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idct-gov-'));
  try {
    const bin = path.join(dir, 'bin');
    const log = path.join(dir, 'calls.log');
    fs.mkdirSync(bin);
    for (const tool of ['pnpm', 'node']) {
      const stub = [
        '#!/bin/sh',
        `printf '%s %s\\n' ${tool} "$*" >> "$CALL_LOG"`,
        'case " $FAIL " in *" $1 "*) exit 3 ;; esac',
        'exit 0',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(bin, tool), stub, { mode: 0o755 });
    }
    const script = path.join(dir, 'step.sh');
    // Actions expressions are resolved by the runner before bash sees the body.
    fs.writeFileSync(script, body.replaceAll(/\$\{\{[^}]*\}\}/gu, 'expr'));
    const result = spawnSync('/bin/bash', [...BASH_ARGS, script], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        CALL_LOG: log,
        FAIL: fail.join(' '),
        LEGACY_VALIDATION_SHOULD_RUN: legacy,
        RUN_BROAD: broad,
      },
    });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
    return { status: result.status, output: `${result.stdout}${result.stderr}`, calls };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const ranAll = calls => AUDITS.every(audit => calls.includes(`pnpm ${audit}`));

test('governance step: every audit passes, the step passes', () => {
  const run = runStep(step.run);
  assert.equal(run.status, 0, run.output);
  assert.ok(ranAll(run.calls), run.calls.join('\n'));
  assert.ok(run.calls.includes('pnpm test:delivery-safety'));
});

for (const audit of AUDITS) {
  test(`governance step: ${audit} fails, the others still run and the step fails`, () => {
    const run = runStep(step.run, { fail: [audit] });
    assert.notEqual(run.status, 0, run.output);
    assert.ok(ranAll(run.calls), run.calls.join('\n'));
    assert.ok(run.calls.includes('pnpm test:delivery-safety'), run.calls.join('\n'));
    assert.match(run.output, new RegExp(`::error::Governance audits failed: ${audit}\\n`, 'u'));
  });
}

test('governance step: all three fail, the error names each', () => {
  const run = runStep(step.run, { fail: AUDITS });
  assert.notEqual(run.status, 0, run.output);
  assert.match(
    run.output,
    /::error::Governance audits failed: track:audit plan:audit repo:size:check\n/u
  );
});

test('governance step: a failure on the narrow lane still fails the step', () => {
  const run = runStep(step.run, { fail: ['track:audit'], broad: 'false' });
  assert.notEqual(run.status, 0, run.output);
  assert.ok(ranAll(run.calls), run.calls.join('\n'));
  assert.ok(
    run.calls.some(call => call.startsWith('node --test ')),
    run.calls.join('\n')
  );
});

test('governance step: the selected legacy suite and the delivery safety tests still fail it', () => {
  assert.notEqual(runStep(step.run, { legacy: 'true', fail: ['legacy:validate'] }).status, 0);
  assert.notEqual(runStep(step.run, { fail: ['test:delivery-safety'] }).status, 0);
  assert.notEqual(runStep(step.run, { broad: 'false', fail: ['--test'] }).status, 0);
});

test('governance step: the harness detects the defect class it guards against', () => {
  // Control: the previous body went green with a failed track:audit and never ran the other two.
  const previous =
    'pnpm track:audit && pnpm plan:audit && pnpm repo:size:check\npnpm test:delivery-safety\n';
  const run = runStep(previous, { fail: ['track:audit'] });
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.calls, ['pnpm track:audit', 'pnpm test:delivery-safety']);
});
