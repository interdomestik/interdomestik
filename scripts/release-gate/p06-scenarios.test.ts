import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildP06CanonicalRouteScenarios } = require('./p06-scenarios.ts');

test('P0.6 canonical scenarios stay aligned with P0.1 role matrix', () => {
  const scenarios = buildP06CanonicalRouteScenarios();

  assert.deepEqual(
    scenarios.map(({ id, accountKey, checks }) => ({
      id,
      accountKey,
      checks: checks.map(({ route, expected }) => [route, expected]),
    })),
    [
      {
        id: 'S1',
        accountKey: 'agent',
        checks: [
          ['/agent', { agent: true }],
          ['/staff', { staff: false }],
          ['/admin', { admin: false }],
        ],
      },
      {
        id: 'S2',
        accountKey: 'staff',
        checks: [
          ['/staff', { staff: true }],
          ['/agent', { agent: false }],
          ['/admin', { admin: false }],
        ],
      },
    ]
  );
});
