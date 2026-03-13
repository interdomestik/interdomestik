import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendPullRequestScannerProperties,
  appendScannerProperties,
  buildNativeScannerArgs,
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
  assert.deepEqual(buildNativeScannerArgs(['-Dsonar.host.url=http://localhost:9000']), [
    'dlx',
    '--package=@sonar/scan',
    'sonar-scanner',
    '-Dsonar.host.url=http://localhost:9000',
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
