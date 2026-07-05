import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { collectFreshUntilStable } = require('./p01-rbac-stabilization.ts');

const retryableAttempt = {
  driftRecorded: false,
  failures: [
    'P0.1_RBAC_CANONICAL_MARKER_MISSING account=staff route=/en/staff expected=staff visible={"member":false,"agent":false,"staff":false,"admin":false,"notFound":true,"rolesTable":false}',
  ],
  positiveCanonicalNotFound: true,
};

for (const intervalMs of [0, -1, Number.NaN]) {
  test(`collectFreshUntilStable does not poll with invalid interval ${String(intervalMs)}`, async () => {
    let collectCalls = 0;
    let sleepCalls = 0;

    const result = await collectFreshUntilStable({
      account: 'staff',
      browser: {},
      collectAttempt: async () => {
        collectCalls += 1;
        return retryableAttempt;
      },
      intervalMs,
      loginWithRunContext: async () => {},
      runCtx: {},
      sleepFn: async () => {
        sleepCalls += 1;
      },
      startingAttempt: retryableAttempt,
      windowMs: 1000,
    });

    assert.equal(result.attempt, retryableAttempt);
    assert.equal(result.probes, 0);
    assert.equal(collectCalls, 0);
    assert.equal(sleepCalls, 0);
  });
}
