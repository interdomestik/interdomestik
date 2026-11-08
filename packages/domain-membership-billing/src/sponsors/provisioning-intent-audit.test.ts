import { sponsorHandoverIntents } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';

import { SPONSOR_SYSTEM_ACTOR } from './audit';
import { auditTransaction, expectAudits } from './audit-test-support';
import { linkHandoverIntent } from './provisioning-intent';

const params = {
  tenantId: 'tenant',
  entryId: 'entry',
  userId: 'member',
  subscription: {
    id: 'subscription',
    providerSubscriptionId: 'paddle-subscription',
    status: 'active',
  },
};
const existing = { id: 'intent', userId: 'member', state: 'pending', paidUntil: null };

describe('provisioning intent audit', () => {
  it.each(['handover', 'paddle_review'] as const)(
    'records only a newly inserted intent in mode %s',
    async mode => {
      const state = mode === 'handover' ? 'pending' : 'staff_review';
      const db = auditTransaction({ selects: [[], [{ ...existing, state }]] });
      await linkHandoverIntent(db.tx, { ...params, mode });
      const write = db.writes[0];
      expect(write?.table).toBe(sponsorHandoverIntents);
      const values = Array.isArray(write?.values) ? write.values[0] : write?.values;
      expectAudits(db, [
        {
          action: 'sponsor_intent.state',
          entityType: 'sponsor_handover_intent',
          entityId: String(values?.id),
          ...SPONSOR_SYSTEM_ACTOR,
          metadata: { state },
        },
      ]);
    }
  );
  it('does not claim creation when the insert loses a conflict', async () => {
    const db = auditTransaction({ selects: [[], [existing]], inserted: [[]] });
    expect((await linkHandoverIntent(db.tx, { ...params, mode: 'handover' })).kind).toBe('linked');
    expectAudits(db, []);
  });
  it('does not audit reuse or rejection of an existing intent', async () => {
    const db = auditTransaction({ selects: [[existing]] });
    expect((await linkHandoverIntent(db.tx, { ...params, mode: 'handover' })).kind).toBe('linked');
    expectAudits(db, []);
    const closed = auditTransaction({ selects: [[{ ...existing, state: 'closed_by_staff' }]] });
    expect((await linkHandoverIntent(closed.tx, { ...params, mode: 'handover' })).kind).toBe(
      'review'
    );
    expectAudits(closed, []);
  });
});
