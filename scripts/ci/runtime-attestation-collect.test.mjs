import assert from 'node:assert/strict';
import test from 'node:test';
import { collect, exitCodeFor } from './runtime-attestation/collect.mjs';
import { readExpectedLedger } from './runtime-attestation/journal.mjs';
import { classify } from './runtime-attestation/receipt.mjs';
import { STAGING_EXPECTATION } from './runtime-attestation/staging-expectation.mjs';

const HOST = 'interdomestik-web-abc123.vercel.app';
const SHA = 'a'.repeat(40);
const DIGEST = `sha256:${'b'.repeat(64)}`;
const PASSWORD = 'observer-password-canary';
const COOKIE = 'better-auth.session_token=session-cookie-canary';
const LOGIN = 'interdomestik_runtime_rls';
const LEDGER = readExpectedLedger(process.cwd()).entries.map(e => ({
  hash: e.hash,
  createdAt: e.when,
}));

const EXPECTATION = { loginRole: LOGIN, allowedReachableRoles: [], backendMarker: 'mk-staging' };
const role = (name, extra) => ({
  name,
  rolcanlogin: false,
  rolinherit: true,
  rolsuper: false,
  rolbypassrls: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  ...extra,
});

function observation(challenge, overrides = {}) {
  return {
    challenge,
    commitSha: SHA,
    sessionUser: LOGIN,
    currentUser: LOGIN,
    configuredRole: null,
    serverVersionNum: 150008,
    login: role(LOGIN, { rolcanlogin: true }),
    reachableRoles: [],
    memberships: [],
    ownedObjectCount: 0,
    databasePrivileges: ['CONNECT'],
    roleSettings: [],
    effectiveSettings: [],
    backendMarker: 'mk-staging',
    migrationLedger: LEDGER,
    observedAt: '2026-11-05T21:00:00.000Z',
    ...overrides,
  };
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** A fake deployment: release metadata, better-auth sign-in and the observation endpoint. */
function deployment({ metadata = {}, metadataResponse, signIn = 200, respond } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.endsWith('/.well-known/interdomestik-release-attestation.json'))
      return metadataResponse
        ? metadataResponse()
        : json(200, {
            environment: 'staging',
            commitSha: SHA,
            sourceImageDigest: DIGEST,
            vercelOutputDigest: DIGEST,
            ...metadata,
          });
    if (href.endsWith('/api/auth/sign-in/email'))
      return json(
        signIn,
        {},
        signIn === 200 ? { 'set-cookie': `${COOKIE}; Path=/; HttpOnly; Secure` } : {}
      );
    if (href.endsWith('/api/health')) {
      const { challenge } = JSON.parse(init.body);
      return respond ? respond(challenge, init) : json(200, observation(challenge));
    }
    throw new Error(`unexpected ${href}`);
  };
  return { fetchImpl, calls };
}

const run = (fake, overrides = {}) =>
  collect({
    root: process.cwd(),
    expectation: EXPECTATION,
    mode: 'observe',
    hostname: HOST,
    canonicalHost: 'staging.interdomestik.com',
    expectedSha: SHA,
    bypassSecret: 'bypass-canary',
    credentials: { email: 'observer@example.test', password: PASSWORD },
    fetchImpl: fake.fetchImpl,
    runId: '1',
    runAttempt: '1',
    ...overrides,
  });

test('U2-e collector: a verified observation of the intended LOGIN is PASS', async () => {
  const fake = deployment();
  const receipt = await run(fake);
  assert.equal(receipt.status, 'PASS', JSON.stringify(receipt.failureCodes));
  assert.equal(receipt.deployment.commitSha, SHA);
  assert.equal(receipt.observed.ledgerCount, LEDGER.length);
  const health = fake.calls.find(call => call.href.endsWith('/api/health'));
  assert.equal(health.init.headers.cookie, COOKIE.split(';')[0]);
  assert.equal(health.init.redirect, 'manual');
  assert.ok(fake.calls.every(call => new URL(call.href).host === HOST));
});

test('U2-e collector: credentials, cookies and secrets never reach the receipt', async () => {
  const text = JSON.stringify(await run(deployment()));
  for (const canary of [
    PASSWORD,
    'session-cookie-canary',
    'bypass-canary',
    'observer@example.test',
    'mk-staging',
  ])
    assert.ok(!text.includes(canary), canary);
});

test('U2-e collector: missing owner inputs are INPUTS_NOT_PROVISIONED, never PASS', async () => {
  const noAccount = await run(deployment(), { credentials: { email: '', password: '' } });
  assert.deepEqual(
    [noAccount.status, noAccount.failureCodes],
    ['INPUTS_NOT_PROVISIONED', ['OBSERVER_ACCOUNT_UNPROVISIONED']]
  );
  const unenrolled = await run(deployment(), {
    // The reviewed staging expectation itself, until a marker is enrolled.
    expectation: STAGING_EXPECTATION,
  });
  assert.deepEqual(
    [unenrolled.status, unenrolled.failureCodes],
    ['INPUTS_NOT_PROVISIONED', ['BACKEND_MARKER_UNAVAILABLE']]
  );
  const noLedger = await run(
    deployment({
      respond: c => json(200, observation(c, { migrationLedger: null, backendMarker: null })),
    })
  );
  assert.equal(noLedger.status, 'INPUTS_NOT_PROVISIONED');
  // An input gap never hides real drift.
  const drift = await run(
    deployment({
      respond: c => json(200, observation(c, { migrationLedger: null, sessionUser: 'postgres' })),
    })
  );
  assert.equal(drift.status, 'FAIL');
});

