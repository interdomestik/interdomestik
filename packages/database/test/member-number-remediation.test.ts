import assert from 'node:assert/strict';
import test from 'node:test';

import { auditMemberNumbers, classifyMemberNumber } from '../src/member-number-remediation';

test('classifyMemberNumber recognizes canonical, allowed legacy, missing, and malformed values', () => {
  assert.equal(classifyMemberNumber(null), 'missing');
  assert.equal(classifyMemberNumber(undefined), 'missing');
  assert.equal(classifyMemberNumber('MEM-2026-000001'), 'canonical');
  assert.equal(classifyMemberNumber('PILOT-PR-000001'), 'legacy_allowed');
  assert.equal(classifyMemberNumber('M-123'), 'malformed');
});

test('auditMemberNumbers only marks repairable malformed values for remediation', () => {
  const audit = auditMemberNumbers([
    {
      id: 'missing-member',
      createdAt: new Date('2026-01-10T00:00:00Z'),
      memberNumber: null,
    },
    {
      id: 'canonical-member',
      createdAt: new Date('2026-01-11T00:00:00Z'),
      memberNumber: 'MEM-2026-000001',
    },
    {
      id: 'legacy-pilot-member',
      createdAt: new Date('2026-01-12T00:00:00Z'),
      memberNumber: 'PILOT-PR-000001',
    },
    {
      id: 'malformed-member',
      createdAt: new Date('2026-01-13T00:00:00Z'),
      memberNumber: 'M735291',
    },
  ]);

  assert.deepEqual(audit.counts, {
    missing: 1,
    canonical: 1,
    legacyAllowed: 1,
    malformed: 1,
  });
  assert.deepEqual(
    audit.repairable.map(row => row.id),
    ['malformed-member']
  );
  assert.deepEqual(
    audit.backfillCandidates.map(row => row.id),
    ['missing-member']
  );
});
