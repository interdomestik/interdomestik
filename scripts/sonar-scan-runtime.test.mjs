import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  appendSonarAnalysisProperties,
  resolveSonarAnalysisContext,
} from './sonar-scan-runtime.mjs';

const SHA = '7590f454fac5129f7f2f6edd3993167af2f65d41';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

test('scan sources never read event files or pass credentials as scanner properties', () => {
  const sonarScan = ['sonar-scan.mjs', 'sonar-scan-runtime.mjs']
    .map(file => fs.readFileSync(path.join(scriptDir, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(sonarScan, /GITHUB_EVENT_PATH/);
  assert.doesNotMatch(sonarScan, /readFileSync/);
  assert.doesNotMatch(sonarScan, /-Dsonar\.(?:login|token)=/);
  assert.match(sonarScan, /SONAR_PULLREQUEST_KEY/);
  assert.match(sonarScan, /GITHUB_HEAD_REF/);
  assert.match(sonarScan, /GITHUB_BASE_REF/);
});

test('resolves exact-SHA project version and explicit quality-gate wait mode', () => {
  assert.deepEqual(
    resolveSonarAnalysisContext({
      SONAR_PROJECT_VERSION: SHA,
      SONAR_QUALITYGATE_WAIT: 'false',
    }),
    {
      projectVersion: SHA,
      pullRequestBase: '',
      pullRequestBranch: '',
      pullRequestKey: '',
      qualityGateWait: 'false',
    }
  );
});

test('rejects non-SHA versions and invalid quality-gate wait values', () => {
  assert.throws(
    () => resolveSonarAnalysisContext({ SONAR_PROJECT_VERSION: 'latest' }),
    /exact 40-character SHA/u
  );
  assert.throws(
    () => resolveSonarAnalysisContext({ SONAR_QUALITYGATE_WAIT: 'sometimes' }),
    /true or false/u
  );
});

test('requires complete pull request context when a key is present', () => {
  assert.throws(
    () => resolveSonarAnalysisContext({ SONAR_PULLREQUEST_KEY: '42' }),
    /Missing pull request branch context/u
  );
});

test('appends version and wait properties without duplication', () => {
  assert.deepEqual(
    appendSonarAnalysisProperties(['-Dsonar.host.url=http://127.0.0.1:9000'], {
      projectVersion: SHA,
      qualityGateWait: 'false',
    }),
    [
      '-Dsonar.host.url=http://127.0.0.1:9000',
      `-Dsonar.projectVersion=${SHA}`,
      '-Dsonar.qualitygate.wait=false',
    ]
  );
  assert.deepEqual(
    appendSonarAnalysisProperties(
      [`-Dsonar.projectVersion=${SHA}`, '-Dsonar.qualitygate.wait=false'],
      { projectVersion: SHA, qualityGateWait: 'false' }
    ),
    [`-Dsonar.projectVersion=${SHA}`, '-Dsonar.qualitygate.wait=false']
  );
});
