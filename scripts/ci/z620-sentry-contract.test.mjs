import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertReadOnlySentryMode,
  classifySentryConfig,
  validateSentryRelease,
} from './z620-sentry-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('missing provider credentials are explicit and never a false pass', () => {
  const result = classifySentryConfig({});
  assert.equal(result.configured, false);
  assert.deepEqual(result.missing, ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']);
  assert.equal(result.tokenExposed, false);
});

test('release validation accepts only the exact 40-character candidate SHA', () => {
  const sha = '31a20e2e672367caa2cc54131f2c36d637c69dfe';
  assert.equal(validateSentryRelease(sha, sha), true);
  assert.equal(validateSentryRelease(sha.slice(0, 9), sha), false);
  assert.equal(validateSentryRelease('release-latest', sha), false);
});

test('ordinary CI rejects Sentry apply, release, and upload modes', () => {
  assert.equal(assertReadOnlySentryMode('check'), 'check');
  for (const command of ['apply', 'release', 'upload']) {
    assert.throws(() => assertReadOnlySentryMode(command), /read-only/u);
  }
});

test('source maps are hidden and upload is disabled without provider credentials', () => {
  const nextConfig = read('apps/web/next.config.mjs');
  assert.match(nextConfig, /disable:\s*!enableSentryBuildUpload/u);
  assert.match(nextConfig, /hideSourceMaps:\s*true/u);
  assert.match(nextConfig, /Boolean\(sentryOrg && sentryProject && sentryAuthToken\)/u);
});

test('Docker code gate strips all Sentry provider credentials', () => {
  const dockerGate = read('scripts/docker-gate.sh');
  for (const name of [
    'SENTRY_AUTH_TOKEN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'SENTRY_DSN',
    'NEXT_PUBLIC_SENTRY_DSN',
  ]) {
    assert.match(dockerGate, new RegExp(`${name}=`, 'u'));
  }
});

test('missing-token alert validation runs catalog-only without network mutation', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(root, 'scripts/sentry-alerts.mjs'), 'check', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SENTRY_AUTH_TOKEN: '',
        SENTRY_ORG: '',
        SENTRY_PROJECT: '',
      },
    }
  );
  const parsed = JSON.parse(output);
  assert.equal(parsed.mode, 'catalog-only');
  assert.match(parsed.note, /Remote comparison skipped/u);
});
