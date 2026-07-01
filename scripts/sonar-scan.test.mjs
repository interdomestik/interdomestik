import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  appendPullRequestScannerProperties,
  appendScannerProperties,
  buildNativeScannerArgs,
  normalizeSonarHostUrl,
  resolveSonarStatusTarget,
  waitForSonarUp,
} from './sonar-scan-lib.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

test('sonar scan has a static contract against event-path PR context reads', () => {
  const sonarScan = fs.readFileSync(path.join(scriptDir, 'sonar-scan.mjs'), 'utf8');

  assert.doesNotMatch(sonarScan, /GITHUB_EVENT_PATH/);
  assert.doesNotMatch(sonarScan, /readFileSync/);
  assert.match(sonarScan, /SONAR_PULLREQUEST_KEY/);
  assert.match(sonarScan, /GITHUB_HEAD_REF/);
  assert.match(sonarScan, /GITHUB_BASE_REF/);
});

test('sonar gate exports explicit PR context before running the scanner', () => {
  const sonarGate = fs.readFileSync(path.join(scriptDir, 'sonar-gate.sh'), 'utf8');
  const exportIndex = sonarGate.indexOf(
    'export SONAR_PULLREQUEST_KEY SONAR_PULLREQUEST_BRANCH SONAR_PULLREQUEST_BASE'
  );
  const scanIndex = sonarGate.indexOf('pnpm sonar:scan');

  assert.match(sonarGate, /SONAR_PULLREQUEST_BRANCH="\$\{SONAR_PULLREQUEST_BRANCH:-\$\{GITHUB_HEAD_REF:-\}\}"/);
  assert.match(sonarGate, /SONAR_PULLREQUEST_BASE="\$\{SONAR_PULLREQUEST_BASE:-\$\{GITHUB_BASE_REF:-\}\}"/);
  assert.match(sonarGate, /catch\{process\.stdout\.write\('\\\\n'\)\}/);
  assert.match(sonarGate, /event_pr_key/);
  assert.ok(exportIndex > 0);
  assert.ok(scanIndex > 0);
  assert.ok(exportIndex < scanIndex);
});

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

test('waitForSonarUp fails fast for unknown status targets', async () => {
  await assert.rejects(
    () => waitForSonarUp({ statusTarget: 'unknown-target', timeoutMs: 10_000 }),
    /Unknown local SonarQube status target/u
  );
});
