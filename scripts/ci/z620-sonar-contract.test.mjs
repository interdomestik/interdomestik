import assert from 'node:assert/strict';
import test from 'node:test';
import { qualityGateDecision, sonarConfiguration } from './z620-sonar-lib.mjs';

test('missing Sonar credentials are explicitly not configured', () => {
  assert.deepEqual(sonarConfiguration({}), {
    status: 'not_configured',
    missing: ['SONAR_TOKEN', 'SONAR_HOST_URL', 'SONAR_PROJECT_KEY'],
    host: '',
    project: '',
  });
});

test('configured state never returns the token', () => {
  const configuration = sonarConfiguration({
    SONAR_TOKEN: 'do-not-expose',
    SONAR_HOST_URL: 'http://127.0.0.1:9000',
    SONAR_PROJECT_KEY: 'interdomestik',
  });
  assert.equal(configuration.status, 'configured');
  assert.doesNotMatch(JSON.stringify(configuration), /do-not-expose/);
});

test('synthetic quality gate proves pass and enforced failure paths', () => {
  assert.deepEqual(qualityGateDecision({ projectStatus: { status: 'OK' } }), {
    status: 'pass',
    qualityGate: 'OK',
    exitCode: 0,
  });
  assert.deepEqual(qualityGateDecision({ projectStatus: { status: 'ERROR' } }), {
    status: 'fail',
    qualityGate: 'ERROR',
    exitCode: 4,
  });
});
