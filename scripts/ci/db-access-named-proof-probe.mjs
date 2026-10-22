import assert from 'node:assert/strict';
import test from 'node:test';
import { namedProofLoader } from './db-access-named-proof-loader.mjs';
import { runNamedLiveProof } from './db-access-named-proof-live.mjs';
const instrumentation = 'apps/web/src/instrumentation.ts';
const observation = 'apps/web/src/lib/observability/database-readiness.ts';
const env = { NEXT_RUNTIME: 'nodejs', INTERDOMESTIK_BUILT_CSP_NONCE_MODE: 'off' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const readyProvider = ready => ({
  assertRlsConnectionRoleReady: ready,
  getDatabaseReadinessSnapshot: () => ({ phase: 'ready' }),
});

test('named startup: handlers wait for successful readiness', async () => {
  let resolve;
  const pending = new Promise(done => {
    resolve = done;
  });
  const loader = namedProofLoader({ provider: readyProvider(() => pending), environment: env });
  const { register } = await loader.import(instrumentation);
  const registered = register();
  await tick();
  assert.equal(loader.events.filter(event => event[0] === 'handler').length, 0);
  resolve();
  await registered;
  assert.equal(loader.events.filter(event => event[0] === 'handler').length, 2);
});
test('named startup: readiness failure rejects before installing handlers', async () => {
  const failure = new Error('unsafe readiness');
  const loader = namedProofLoader({
    provider: readyProvider(() => Promise.reject(failure)),
    environment: env,
  });
  const { register } = await loader.import(instrumentation);
  await assert.rejects(register, error => error === failure);
  assert.equal(loader.events.filter(event => event[0] === 'handler').length, 0);
});
test('named startup: mode mismatch fails before DB, edge never acquires DB', async () => {
  let calls = 0;
  const provider = readyProvider(async () => {
    calls++;
  });
  const loader = namedProofLoader({ provider, environment: { ...env, CSP_NONCE_MODE: 'report' } });
  await assert.rejects((await loader.import(instrumentation)).register, /does not match/);
  assert.equal(calls, 0);
  assert.equal(loader.events.find(event => event[0] === 'exit')?.[1], 1);
  const edge = namedProofLoader({ provider, environment: { ...env, NEXT_RUNTIME: 'edge' } });
  await (await edge.import(instrumentation)).register();
  await tick();
  assert.equal(calls, 0);
  assert.equal(edge.events.filter(event => event[0] === 'handler').length, 0);
});
test('named telemetry: fixed finalized fields only, never credentials or pending ready', async () => {
  const events = [];
  const loader = namedProofLoader({
    sentry: {
      addBreadcrumb: value => events.push(value),
      captureMessage: (...args) => events.push(args),
    },
  });
  const { reportDatabaseReadiness } = await loader.import(observation);
  for (const phase of ['idle', 'pending']) await reportDatabaseReadiness({ phase });
  assert.equal(events.length, 0);
  await reportDatabaseReadiness({
    phase: 'failed',
    reason: 'query_failed',
    checkedRole: 'connection',
    timedOut: true,
    password: 'SECRET_PASSWORD',
    error: new Error('SECRET_SQL'),
    url: 'SECRET_URL',
  });
  assert.match(JSON.stringify(events), /query_failed/);
  assert.doesNotMatch(JSON.stringify(events), /SECRET_/);
});
test('named telemetry: synchronous and asynchronous sink failures do not change readiness', async () => {
  for (const asynchronous of [false, true]) {
    const loader = namedProofLoader({
      sentry: {
        addBreadcrumb() {
          if (!asynchronous) throw new Error('sink');
        },
        captureMessage: () => Promise.reject(new Error('sink')),
      },
    });
    await (await loader.import(observation)).reportDatabaseReadiness({ phase: 'ready' });
    assert.equal(loader.events.filter(event => event[0] === 'warn').length, 1);
  }
});
test('named health: query waits for readiness, refusal executes no query', async () => {
  for (const success of [false, true]) {
    let settle,
      queries = 0;
    const pending = new Promise((resolve, reject) => {
      settle = () => (success ? resolve() : reject(new Error('unsafe')));
    });
    const provider = {
      ...readyProvider(() => pending),
      db: {
        select() {
          queries++;
          return {
            from: () => ({
              limit: async count => {
                assert.equal(count, 1);
                return [];
              },
            }),
          };
        },
      },
    };
    const loader = namedProofLoader({
      provider,
      ports: { '@interdomestik/database/schema/auth': { user: { id: 'id' } } },
    });
    const health = (
      await loader.import('apps/web/src/features/health/health.service.ts')
    ).performHealthCheck();
    await tick();
    assert.equal(queries, 0);
    settle();
    assert.equal((await health).services.database.status, success ? 'healthy' : 'unhealthy');
    assert.equal(queries, success ? 1 : 0);
  }
});
test('named Sentry privacy: transaction is scrubbed event data, no DB capability', async () => {
  const loader = namedProofLoader();
  const { scrubSentryEvent } = await loader.import(
    'apps/web/src/lib/observability/sentry-privacy.ts'
  );
  const result = scrubSentryEvent({
    type: 'transaction',
    transaction: '/sq/member?token=SECRET_TOKEN',
    user: { id: 'SECRET_USER' },
    extra: { password: 'SECRET_PASSWORD' },
    request: { url: 'https://example.invalid/sq/member?token=SECRET_TOKEN' },
  });
  assert.ok(result);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_/);
  assert.equal(typeof result.transaction, 'string');
});
test(
  'named real PG16: restricted liveness, startup refusal, administrative provisioning and rollback',
  runNamedLiveProof
);
