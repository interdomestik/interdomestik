import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';
import { defaultReviewers, modelReviewRoutes } from './model-review-routes.mjs';
import { boundedReviewFrame, buildReviewerPrompt } from './run-model-reviewer-route.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

test('no-tools reviewer prompt contains its review frame and forbids deferred inspection', () => {
  const prompt = buildReviewerPrompt({
    instruction: 'Custom review task.',
    reviewFrame: 'Find security regressions.',
    packetText: 'Candidate diff: PATCH',
  });
  for (const expected of [
    /Custom review task\./u,
    /closed, no-tools review/u,
    /Do not call, request, simulate, or emit tool invocations or shell commands/u,
    /Find security regressions\./u,
    /Candidate diff: PATCH/u,
    /BEGIN REVIEW AUTHORITY/u,
    /END REVIEW AUTHORITY/u,
    /finish the review in this response/u,
    /VERDICT: FINDINGS/u,
  ])
    assert.match(prompt, expected);
});

test('review authority is bounded per file and in aggregate', () => {
  assert.equal(
    boundedReviewFrame(
      [
        { filePath: 'one.md', text: '1234' },
        { filePath: 'two.md', text: '56' },
      ],
      { maxFileBytes: 4, maxFrameBytes: 40 }
    ),
    '# one.md\n1234\n\n# two.md\n56'
  );
  assert.throws(
    () =>
      boundedReviewFrame([{ filePath: 'oversized.md', text: '12345' }], {
        maxFileBytes: 4,
        maxFrameBytes: 40,
      }),
    /review authority file exceeds the bounded packet limit: oversized\.md/u
  );
  assert.throws(
    () =>
      boundedReviewFrame(
        [
          { filePath: 'one.md', text: '1234' },
          { filePath: 'two.md', text: '5678' },
        ],
        { maxFileBytes: 4, maxFrameBytes: 20 }
      ),
    /combined review authority exceeds the bounded packet limit/u
  );
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
