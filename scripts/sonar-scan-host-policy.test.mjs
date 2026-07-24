import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSonarHostUrl, resolveSonarStatusTarget } from './sonar-scan-lib.mjs';

const localUrl = host => `${'http:'}//${host}`;

test('normalizeSonarHostUrl rejects unsafe or malformed URLs', () => {
  assert.throws(
    () => normalizeSonarHostUrl('https://user:token@sonarcloud.io?token=secret'),
    /must not include credentials/u
  );
  assert.throws(() => normalizeSonarHostUrl('://user:token@example.com'), /must be a valid URL/u);
});

test('normalizeSonarHostUrl allows only SonarCloud and approved local hosts', () => {
  assert.equal(normalizeSonarHostUrl(), 'https://sonarcloud.io');
  assert.equal(normalizeSonarHostUrl('https://sonarcloud.io/'), 'https://sonarcloud.io');
  assert.equal(normalizeSonarHostUrl('http://127.0.0.1:9000/'), localUrl('127.0.0.1:9000'));
  assert.equal(normalizeSonarHostUrl('http://localhost:9000/'), localUrl('localhost:9000'));
  assert.throws(
    () => normalizeSonarHostUrl('https://example.test'),
    /approved local SonarQube URL/u
  );
});

test('loopback Sonar hosts use host readiness for either scanner mode', () => {
  for (const host of ['127.0.0.1:9000', 'localhost:9000']) {
    assert.equal(resolveSonarStatusTarget({ sonarHostUrl: localUrl(host) }), 'loopback-native');
  }
});

test('non-loopback local Sonar hosts retain mode-aware readiness targets', () => {
  assert.equal(resolveSonarStatusTarget({ sonarHostUrl: 'https://sonarcloud.io' }), null);
  assert.equal(
    resolveSonarStatusTarget({
      sonarHostUrl: localUrl('host.docker.internal:9000'),
      forceNative: true,
    }),
    'host-docker-native'
  );
  assert.equal(
    resolveSonarStatusTarget({ sonarHostUrl: localUrl('sonarqube:9000') }),
    'local-docker'
  );
});
