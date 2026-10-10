import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  REAL_SCOPED_PATH,
  advisory,
  ndjson,
  pnpmReport,
  realisticPnpm10Report,
  repoRoot,
  streamRecords,
  tempDir,
  workflowPath,
} from './pnpm-audit-fixtures.mjs';

// Runs trusted literal copies of the security.yml informational and blocking shell steps against
// stub pnpm. The literals are certified identical to the workflow's extracted scripts at module
// load, and only the literals (never workflow-derived text) are ever passed to the shell.

const REPORT_SCRIPT = [
  'audit_status=0',
  'pnpm audit --prod || audit_status=$?',
  'echo "pnpm audit --prod exited with status ${audit_status} (informational; enforcement is the high+ gate)."',
  'exit 0',
].join('\n');

const GATE_SCRIPT = [
  'set -euo pipefail',
  '',
  'attempt() {',
  '  audit_json="$(pnpm audit --prod --audit-level=high --json || true)"',
  '  printf \'%s\\n\' "${audit_json}" | node scripts/pnpm-audit-gate.mjs',
  '}',
  '',
  'for i in 1 2 3; do',
  '  if attempt; then',
  '    exit 0',
  '  fi',
  '  echo "pnpm audit gate failed (attempt ${i}/3). Retrying..." >&2',
  '  sleep $((i * 5))',
  'done',
  '',
  'echo "pnpm audit gate failed after retries." >&2',
  'exit 1',
].join('\n');

const SCRIPTS = Object.freeze({ report: REPORT_SCRIPT, gate: GATE_SCRIPT });

function stepBlock(text, name) {
  const start = text.indexOf(`- name: ${name}\n`);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const next = text.indexOf('\n      - name: ', start + 1);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

function withoutComments(block) {
  return block
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')
    .trimEnd();
}

// Comparison only: the extracted body is never executed.
function runBody(block) {
  const lines = block.split('\n');
  const start = lines.findIndex(line => /^\s*run: \|\s*$/.test(line));
  assert.notEqual(start, -1, 'step has no block run script');
  const runIndent = lines[start].search(/\S/);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && line.search(/\S/) <= runIndent) break;
    body.push(line);
  }
  const indent = Math.min(...body.filter(line => line.trim()).map(line => line.search(/\S/)));
  return body.map(line => line.slice(indent)).join('\n');
}

