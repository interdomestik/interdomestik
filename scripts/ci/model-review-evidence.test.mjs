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

function writeIsolatedPreload(root, failure = null) {
  const preload = path.join(root, 'preload.mjs');
  const routesUrl = new URL('./model-review-routes.mjs', import.meta.url).href;
  fs.writeFileSync(
    preload,
    `
    import fs from 'node:fs';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { modelReviewRoutes, googleReviewArgs } from ${JSON.stringify(routesUrl)};
    const fixture = 'console.log(JSON.stringify({model:"fixture-model",result:"VERDICT: PASS"}))';
    for (const route of Object.values(modelReviewRoutes)) {
      Object.assign(route, {
        command: process.execPath, nativeProtocol: undefined,
        provider: 'fixture', model: 'fixture-model', args: () => ['-e', fixture],
      });
    }
    const failure = ${JSON.stringify(failure)};
    if (failure) {
      fs.readdirSync = () => {
        if (failure === 'conflict') return ['admin.toml'];
        throw Object.assign(new Error('policy unavailable'), { code: 'EACCES' });
      };
      for (const name of ['gemini', 'flash']) {
        modelReviewRoutes[name].args = prompt => googleReviewArgs(prompt, 'fixture-model');
      }
    }
    const spawn = childProcess.spawn;
    const unexpected = () => {
      fs.writeFileSync(${JSON.stringify(path.join(root, 'provider-started'))}, 'unexpected');
      throw new Error('Unexpected subprocess: provider execution forbidden in contract tests');
    };
    childProcess.spawn = (command, args, options) => {
      if (command !== process.execPath || args.length !== 2 ||
          args[0] !== '-e' || args[1] !== fixture) return unexpected();
      return spawn(command, args, options);
    };
    childProcess.spawnSync = unexpected;
    childProcess.exec = unexpected;
    childProcess.execFile = unexpected;
    childProcess.execSync = unexpected;
    childProcess.execFileSync = unexpected;
    childProcess.fork = unexpected;
    syncBuiltinESMExports();
  `
  );
  return preload;
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

function runIsolatedAccess(name, args) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `model-review-${name}-`));
  const preload = writeIsolatedPreload(root);
  const result = spawnSync(
    process.execPath,
    ['--import', preload, accessScript, '--run-root', root, ...args],
    { cwd: repoRoot, encoding: 'utf8', timeout: 10_000 }
  );
  assert.equal(fs.existsSync(path.join(root, 'provider-started')), false);
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
      name: 'opus-escalation',
      args: ['--reviewers', 'opus', '--required', 'opus', '--probe', 'command'],
      status: 'available',
      routeStatus: 'available',
      requiredReviewer: 'opus',
    },
  ];

  for (const scenario of scenarios) {
    const { result, root } = runIsolatedAccess(scenario.name, scenario.args);
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

for (const failure of ['conflict', 'unreadable']) {
  for (const required of ['sonnet', 'gemini']) {
    test(`access receipt retains ${failure} Google refusal with required ${required}`, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'access-policy-refusal-'));
      const preload = writeIsolatedPreload(root, failure);
      try {
        const result = spawnSync(
          process.execPath,
          [
            '--import',
            preload,
            accessScript,
            '--run-root',
            root,
            '--reviewers',
            'gemini,flash,sonnet',
            '--required',
            required,
          ],
          { cwd: root, encoding: 'utf8', timeout: 10_000 }
        );
        assert.equal(result.status, required === 'sonnet' ? 0 : 1, result.stderr);
        const receipt = readAccessReceipt(root);
        assert.equal(receipt.status, required === 'sonnet' ? 'pass' : 'blocked');
        assert.equal(receipt.results.length, 3);
        for (const reviewer of ['gemini', 'flash']) {
          const row = receipt.results.find(item => item.reviewer === reviewer);
          assert.equal(row.status, 'blocked');
          assert.match(row.reason, /^reviewer_argument_preparation:/u);
        }
        assert.equal(receipt.results.find(item => item.reviewer === 'sonnet').status, 'completed');
        assert.equal(fs.existsSync(path.join(root, 'provider-started')), false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
}
