import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORITY_BOUNDARIES,
  authenticateResolverOutput,
  resolveAtAuthorityBoundary,
} from './slice-rehearse-authority-boundary.mjs';

const rawAuthority = (overrides = {}) => ({
  lifecycle: 'no_active_slice',
  runtimeAuthorized: false,
  activeSlice: null,
  successorsBlocked: true,
  closeoutAuthorized: false,
  reason: 'deterministic_closeout_recorded',
  ...overrides,
});

test('refreshes the live resolver exactly once at an explicit authority-changing boundary', () => {
  let calls = 0;
  const result = resolveAtAuthorityBoundary({
    boundary: 'candidate_freeze',
    readLiveAuthority() {
      calls += 1;
      return authenticateResolverOutput(
        rawAuthority({
          lifecycle: 'active_implementation',
          runtimeAuthorized: true,
          activeSlice: 'HARNESS-V2-1',
          successorsBlocked: false,
          reason: 'promotion_authorized',
        })
      );
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
        readLiveAuthority: () => authenticateResolverOutput(rawAuthority()),
      }),
    /explicit authority boundary/u
  );
  assert.throws(
    () =>
      resolveAtAuthorityBoundary({
        boundary: 'pre_push',
        readLiveAuthority: () => ({ source: 'cache', result: rawAuthority() }),
      }),
    /live resolver evidence/u
  );
});

test('fails closed when the live resolver cannot provide a complete state', () => {
  assert.throws(
    () =>
      resolveAtAuthorityBoundary({
        boundary: 'post_merge',
        readLiveAuthority: () => ({
          source: 'live-resolver',
          resolverCommand: 'node scripts/lean-current-authority.mjs status',
          resultDigest: 'a'.repeat(64),
          result: { runtimeAuthorized: true },
        }),
      }),
    /complete authority state/u
  );
});

test('rejects unauthenticated or tampered resolver output', () => {
  const evidence = authenticateResolverOutput(rawAuthority());
  assert.throws(
    () =>
      resolveAtAuthorityBoundary({
        boundary: 'pre_merge',
        readLiveAuthority: () => ({ ...evidence, resultDigest: 'f'.repeat(64) }),
      }),
    /digest differs/u
  );
  assert.throws(
    () => authenticateResolverOutput({ ...rawAuthority(), reason: undefined }),
    /complete/u
  );
});
