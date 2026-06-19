import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendPullRequestScannerProperties,
  appendScannerProperties,
  buildNativeScannerArgs,
  normalizeSonarHostUrl,
  resolveSonarStatusTarget,
  waitForSonarUp,
} from './sonar-scan-lib.mjs';

test('appendScannerProperties adds skip JRE provisioning when requested', () => {
  assert.deepEqual(
    appendScannerProperties(['-Dsonar.host.url=https://sonarcloud.io'], {
      skipJreProvisioning: true,
    }),
    ['-Dsonar.host.url=https://sonarcloud.io', '-Dsonar.scanner.skipJreProvisioning=true']
  );
});

test('appendScannerProperties does not duplicate skip JRE provisioning property', () => {
  assert.deepEqual(
    appendScannerProperties(
      ['-Dsonar.host.url=https://sonarcloud.io', '-Dsonar.scanner.skipJreProvisioning=true'],
      {
        skipJreProvisioning: true,
      }
    ),
    ['-Dsonar.host.url=https://sonarcloud.io', '-Dsonar.scanner.skipJreProvisioning=true']
  );
});

test('buildNativeScannerArgs places dlx before package selection', () => {
  assert.deepEqual(buildNativeScannerArgs(['-Dsonar.host.url=https://sonarcloud.io']), [
    'dlx',
    '--package=@sonar/scan',
    'sonar-scanner',
    '-Dsonar.host.url=https://sonarcloud.io',
  ]);
});

test('appendPullRequestScannerProperties adds explicit pull request analysis properties', () => {
  assert.deepEqual(
    appendPullRequestScannerProperties(['-Dsonar.host.url=https://sonarcloud.io'], {
      pullRequestBase: 'main',
      pullRequestBranch: 'codex/m03-commercial-idempotency',
      pullRequestKey: '312',
    }),
    [
      '-Dsonar.host.url=https://sonarcloud.io',
      '-Dsonar.pullrequest.key=312',
      '-Dsonar.pullrequest.branch=codex/m03-commercial-idempotency',
      '-Dsonar.pullrequest.base=main',
    ]
  );
});

test('appendPullRequestScannerProperties leaves non-PR scans unchanged', () => {
  assert.deepEqual(
    appendPullRequestScannerProperties(['-Dsonar.host.url=https://sonarcloud.io'], {}),
    ['-Dsonar.host.url=https://sonarcloud.io']
  );
});

test('normalizeSonarHostUrl rejects credential-bearing URLs', () => {
  assert.throws(
    () => normalizeSonarHostUrl('https://user:token@sonarcloud.io?token=secret'),
    /must not include credentials/u
  );
});

test('normalizeSonarHostUrl rejects malformed URLs with a redacted error', () => {
  assert.throws(() => normalizeSonarHostUrl('://user:token@example.com'), /must be a valid URL/u);
});

test('normalizeSonarHostUrl defaults to SonarCloud and rejects arbitrary hosts', () => {
  assert.equal(normalizeSonarHostUrl(), 'https://sonarcloud.io');
  assert.equal(normalizeSonarHostUrl('https://sonarcloud.io/'), 'https://sonarcloud.io');
  assert.throws(
    () => normalizeSonarHostUrl('https://example.test'),
    /approved local SonarQube URL/u
  );
});

test('resolveSonarStatusTarget returns fixed targets only for approved local hosts', () => {
  const localUrl = host => `${'http:'}//${host}`;

  assert.equal(resolveSonarStatusTarget({ sonarHostUrl: 'https://sonarcloud.io' }), null);
  assert.equal(
    resolveSonarStatusTarget({
      sonarHostUrl: localUrl('host.docker.internal:9000'),
      forceNative: true,
    }),
    'host-docker-native'
  );
  assert.equal(
    resolveSonarStatusTarget({ sonarHostUrl: localUrl('sonarqube:9000'), forceNative: false }),
    'local-docker'
  );
});

test('waitForSonarUp fails clearly when the server stays unavailable', async () => {
  await assert.rejects(
    () => waitForSonarUp({ statusTarget: 'local-docker', timeoutMs: 1 }),
    /did not become ready/u
  );
});
