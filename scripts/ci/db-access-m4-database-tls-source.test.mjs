import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { deriveM4DatabaseTlsSource } from './db-access-m4-database-tls-source.mjs';
import { deriveM4PrivateRuntimeSource, FILES } from './db-access-m4-runtime-source.mjs';
import { deriveM4AssignmentNotification } from './db-access-m4-notification-source.mjs';
import {
  read,
  postureSource,
  bootstrapSource,
  notificationRuntimeSource,
  notifierSource,
  runtime,
  notification,
  inputs,
  once,
  refusal,
} from './db-access-m4-database-tls-test.fixture.mjs';
test('exact sealed source helper and three purpose bindings derive data-only facts', () => {
  const a = deriveM4DatabaseTlsSource(inputs.bootstrap),
    b = deriveM4DatabaseTlsSource(inputs.notification);
  assert.deepEqual(
    a.facts.pools.map(p => [p.purpose, p.target]),
    [
      ['identity', 'identityTarget'],
      ['data', 'dataTarget'],
    ]
  );
  assert.deepEqual(
    b.facts.pools.map(p => [p.purpose, p.target]),
    [['pool', 'notificationTarget']]
  );
  for (const result of [
    a,
    b,
    deriveM4PrivateRuntimeSource(runtime),
    deriveM4AssignmentNotification(notification),
  ]) {
    assert.equal(result.sourcePremiseOnly, true);
    for (const key of [
      'runtimeAdmission',
      'nativeAdmission',
      'allExecutableContextsQualified',
      'productionEventAuthenticated',
    ])
      assert.equal(result[key], false);
    assert.ok(Object.isFrozen(result.facts));
  }
});
test('formatting cannot change the finite helper/pool semantic law', () => {
  const print = text =>
    ts
      .createPrinter()
      .printFile(
        ts.createSourceFile('source.ts', '// comment\n' + text, ts.ScriptTarget.ES2022, true)
      );
  for (const role of ['bootstrap', 'notification']) {
    const original = deriveM4DatabaseTlsSource(inputs[role]);
    const printed = deriveM4DatabaseTlsSource({
      ...inputs[role],
      postureSource: print(postureSource),
      poolSource: print(inputs[role].poolSource),
    });
    assert.deepEqual(printed.facts, original.facts);
  }
});
for (const role of ['bootstrap', 'notification']) {
  refusal(
    'false rejectUnauthorized in ' + role,
    role,
    'postureSource',
    'rejectUnauthorized: true',
    'rejectUnauthorized: false'
  );
  refusal(
    'default driver hostname in ' + role,
    role,
    'postureSource',
    'return checkServerIdentity(expectedHostname, certificate);',
    'return checkServerIdentity(_driverHostname, certificate);'
  );
  refusal(
    'discarded validation error in ' + role,
    role,
    'postureSource',
    'return checkServerIdentity(expectedHostname, certificate);',
    'checkServerIdentity(expectedHostname, certificate); return undefined;'
  );
  refusal(
    'caller callback in ' + role,
    role,
    'postureSource',
    'captureM4DatabaseTls(target: M4PoolTarget)',
    'captureM4DatabaseTls(target: M4PoolTarget, callback: (c: PeerCertificate) => undefined)'
  );
  refusal(
    'mutable host in ' + role,
    role,
    'postureSource',
    'const expectedHostname =',
    'let expectedHostname ='
  );
  refusal(
    'late mutable target URL read in ' + role,
    role,
    'postureSource',
    'return checkServerIdentity(expectedHostname, certificate);',
    'return checkServerIdentity(new URL(target.url).hostname, certificate);'
  );
  refusal(
    'unfrozen options in ' + role,
    role,
    'postureSource',
    'return Object.freeze({\n    rejectUnauthorized: true,',
    'return ({\n    rejectUnauthorized: true,'
  );
  refusal(
    'rebound Node TLS import in ' + role,
    role,
    'postureSource',
    "import { checkServerIdentity, type PeerCertificate } from 'node:tls';",
    "import { checkServerIdentity as alternateChecker, type PeerCertificate } from 'node:tls';"
  );
  refusal(
    'foreign Node TLS module in ' + role,
    role,
    'postureSource',
    "'node:tls'",
    "'foreign-tls'"
  );
  refusal(
    'module-level freeze mutation in ' + role,
    role,
    'postureSource',
    "import type postgres from 'postgres';",
    "import type postgres from 'postgres'; Object.freeze = value => value;"
  );
  refusal(
    'module-level URL replacement in ' + role,
    role,
    'postureSource',
    "import type postgres from 'postgres';",
    "import type postgres from 'postgres'; URL = globalThis.URL;"
  );
  refusal(
    'shadowed standard checker in ' + role,
    role,
    'postureSource',
    'export function captureM4DatabaseTls',
    'const checkServerIdentity = () => undefined;\nexport function captureM4DatabaseTls'
  );
  refusal(
    'shadowed URL intrinsic in ' + role,
    role,
    'postureSource',
    'export function captureM4DatabaseTls',
    'const URL = globalThis.URL;\nexport function captureM4DatabaseTls'
  );
  refusal(
    'shadowed freeze intrinsic in ' + role,
    role,
    'postureSource',
    'export function captureM4DatabaseTls',
    'const Object = globalThis.Object;\nexport function captureM4DatabaseTls'
  );
  refusal(
    'rebound imported helper in ' + role,
    role,
    'poolSource',
    "import postgres from 'postgres';",
    "import postgres from 'postgres';\nconst captureM4DatabaseTls = () => ({ rejectUnauthorized: false });"
  );
  refusal(
    'foreign posture helper source in ' + role,
    role,
    'poolSource',
    "'./m4-pool-posture'",
    "'./foreign-pool-posture'"
  );
}
refusal(
  'identity TLS uses data target',
  'bootstrap',
  'poolSource',
  'captureM4DatabaseTls(identityTarget)',
  'captureM4DatabaseTls(dataTarget)'
);
refusal(
  'data TLS uses identity target',
  'bootstrap',
  'poolSource',
  'captureM4DatabaseTls(dataTarget)',
  'captureM4DatabaseTls(identityTarget)'
);
refusal(
  'notification TLS uses another purpose target',
  'notification',
  'poolSource',
  'captureM4DatabaseTls(notificationTarget)',
  'captureM4DatabaseTls(identityTarget)'
);
refusal(
  'identity URL uses another purpose target',
  'bootstrap',
  'poolSource',
  'identity = postgres(identityTarget.url',
  'identity = postgres(dataTarget.url'
);
refusal(
  'legacy bare TLS object in identity pool',
  'bootstrap',
  'poolSource',
  'captureM4DatabaseTls(identityTarget)',
  '({ rejectUnauthorized: true })'
);
refusal(
  'legacy bare TLS object in notification pool',
  'notification',
  'poolSource',
  'captureM4DatabaseTls(notificationTarget)',
  '({ rejectUnauthorized: true })'
);
refusal(
  'callback override after helper spread',
  'bootstrap',
  'poolSource',
  'captureM4DatabaseTls(identityTarget)',
  '({ ...captureM4DatabaseTls(identityTarget), checkServerIdentity: () => undefined })'
);
refusal(
  'caller option spread at pool level',
  'notification',
  'poolSource',
  'pool = postgres(notificationTarget.url, {',
  'pool = postgres(notificationTarget.url, { ...callerOptions,'
);
test('missing or swapped posture source is refused before a surrounding derivation can accept', () => {
  for (const role of ['bootstrap', 'notification']) {
    assert.throws(
      () => deriveM4DatabaseTlsSource({ ...inputs[role], postureSource: undefined }),
      /source rejected|text required/
    );
    assert.throws(
      () =>
        deriveM4DatabaseTlsSource({ ...inputs[role], postureSource: notificationRuntimeSource }),
      /source rejected/
    );
  }
  const missing = { ...notification };
  delete missing.postureSource;
  assert.throws(() => deriveM4AssignmentNotification(missing), /source rejected|text required/);
});
test('URL input grammar remains the identical predecessor restriction, including IPv6 exclusion', () => {
  assert.ok(postureSource.includes('!/^[a-z0-9][a-z0-9.-]*$/u.test(host)'));
  const result = deriveM4PrivateRuntimeSource(runtime);
  assert.equal(result.namedOrderedFacts.posture.length, 8);
  assert.equal(result.sourceNodes.length, 58);
  assert.equal(deriveM4AssignmentNotification(notification).sourceNodes.length, 46);
});
