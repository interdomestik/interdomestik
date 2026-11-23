import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

// Required check `audit`, step "Run lightweight governance audits": each command runs even when
// another fails, and any failure fails the step and is named in its error. Defect class: a
// required check that reports green while an audit fails or never runs (`a && b && c` under
// `bash -e`).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const step = workflow.jobs.audit.steps.find(s => s.name === 'Run lightweight governance audits');
const AUDITS = ['track:audit', 'plan:audit', 'repo:size:check'];
// `shell: bash` runs `bash --noprofile --norc -eo pipefail {0}`; an implicit shell runs `bash -e
// {0}`. The body must hold under both. Bash by absolute path (Sonar S4036).
const SHELLS = {
  'shell: bash': ['--noprofile', '--norc', '-eo', 'pipefail'],
  'implicit shell': ['-e'],
};

// Runs a step body with stub `pnpm` and `node` on PATH. Each stub logs its arguments and fails
// when its first argument is listed in `fail`.
function runStep(
  body,
  { fail = [], legacy = 'false', broad = 'true', flags = SHELLS['shell: bash'] } = {}
) {
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
    const result = spawnSync('/bin/bash', [...flags, script], {
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
const errorLine = names => new RegExp(`::error::Governance audit step failed: ${names}\\n`, 'u');

test('governance step: it pins its shell', () => {
  assert.equal(step.shell, 'bash');
});

for (const [shell, flags] of Object.entries(SHELLS)) {
  test(`governance step (${shell}): every command passes, the step passes`, () => {
    const run = runStep(step.run, { flags });
    assert.equal(run.status, 0, run.output);
    assert.ok(ranAll(run.calls), run.calls.join('\n'));
    assert.ok(run.calls.includes('pnpm test:delivery-safety'));
    assert.doesNotMatch(run.output, /::error::/u);
  });

  for (const audit of AUDITS) {
    test(`governance step (${shell}): ${audit} fails, the rest still runs, the step fails`, () => {
      const run = runStep(step.run, { fail: [audit], flags });
      assert.notEqual(run.status, 0, run.output);
      assert.ok(ranAll(run.calls), run.calls.join('\n'));
      assert.ok(run.calls.includes('pnpm test:delivery-safety'), run.calls.join('\n'));
      assert.match(run.output, errorLine(audit));
    });
  }

  test(`governance step (${shell}): every failure is named, on each lane`, () => {
    const all = runStep(step.run, { fail: [...AUDITS, 'test:delivery-safety'], flags });
    assert.notEqual(all.status, 0, all.output);
    assert.match(all.output, errorLine(`${AUDITS.join(' ')} test:delivery-safety`));

    const legacy = runStep(step.run, { legacy: 'true', fail: ['legacy:validate'], flags });
    assert.notEqual(legacy.status, 0, legacy.output);
    assert.ok(ranAll(legacy.calls), legacy.calls.join('\n'));
    assert.ok(!legacy.calls.includes('pnpm test:delivery-safety'), legacy.calls.join('\n'));
    assert.match(legacy.output, errorLine('legacy:validate'));

    const narrow = runStep(step.run, { broad: 'false', fail: ['track:audit', '--test'], flags });
    assert.notEqual(narrow.status, 0, narrow.output);
    assert.ok(ranAll(narrow.calls), narrow.calls.join('\n'));
    assert.ok(
      narrow.calls.some(call => call.startsWith('node --test ')),
      narrow.calls.join('\n')
    );
    assert.match(narrow.output, errorLine('track:audit narrow-contract-tests'));
    assert.match(narrow.output, /Heavy audit lane skipped\./u);
  });
}

test('governance step: the harness detects the defect class it guards against', () => {
  // Control: the previous body went green with a failed track:audit and never ran the other two.
  const previous =
    'pnpm track:audit && pnpm plan:audit && pnpm repo:size:check\npnpm test:delivery-safety\n';
  for (const flags of Object.values(SHELLS)) {
    const run = runStep(previous, { fail: ['track:audit'], flags });
    assert.equal(run.status, 0, run.output);
    assert.deepEqual(run.calls, ['pnpm track:audit', 'pnpm test:delivery-safety']);
  }
});
