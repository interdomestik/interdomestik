import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const accessScript = path.join(repoRoot, 'scripts/ci/model-review-access.mjs');
const evidenceScript = path.join(repoRoot, 'scripts/ci/model-review-evidence.mjs');

function addFakeClaude(binDir) {
  fs.symlinkSync('/bin/echo', path.join(binDir, 'claude'));
}

function withReceipt(receipt, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-review-evidence-'));
  fs.mkdirSync(path.join(root, 'reviews'));
  fs.writeFileSync(
    path.join(root, 'reviews/model-review-access.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  try {
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runEvidence(root, args = []) {
  return spawnSync(process.execPath, [evidenceScript, '--run-root', root, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function runAccessWithFakeClaude(name, args) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `model-review-${name}-`));
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  addFakeClaude(binDir);
  const result = spawnSync(process.execPath, [accessScript, '--run-root', root, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
  });
  return { result, root };
}

function readAccessReceipt(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'reviews/model-review-access.json'), 'utf8'));
}

test('model-review evidence passes when required route completed and optional route blocked', () => {
  withReceipt(
    {
      results: [
        { reviewer: 'sonnet', status: 'completed' },
        { reviewer: 'gemini', status: 'blocked' },
      ],
    },
    root => {
      const result = runEvidence(root, ['--required', 'sonnet', '--optional', 'gemini']);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /blocked optional routes/u);
    }
  );
});

test('model-review evidence defaults to sonnet only', () => {
  withReceipt({ results: [{ reviewer: 'sonnet', status: 'completed' }] }, root => {
    const result = runEvidence(root);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /blocked optional routes/u);
  });
});

test('model-review evidence fails when a required route is blocked', () => {
  withReceipt({ results: [{ reviewer: 'sonnet', status: 'blocked' }] }, root => {
    const result = runEvidence(root, ['--required', 'sonnet']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /required reviewers blocked/u);
  });
});

test('model-review evidence requires call proof when requested', () => {
  withReceipt({ results: [{ reviewer: 'sonnet', status: 'available' }] }, root => {
    const result = runEvidence(root, ['--required', 'sonnet', '--require-call']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /need call proof/u);
  });
});

test('model-review access writes receipts for callable and command-only routes', () => {
  const scenarios = [
    {
      name: 'access',
      args: ['--reviewers', 'sonnet', '--required', 'sonnet'],
      status: 'pass',
      routeStatus: 'completed',
    },
    {
      name: 'command',
      args: ['--reviewers', 'sonnet', '--required', 'sonnet', '--probe', 'command'],
      status: 'available',
      routeStatus: 'available',
    },
    {
      name: 'required-union',
      args: ['--reviewers', 'gemini', '--required', 'sonnet', '--probe', 'command'],
      status: 'available',
      routeStatus: 'available',
    },
    {
      name: 'fable-escalation',
      args: ['--reviewers', 'fable', '--required', 'fable', '--probe', 'command'],
      status: 'available',
      routeStatus: 'available',
      requiredReviewer: 'fable',
    },
  ];

  for (const scenario of scenarios) {
    const { result, root } = runAccessWithFakeClaude(scenario.name, scenario.args);
    try {
      assert.equal(result.status, 0, result.stderr);
      const receipt = readAccessReceipt(root);
      assert.equal(receipt.status, scenario.status);
      const reviewer = scenario.requiredReviewer || 'sonnet';
      const requiredResult = receipt.results.find(item => item.reviewer === reviewer);
      assert.equal(requiredResult.required, true);
      assert.equal(requiredResult.status, scenario.routeStatus);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
