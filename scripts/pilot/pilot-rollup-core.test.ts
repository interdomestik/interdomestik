import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computePilotWeekRollup,
  formatRatio,
  type PilotClaimRollupRecord,
} from './pilot-rollup-core';

function createClaim(overrides: Partial<PilotClaimRollupRecord> = {}): PilotClaimRollupRecord {
  return {
    createdAt: new Date('2026-03-18T08:00:00.000Z'),
    id: 'claim-1',
    messages: [],
    stageHistory: [],
    status: 'submitted',
    tenantId: 'tenant_ks',
    ...overrides,
  };
}

test('formatRatio returns n/a for a zero denominator', () => {
  assert.equal(formatRatio(0, 0), 'n/a');
});

test('computePilotWeekRollup filters to the requested tenant and date window', () => {
  const result = computePilotWeekRollup({
    claims: [
      createClaim({ id: 'in-cohort' }),
      createClaim({ id: 'wrong-tenant', tenantId: 'tenant_mk' }),
      createClaim({ id: 'before-window', createdAt: new Date('2026-03-17T23:59:59.000Z') }),
      createClaim({ id: 'end-exclusive', createdAt: new Date('2026-03-25T00:00:00.000Z') }),
    ],
    end: new Date('2026-03-25T00:00:00.000Z'),
    start: new Date('2026-03-18T00:00:00.000Z'),
    tenantId: 'tenant_ks',
  });

  assert.equal(result.totalClaims, 1);
  assert.equal(result.submittedClaims, 1);
});

test('computePilotWeekRollup computes triage, public update, and progression numerators', () => {
  const result = computePilotWeekRollup({
    claims: [
      createClaim({
        id: 'claim-pass',
        messages: [
          {
            createdAt: new Date('2026-03-18T11:00:00.000Z'),
            isInternal: false,
          },
        ],
        stageHistory: [
          {
            createdAt: new Date('2026-03-18T10:00:00.000Z'),
            toStatus: 'verification',
          },
          {
            createdAt: new Date('2026-03-19T09:00:00.000Z'),
            toStatus: 'evaluation',
          },
        ],
      }),
      createClaim({
        id: 'claim-fail',
        messages: [
          {
            createdAt: new Date('2026-03-21T14:30:00.000Z'),
            isInternal: false,
          },
        ],
        stageHistory: [
          {
            createdAt: new Date('2026-03-20T11:00:00.000Z'),
            toStatus: 'verification',
          },
        ],
      }),
    ],
    end: new Date('2026-03-25T00:00:00.000Z'),
    start: new Date('2026-03-18T00:00:00.000Z'),
    tenantId: 'tenant_ks',
  });

  assert.deepEqual(result.triage, {
    breaches: 1,
    denominator: 2,
    missingEvidence: 0,
    numerator: 1,
    ratio: '50.0%',
  });
  assert.deepEqual(result.publicUpdate, {
    breaches: 1,
    denominator: 2,
    missingEvidence: 0,
    numerator: 1,
    ratio: '50.0%',
  });
  assert.deepEqual(result.progression, {
    denominator: 2,
    missingEvidence: 0,
    numerator: 1,
    ratio: '50.0%',
  });
});

test('computePilotWeekRollup tracks missing triage and public-update evidence separately', () => {
  const result = computePilotWeekRollup({
    claims: [
      createClaim({
        id: 'missing-triage',
        messages: [
          {
            createdAt: new Date('2026-03-18T12:00:00.000Z'),
            isInternal: false,
          },
        ],
        stageHistory: [],
      }),
      createClaim({
        id: 'missing-update',
        messages: [],
        stageHistory: [
          {
            createdAt: new Date('2026-03-18T10:00:00.000Z'),
            toStatus: 'verification',
          },
        ],
      }),
    ],
    end: new Date('2026-03-25T00:00:00.000Z'),
    start: new Date('2026-03-18T00:00:00.000Z'),
    tenantId: 'tenant_ks',
  });

  assert.equal(result.triage.denominator, 1);
  assert.equal(result.triage.missingEvidence, 1);
  assert.equal(result.publicUpdate.denominator, 0);
  assert.equal(result.publicUpdate.missingEvidence, 2);
  assert.equal(result.progression.denominator, 2);
  assert.equal(result.progression.numerator, 1);
});

test('computePilotWeekRollup excludes draft claims from SLA and progression denominators', () => {
  const result = computePilotWeekRollup({
    claims: [
      createClaim({ id: 'draft-claim', status: 'draft' }),
      createClaim({
        id: 'submitted-claim',
        messages: [
          {
            createdAt: new Date('2026-03-18T11:00:00.000Z'),
            isInternal: false,
          },
        ],
        stageHistory: [
          {
            createdAt: new Date('2026-03-18T10:00:00.000Z'),
            toStatus: 'verification',
          },
        ],
      }),
    ],
    end: new Date('2026-03-25T00:00:00.000Z'),
    start: new Date('2026-03-18T00:00:00.000Z'),
    tenantId: 'tenant_ks',
  });

  assert.equal(result.totalClaims, 2);
  assert.equal(result.submittedClaims, 1);
  assert.equal(result.triage.denominator, 1);
  assert.equal(result.publicUpdate.denominator, 1);
  assert.equal(result.progression.denominator, 1);
});