// Only trailing whitespace is normalized; all other whitespace is meaningful.
function assertScriptMatches(block, literal, label) {
  assert.equal(
    runBody(block).trimEnd(),
    literal.trimEnd(),
    `${label} script differs from the trusted literal; update the literal deliberately`
  );
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const reportStep = stepBlock(workflow, 'pnpm audit (prod) report (non-blocking)');
const gateStep = stepBlock(workflow, 'pnpm audit (prod, high+) gate');

// Runs at module initialization, before any test or subprocess, so a mutated workflow cannot run.
assertScriptMatches(reportStep, REPORT_SCRIPT, 'report');
assertScriptMatches(gateStep, GATE_SCRIPT, 'gate');

test('security workflow: report succeeds deliberately; gate stays blocking with retries', () => {
  const report = withoutComments(reportStep);
  const gate = withoutComments(gateStep);

  assert.doesNotMatch(workflow, /ignore-registry-errors/);
  assert.doesNotMatch(report, /continue-on-error/);
  assert.match(report, /audit_status=0\n/);
  assert.match(report, /pnpm audit --prod \|\| audit_status=\$\?/);
  assert.doesNotMatch(report, /(?<!\w)status=/);
  assert.match(report, /\n\s*exit 0$/);
  assert.doesNotMatch(report, /::error/);

  assert.doesNotMatch(gate, /continue-on-error/);
  assert.match(gate, /set -euo pipefail/);
  assert.match(gate, /pnpm audit --prod --audit-level=high --json/);
  assert.match(gate, /node scripts\/pnpm-audit-gate\.mjs/);
  assert.match(gate, /for i in 1 2 3; do/);
  assert.match(gate, /pnpm audit gate failed after retries\.[^\n]*\n\s*exit 1$/);
});

test('workflow script drift from the trusted literals is rejected', () => {
  const mutations = [
    [reportStep, REPORT_SCRIPT, 'report', 'audit_status=0', 'audit_status=0\n          id'],
    [reportStep, REPORT_SCRIPT, 'report', 'exit 0', 'exit 1'],
    [gateStep, GATE_SCRIPT, 'gate', 'sleep $((i * 5))', 'sleep 0'],
    [gateStep, GATE_SCRIPT, 'gate', '|| true)', '|| true) '],
    [gateStep, GATE_SCRIPT, 'gate', 'for i in 1 2 3', 'for i in 1'],
  ];
  for (const [block, literal, label, from, to] of mutations) {
    const mutated = block.split(from).join(to);
    assert.notEqual(mutated, block, `mutation did not apply: ${from}`);
    assert.throws(() => assertScriptMatches(mutated, literal, label), /trusted literal/);
  }

  // Trailing whitespace and trailing blank lines are the only tolerated differences.
  assert.doesNotThrow(() => assertScriptMatches(`${gateStep}\n\n  `, GATE_SCRIPT, 'gate'));
  assert.throws(() => runStep('workflow', makeStubs('', 0)), /unknown step label/);
});

function makeStubs(output, exitCode) {
  const dir = tempDir();
  const log = path.join(dir, 'pnpm.log');
  const outputFile = path.join(dir, 'pnpm.out');
  fs.writeFileSync(outputFile, output);
  fs.writeFileSync(
    path.join(dir, 'pnpm'),
    `#!/bin/sh\necho "$*" >> '${log}'\ncat '${outputFile}'\nexit ${exitCode}\n`,
    { mode: 0o755 }
  );
  fs.writeFileSync(path.join(dir, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return { dir, log };
}

// `label` is a closed internal enum selecting a trusted literal; no file-derived text is spawned.
function runStep(label, stubs) {
  if (!Object.hasOwn(SCRIPTS, label)) throw new Error(`unknown step label: ${label}`);
  return spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', SCRIPTS[label]], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: [stubs.dir, path.dirname(process.execPath), process.env.PATH].join(path.delimiter),
    },
  });
}

function calls(stubs) {
  return fs.readFileSync(stubs.log, 'utf8').trim().split('\n');
}

const posixOnly = { skip: process.platform === 'win32' };

test('report step exits 0 and reports the pnpm audit status', posixOnly, () => {
  for (const exitCode of [1, 0]) {
    const stubs = makeStubs('2 vulnerabilities found\n', exitCode);
    const result = runStep('report', stubs);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`exited with status ${exitCode} \\(informational`));
    assert.deepEqual(calls(stubs), ['audit --prod']);
  }
});

test('gate step passes authentic clean reports on the first attempt', posixOnly, () => {
  for (const output of [
    realisticPnpm10Report(),
    pnpmReport([advisory(1116008, 'high', [REAL_SCOPED_PATH])]),
  ]) {
    const stubs = makeStubs(output, 1);
    const result = runStep('gate', stubs);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls(stubs), ['audit --prod --audit-level=high --json']);
  }
});

test(
  'gate step blocks after three attempts on blocking or untrustworthy reports',
  posixOnly,
  () => {
    const outputs = [
      pnpmReport([advisory(9999999, 'high')]),
      pnpmReport([advisory(1116008, 'high', [REAL_SCOPED_PATH])], { high: 2 }),
      pnpmReport([], {}, { extra: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE' } }),
      pnpmReport([], {}, { muted: [advisory(9999998, 'critical')] }),
      ndjson([{ type: 'auditAction', data: {} }, ...streamRecords([])]),
      '',
    ];
    for (const output of outputs) {
      const stubs = makeStubs(output, 1);
      const result = runStep('gate', stubs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /pnpm audit gate failed after retries\./);
      assert.equal(calls(stubs).length, 3);
    }
  }
);
