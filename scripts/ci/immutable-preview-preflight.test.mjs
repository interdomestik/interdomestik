import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APPROVED_PREVIEW_ORIGIN,
  EXPECTED_COMMIT_SHA,
} from './immutable-preview-diagnostic-lib.mjs';
import { runPreflight } from './immutable-preview-preflight.mjs';

async function withPreflightReceipt(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'immutable-preview-preflight-'));
  const outputPath = path.join(directory, 'provenance.json');
  try {
    await run(outputPath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function preflightEnv() {
  return {
    GITHUB_RUN_ID: '1234',
    GITHUB_RUN_ATTEMPT: '1',
    VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret',
  };
}

test('uses the source-pinned target even when legacy target environment values are present', async () => {
  await withPreflightReceipt(async outputPath => {
    const receipt = await runPreflight({
      env: {
        ...preflightEnv(),
        DIAGNOSTIC_PREVIEW_ORIGIN: 'https://attacker.example',
        DIAGNOSTIC_EXPECTED_SHA: '0'.repeat(40),
      },
      outputPath,
      timeoutMs: 100,
      buildProtectionHeaders: () => ({
        'x-vercel-protection-bypass': 'bypass-secret',
      }),
      fetchImpl: async url => {
        assert.equal(String(url), `${APPROVED_PREVIEW_ORIGIN}/api/health`);
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          json: async () => ({
            status: 'healthy',
            build: { commitSha: EXPECTED_COMMIT_SHA, deployEnv: 'preview' },
          }),
        };
      },
    });
    assert.equal(receipt.status, 'verified');
    assert.equal(receipt.origin, APPROVED_PREVIEW_ORIGIN);
    assert.equal(receipt.commitSha, EXPECTED_COMMIT_SHA);
  });
});

test('persists sanitized partial redirects and preserves redirect-limit failure', async () => {
  await withPreflightReceipt(async outputPath => {
    const requestHeaders = [];
    const fetchImpl = async (_url, init) => {
      requestHeaders.push(init.headers);
      return {
        status: 307,
        ok: false,
        headers: new Headers({ location: '/api/health?token=private-value' }),
      };
    };

    await assert.rejects(
      runPreflight({
        env: preflightEnv(),
        fetchImpl,
        outputPath,
        timeoutMs: 100,
        buildProtectionHeaders: () => ({
          'x-vercel-protection-bypass': 'bypass-secret',
          'x-vercel-set-bypass-cookie': 'true',
        }),
      }),
      /redirect limit/u
    );

    const receipt = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    assert.equal(receipt.status, 'unverified');
    assert.deepEqual(receipt.error, { category: 'redirect-limit' });
    assert.equal(receipt.httpStatus, 307);
    assert.equal(receipt.redirects.length, 4);
    assert.deepEqual(
      new Set(receipt.redirects.map(item => item.url)),
      new Set([`${APPROVED_PREVIEW_ORIGIN}/api/health`])
    );
    assert.ok(
      requestHeaders.every(headers => headers['x-vercel-protection-bypass'] === 'bypass-secret')
    );
    assert.ok(requestHeaders.every(headers => !('x-vercel-set-bypass-cookie' in headers)));
    assert.doesNotMatch(JSON.stringify(receipt), /private-value|bypass-secret|token=/u);
  });
});

test('persists sanitized network and invalid-health failures', async t => {
  await t.test('network failure', async () => {
    await withPreflightReceipt(async outputPath => {
      await assert.rejects(
        runPreflight({
          env: preflightEnv(),
          outputPath,
          timeoutMs: 100,
          fetchImpl: async () => {
            throw new Error('socket failed with token=private-value');
          },
        }),
        /socket failed/u
      );
      const receipt = JSON.parse(await fs.readFile(outputPath, 'utf8'));
      assert.equal(receipt.status, 'unverified');
      assert.deepEqual(receipt.error, { category: 'network' });
      assert.equal(receipt.httpStatus, null);
      assert.deepEqual(receipt.redirects, []);
      assert.doesNotMatch(JSON.stringify(receipt), /private-value|token=/u);
    });
  });

  await t.test('standard fetch failure with nested network cause', async () => {
    await withPreflightReceipt(async outputPath => {
      const networkError = new TypeError('fetch failed', {
        cause: Object.assign(new Error('getaddrinfo ENOTFOUND private-host.example'), {
          code: 'ENOTFOUND',
        }),
      });
      await assert.rejects(
        runPreflight({
          env: preflightEnv(),
          outputPath,
          timeoutMs: 100,
          fetchImpl: async () => {
            throw networkError;
          },
        }),
        error => error === networkError
      );
      const receipt = JSON.parse(await fs.readFile(outputPath, 'utf8'));
      assert.equal(receipt.status, 'unverified');
      assert.deepEqual(receipt.error, { category: 'network' });
      assert.doesNotMatch(JSON.stringify(receipt), /private-host|ENOTFOUND|fetch failed/u);
    });
  });

  await t.test('invalid health provenance', async () => {
    await withPreflightReceipt(async outputPath => {
      await assert.rejects(
        runPreflight({
          env: preflightEnv(),
          outputPath,
          timeoutMs: 100,
          fetchImpl: async () => ({
            status: 200,
            ok: true,
            headers: new Headers(),
            json: async () => ({
              status: 'healthy',
              build: { commitSha: '0'.repeat(40), deployEnv: 'preview' },
            }),
          }),
        }),
        /commit SHA mismatch/u
      );
      const receipt = JSON.parse(await fs.readFile(outputPath, 'utf8'));
      assert.equal(receipt.status, 'unverified');
      assert.deepEqual(receipt.error, { category: 'commit-mismatch' });
      assert.equal(receipt.httpStatus, 200);
      assert.deepEqual(receipt.redirects, []);
      assert.doesNotMatch(JSON.stringify(receipt), /bypass-secret/u);
    });
  });
});
