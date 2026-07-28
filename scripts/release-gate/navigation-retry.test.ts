import assert from 'node:assert/strict';
import test from 'node:test';

const { gotoWithTransientRetry, isTransientNavigationError } = require('./navigation-retry.ts');

test('recognizes the Playwright navigation race observed by the staging gate', () => {
  assert.equal(
    isTransientNavigationError(
      'page.goto: Navigation to "https://staging.interdomestik.com/en/member" ' +
        'is interrupted by another navigation to ' +
        '"https://staging.interdomestik.com/en/admin/overview"'
    ),
    true
  );
  assert.equal(isTransientNavigationError('page.goto: net::ERR_ABORTED'), false);
  assert.equal(isTransientNavigationError('RBAC marker mismatch'), false);
});

test('retries an interrupted navigation without changing the requested route', async () => {
  const attempts: string[] = [];
  const waits: number[] = [];
  const requestedRoute = 'https://staging.interdomestik.com/en/member';

  const result = await gotoWithTransientRetry({
    navigate: async () => {
      attempts.push(requestedRoute);
      if (attempts.length === 1) {
        throw new Error(
          `page.goto: Navigation to "${requestedRoute}" is interrupted by another navigation to ` +
            '"https://staging.interdomestik.com/en/admin/overview"'
        );
      }
      return 'settled';
    },
    sleepFn: async delayMs => {
      waits.push(delayMs);
    },
  });

  assert.equal(result, 'settled');
  assert.deepEqual(attempts, [requestedRoute, requestedRoute]);
  assert.deepEqual(waits, [1_000]);
});

test('keeps navigation retries bounded and preserves the terminal error', async () => {
  const failure = new Error(
    'page.goto: Navigation to "/en/member" is interrupted by another navigation to ' +
      '"/en/admin/overview"'
  );
  let attempts = 0;

  await assert.rejects(
    gotoWithTransientRetry({
      navigate: async () => {
        attempts += 1;
        throw failure;
      },
      maxAttempts: 3,
      sleepFn: async () => {},
    }),
    error => error === failure
  );
  assert.equal(attempts, 3);
});

test('does not retry non-transient application failures', async () => {
  let attempts = 0;

  await assert.rejects(
    gotoWithTransientRetry({
      navigate: async () => {
        attempts += 1;
        throw new Error('RBAC marker mismatch');
      },
      sleepFn: async () => {},
    }),
    /RBAC marker mismatch/
  );
  assert.equal(attempts, 1);
});
