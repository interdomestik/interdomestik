import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORITY_BOUNDARIES,
  resolveAtAuthorityBoundary,
} from './slice-rehearse-authority-boundary.mjs';

test('refreshes the live resolver exactly once at an explicit authority-changing boundary', () => {
  let calls = 0;
  const result = resolveAtAuthorityBoundary({
    boundary: 'candidate_freeze',
    readLiveAuthority() {
      calls += 1;
      return { runtimeAuthorized: true, activeSlice: 'HARNESS-V2-1' };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.boundary, 'candidate_freeze');
  assert.equal(result.source, 'live-resolver');
  assert.equal(result.authority.runtimeAuthorized, true);
  assert.ok(AUTHORITY_BOUNDARIES.includes('candidate_freeze'));
});

test('rejects advisory or cached authority and undeclared refresh points', () => {
  assert.throws(
    () =>
      resolveAtAuthorityBoundary({
        boundary: 'during_implementation',
        readLiveAuthority: () => ({ runtimeAuthorized: true }),
      }),
    /explicit authority boundary/u
  );
  assert.throws(
    () =>
      resolveAtAuthorityBoundary({
        boundary: 'pre_push',
        readLiveAuthority: () => ({ source: 'cache', runtimeAuthorized: true }),
      }),
    /live resolver evidence/u
  );
});

test('fails closed when the live resolver cannot provide a complete state', () => {
  assert.throws(
    () =>
      resolveAtAuthorityBoundary({
        boundary: 'post_merge',
        readLiveAuthority: () => ({ runtimeAuthorized: true }),
      }),
    /complete authority state/u
  );
});
