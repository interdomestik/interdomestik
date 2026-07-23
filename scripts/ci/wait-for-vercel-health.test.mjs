import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import timersPromises from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';

import { waitForVercelHealth } from './wait-for-vercel-health.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./wait-for-vercel-health.mjs', import.meta.url));
const healthUrlCanary =
  'https://user-CANARY:password-CANARY@staging.interdomestik.com/api/health' +
  '?token=QUERY-CANARY#FRAGMENT-CANARY';
const rawErrorMessage =
  'provider=PROVIDER_CANARY token=TOKEN_CANARY password=PASSWORD_CANARY ' +
  'databaseUrl=postgresql://POSTGRES_URL_CANARY responseBody=RESPONSE_BODY_CANARY';
const errorCanaries = rawErrorMessage
  .match(/[A-Z_]+CANARY/gu)
  .concat('CAUSE_CANARY', 'PAYLOAD_CANARY');
const cliPreload = `
  import childProcess from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
  import { promisify } from 'node:util';
  const body = '{"body":"CLI-RESPONSE-BODY-CANARY"}\\n__INTERDOMESTIK_HEALTH_STATUS__:200';
  const error = Object.assign(new Error(${JSON.stringify(rawErrorMessage)}),
    { cause: new Error('CAUSE_CANARY'), payload: { responseBody: 'PAYLOAD_CANARY' } });
  const succeeds = process.env.CLI_STUB_OUTCOME === 'success';
  const stub = (_file, _args, _options, callback) => succeeds
    ? callback(null, body, '') : callback(error, '', '');
  stub[promisify.custom] = async () => {
    if (!succeeds) throw error; return { stdout: body, stderr: '' };
  };
  childProcess.execFile = stub; syncBuiltinESMExports();
`;
function assertCanaryFree(value, canaries) {
  for (const canary of canaries) assert.doesNotMatch(value, new RegExp(canary, 'u'));
}
async function runCli(outcome) {
  const args = [
    '--import',
    `data:text/javascript,${encodeURIComponent(cliPreload)}`,
    scriptPath,
    'https://staging.interdomestik.com/api/health',
  ];
  const env = {
    ...process.env,
    VERCEL_HEALTH_MAX_ATTEMPTS: '1',
    VERCEL_HEALTH_SLEEP_SECONDS: '1',
    CLI_STUB_OUTCOME: outcome,
  };
  try {
    const result = await execFileAsync(process.execPath, args, { env });
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}
test('waitForVercelHealth preserves retry order and the successful body', async () => {
  const events = [];
  const bodyCanary = '{"body":"IMPORTED-BODY-CANARY"}';
  const body = await waitForVercelHealth({
    healthUrl: healthUrlCanary,
    expectedCommitSha: 'abc123',
    attempts: 2,
    sleepMs: 0,
    log: message => events.push(`log:${message}`),
    fetchImpl: async params => {
      events.push(`fetch:${events.filter(event => event.startsWith('fetch:')).length + 1}`);
      assert.equal(params.expectedCommitSha, 'abc123');
      assert.equal(params.healthUrl, healthUrlCanary);
      if (events.includes('fetch:1') && !events.includes('fetch:2')) throw new Error('not ready');
      return bodyCanary;
    },
  });
  assert.equal(body, bodyCanary);
  assert.deepEqual(events, [
    'log:[vercel-health] attempt 1/2',
    'fetch:1',
    'log:[vercel-health] result=health_check_failed',
    'log:[vercel-health] attempt 2/2',
    'fetch:2',
    'log:[vercel-health] result=success',
  ]);
  assertCanaryFree(events.join('\n'), [
    'user-CANARY',
    'password-CANARY',
    'QUERY-CANARY',
    'FRAGMENT-CANARY',
    'IMPORTED-BODY-CANARY',
  ]);
});
test('waitForVercelHealth sleeps exactly between failed attempts and sanitizes errors', async () => {
  const events = [];
  const providerError = Object.assign(new Error(rawErrorMessage), {
    cause: new Error('CAUSE_CANARY'),
    payload: { responseBody: 'PAYLOAD_CANARY' },
  });
  const originalSleep = timersPromises.setTimeout;
  timersPromises.setTimeout = async ms => events.push(`sleep:${ms}`);
  syncBuiltinESMExports();
  let terminalError;
  try {
    await waitForVercelHealth({
      healthUrl: 'https://staging.interdomestik.com/api/health',
      attempts: 2,
      sleepMs: 17,
      log: message => events.push(`log:${message}`),
      fetchImpl: async () => {
        events.push(`fetch:${events.filter(event => event.startsWith('fetch:')).length + 1}`);
        throw providerError;
      },
    });
  } catch (error) {
    terminalError = error;
  } finally {
    timersPromises.setTimeout = originalSleep;
    syncBuiltinESMExports();
  }
  assert.deepEqual(events, [
    'log:[vercel-health] attempt 1/2',
    'fetch:1',
    'log:[vercel-health] result=health_check_failed',
    'sleep:17',
    'log:[vercel-health] attempt 2/2',
    'fetch:2',
    'log:[vercel-health] result=health_check_failed',
  ]);
  assert.equal(terminalError?.message, 'Vercel health check failed');
  assert.equal(terminalError?.cause, undefined);
  assert.equal(terminalError?.payload, undefined);
  assert.notEqual(terminalError, providerError);
  assertCanaryFree(
    [terminalError?.message, terminalError?.stack, JSON.stringify(terminalError)].join('\n'),
    errorCanaries
  );
  assertCanaryFree(events.join('\n'), errorCanaries);
});
test('CLI success output never includes the successful response body', async () => {
  const result = await runCli('success');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assertCanaryFree(result.stdout, ['CLI-RESPONSE-BODY-CANARY']);
});
test('CLI failure output is deterministic and excludes nested diagnostics', async () => {
  const result = await runCli('failure');
  assert.notEqual(result.code, 0);
  assert.equal(result.stderr, 'Vercel health check failed\n');
  assertCanaryFree(`${result.stdout}\n${result.stderr}`, errorCanaries);
});
