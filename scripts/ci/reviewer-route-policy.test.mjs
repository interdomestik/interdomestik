import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';
import { defaultReviewers, modelReviewRoutes } from './model-review-routes.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

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

test('reviewer denial policy has an exact structured owner', () => {
  assert.equal(
    structuredArtifactOwner('scripts/ci/reviewer-no-tools.toml'),
    'reviewer-tool-denial-contract'
  );
  assert.equal(structuredArtifactOwner('scripts/ci/unreviewed-tools.toml'), null);
});

for (const route of ['gemini', 'flash']) {
  for (const failure of ['conflict', 'unreadable']) {
    test(`${route} records ${failure} policy refusal without starting a provider`, () => {
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-policy-refusal-'));
      const preload = path.join(cwd, 'preload.mjs');
      fs.writeFileSync(
        preload,
        `
        import fs from 'node:fs';
        import childProcess from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        const read = fs.readdirSync;
        fs.readdirSync = function(directory, ...args) {
          if (String(directory).endsWith('policies')) {
            if (${JSON.stringify(failure)} === 'conflict') return ['admin.toml'];
            throw Object.assign(new Error('policy unavailable'), { code: 'EACCES' });
          }
          return read.call(this, directory, ...args);
        };
        childProcess.spawn = () => {
          fs.writeFileSync('provider-started', 'unexpected');
          throw new Error('provider must not start');
        };
        syncBuiltinESMExports();
      `
      );
      try {
        const result = spawnSync(
          process.execPath,
          [
            '--import',
            preload,
            path.join(scriptDir, 'run-model-reviewer-route.mjs'),
            '--route',
            route,
          ],
          { cwd, encoding: 'utf8' }
        );
        assert.equal(result.status, 125, result.stderr);
        const summary = JSON.parse(result.stdout);
        const receipt = JSON.parse(fs.readFileSync(summary.receipt.jsonPath, 'utf8'));
        assert.equal(receipt.status, 'blocked');
        assert.equal(receipt.blockerReason, 'reviewer_argument_preparation');
        assert.equal(receipt.routeName, route);
        assert.equal(receipt.model, modelReviewRoutes[route].model);
        assert.deepEqual(receipt.commandInvoked, ['gemini']);
        assert.equal(receipt.exitCode, 125);
        assert.equal(receipt.providerReportedModel, null);
        assert.equal(receipt.reviewVerdict, null);
        assert.equal(fs.existsSync(path.join(cwd, 'provider-started')), false);
        assert.match(
          fs.readFileSync(summary.receipt.mdPath, 'utf8'),
          /reviewer_argument_preparation/u
        );
      } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
}
