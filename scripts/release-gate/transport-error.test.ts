import assert from 'node:assert/strict';
import test from 'node:test';

const {
  compactSanitizedMessage,
  describeTransportError,
  describeUnclassifiedError,
  hostCategory,
} = require('./transport-error.ts');

function fetchFailure(code, hostname = 'staging.interdomestik.com') {
  const cause = Object.assign(new Error(`transport ${code} ${hostname}?token=do-not-log`), {
    code,
    hostname,
    syscall: code.startsWith('EA') || code === 'ENOTFOUND' ? 'getaddrinfo' : 'connect',
  });
  return new TypeError('fetch failed', { cause });
}

test('describes a nested DNS cause without logging the hostname or secret-bearing URL', () => {
  const failure = describeTransportError(fetchFailure('EAI_AGAIN'));

  assert.deepEqual(failure, {
    code: 'EAI_AGAIN',
    phase: 'dns',
    hostCategory: 'canonical',
    retryable: true,
    summary: 'transport phase=dns code=EAI_AGAIN host=canonical retryable=true',
  });
  assert.doesNotMatch(failure.summary, /interdomestik|do-not-log|token/iu);
});

test('categorizes trusted host families without returning their raw values', () => {
  assert.equal(hostCategory('staging.interdomestik.com'), 'canonical');
  assert.equal(hostCategory('candidate.vercel.app'), 'deployment');
  assert.equal(hostCategory('127.0.0.1'), 'loopback');
  assert.equal(hostCategory('example.net'), 'external');
});

test('captures TLS cause but does not mark certificate failures retryable', () => {
  const failure = describeTransportError(
    fetchFailure('ERR_TLS_CERT_ALTNAME_INVALID', 'staging.interdomestik.com')
  );

  assert.equal(failure.phase, 'tls');
  assert.equal(failure.hostCategory, 'canonical');
  assert.equal(failure.retryable, false);
});

test('does not classify a generic fetch wrapper or application failure as transport', () => {
  assert.equal(describeTransportError(new TypeError('fetch failed')), null);
  assert.equal(
    describeTransportError(Object.assign(new Error('denied'), { code: 'AUTH_DENIED' })),
    null
  );
});

test('redacts URLs and credential-like query values from unclassified errors', () => {
  const error = new Error(
    'request failed https://example.net/path?token=do-not-log password=also-secret Bearer jwt-secret'
  );
  const summary = describeUnclassifiedError(error);

  assert.doesNotMatch(summary, /example\.net|do-not-log|also-secret|jwt-secret/iu);
  assert.match(summary, /\[url\]/u);
  assert.equal(compactSanitizedMessage('token=secret'), 'token=[redacted]');
  assert.equal(
    compactSanitizedMessage('Authorization: Bearer header-secret'),
    'Authorization: [redacted]'
  );
});