test('U2-e collector: deployment, sign-in and observation failures are FAIL with fixed codes', async () => {
  const cases = [
    [deployment({ metadata: { commitSha: 'c'.repeat(40) } }), 'DEPLOYMENT_COMMIT_MISMATCH'],
    [deployment({ metadata: { environment: 'production' } }), 'DEPLOYMENT_METADATA_INVALID'],
    [deployment({ signIn: 401 }), 'SIGN_IN_FAILED'],
    [deployment({ respond: () => json(403, { error: 'FORBIDDEN' }) }), 'OBSERVATION_FORBIDDEN'],
    [
      deployment({ respond: () => json(500, { error: 'password=hunter2' }) }),
      'OBSERVATION_REFUSED',
    ],
    [
      deployment({ respond: () => json(302, {}, { location: 'https://evil.example/' }) }),
      'OBSERVATION_REFUSED',
    ],
    [deployment({ respond: c => json(200, observation(`${c}x`)) }), 'CHALLENGE_MISMATCH'],
    [
      deployment({ respond: c => json(200, observation(c, { commitSha: 'd'.repeat(40) })) }),
      'COMMIT_MISMATCH',
    ],
    [
      deployment({ respond: () => new Response('not json', { status: 200 }) }),
      'MALFORMED_OBSERVATION',
    ],
  ];
  for (const [fake, code] of cases) {
    const receipt = await run(fake);
    assert.equal(receipt.status, 'FAIL', code);
    assert.ok(receipt.failureCodes.includes(code), `${code}: ${receipt.failureCodes}`);
  }
  assert.ok(!JSON.stringify(await run(cases[4][0])).includes('hunter2'));
});

test('U2-e collector: invalid hosts, commits and modes are refused before any request', async () => {
  const fake = deployment();
  for (const hostname of ['staging.interdomestik.com', 'evil.example', `${HOST}.evil.example`]) {
    const receipt = await run(fake, { hostname });
    assert.deepEqual(receipt.failureCodes, ['COLLECTOR_INPUT_INVALID'], hostname);
  }
  assert.deepEqual((await run(fake, { expectedSha: 'HEAD' })).failureCodes, [
    'COLLECTOR_INPUT_INVALID',
  ]);
  assert.equal(fake.calls.length, 0);
  await assert.rejects(run(fake, { mode: 'report-only' }), /unknown runtime attestation mode/u);
});

test('U2-e collector: a stalled or oversized answer still yields a receipt', async () => {
  const stalled = deployment({
    respond: (_c, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(new Error('aborted')))
      ),
  });
  const started = Date.now();
  const late = await run(stalled, { requestTimeoutMs: 50 });
  assert.deepEqual(late.failureCodes, ['OBSERVATION_TRANSPORT']);
  assert.ok(Date.now() - started < 2000);
  const huge = await run(
    deployment({ respond: c => json(200, { ...observation(c), pad: 'x'.repeat(300 * 1024) }) })
  );
  assert.deepEqual(huge.failureCodes, ['OBSERVATION_TRANSPORT']);
});

/** A response whose headers arrive but whose body never finishes. */
const stalledBody = () =>
  new Response(
    new ReadableStream({ start: controller => controller.enqueue(new Uint8Array([123])) }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  );

test('U2-e collector: stalled or oversized metadata and bodies end the collection in time', async () => {
  const signInCalls = fake => fake.calls.filter(call => call.href.endsWith('/sign-in/email'));
  const cases = [
    ['stalled metadata body', { metadataResponse: stalledBody }, 'DEPLOYMENT_METADATA_UNAVAILABLE'],
    [
      'oversized metadata',
      { metadata: { pad: 'x'.repeat(300 * 1024) } },
      'DEPLOYMENT_METADATA_UNAVAILABLE',
    ],
    ['stalled observation body', { respond: stalledBody }, 'OBSERVATION_TRANSPORT'],
  ];
  for (const [name, options, code] of cases) {
    const fake = deployment(options);
    const started = Date.now();
    const receipt = await run(fake, { requestTimeoutMs: 50 });
    assert.deepEqual(receipt.failureCodes, [code], name);
    assert.ok(Date.now() - started < 2000, name);
    if (code.startsWith('DEPLOYMENT')) assert.equal(signInCalls(fake).length, 0, name);
  }
});

test('U2-e exit: observe records any status; enforce passes only PASS', () => {
  for (const status of ['PASS', 'FAIL', 'INPUTS_NOT_PROVISIONED'])
    assert.equal(exitCodeFor({ mode: 'observe', status }), 0, status);
  assert.equal(exitCodeFor({ mode: 'enforce', status: 'PASS' }), 0);
  assert.equal(exitCodeFor({ mode: 'enforce', status: 'FAIL' }), 1);
  assert.equal(exitCodeFor({ mode: 'enforce', status: 'INPUTS_NOT_PROVISIONED' }), 1);
});

test('U2-e expectation: the restricted runtime LOGIN, no reachable roles, frozen', () => {
  assert.equal(STAGING_EXPECTATION.loginRole, LOGIN);
  assert.deepEqual(STAGING_EXPECTATION.allowedReachableRoles, []);
  assert.ok(Object.isFrozen(STAGING_EXPECTATION));
  assert.ok(Object.isFrozen(STAGING_EXPECTATION.allowedReachableRoles));
});

test('U2-e receipt: only an empty code list is PASS', () => {
  assert.equal(classify([]), 'PASS');
  assert.equal(classify(['LEDGER_UNREADABLE']), 'INPUTS_NOT_PROVISIONED');
  assert.equal(classify(['LEDGER_UNREADABLE', 'OWNS_OBJECTS']), 'FAIL');
});
