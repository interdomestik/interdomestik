import { sponsorRosterEntries } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';

import { SPONSOR_SYSTEM_ACTOR, type SponsorAuditEvent } from '../sponsors/audit';
import { auditTransaction, expectAudits } from '../sponsors/audit-test-support';
import { produceEntryStart, produceEntryStarts } from './entry-start';

const start = new Date('2027-02-01');
const end = new Date('2028-01-01');
const params = {
  tenantId: 'tenant',
  entryId: 'entry',
  interval: { start, end },
  handover: true,
  hasCredential: true,
};
const event = (entityId: string, at: Date): SponsorAuditEvent => ({
  action: 'sponsor_entry.started' as const,
  entityType: 'sponsor_roster_entry' as const,
  entityId,
  ...SPONSOR_SYSTEM_ACTOR,
  metadata: { at: at.toISOString() },
});

describe('entry start audit', () => {
  it.each([true, false])(
    'records the derived start for handover=%s after seating',
    async handover => {
      const db = auditTransaction();
      expect((await produceEntryStart(db.tx, { ...params, handover })).outcome).toBe('seated');
      expect(db.writes[0]).toEqual({
        table: sponsorRosterEntries,
        values: { outcome: 'seated', reviewReason: null },
      });
      expectAudits(db, [event('entry', start)]);
    }
  );
  it('does not record a start for an empty interval', async () => {
    const db = auditTransaction();
    expect(
      (await produceEntryStart(db.tx, { ...params, interval: { start, end: start } })).outcome
    ).toBe('staff_review');
    expectAudits(db, []);
  });
  it('batches only seated entries and preserves each derived start', async () => {
    const db = auditTransaction();
    const second = new Date('2027-05-01');
    await produceEntryStarts(db.tx, {
      ...params,
      starts: [
        { entryId: 'entry', interval: { start, end } },
        { entryId: 'empty', interval: { start, end: start } },
        { entryId: 'later', interval: { start: second, end } },
      ],
    });
    expectAudits(db, [event('entry', start), event('later', second)]);
    expect(db.auditBatches()).toHaveLength(1);
  });
  it.each([{ starts: [] }, { starts: [{ entryId: 'empty', interval: { start, end: start } }] }])(
    'writes no audit when the batch has no seated entries: %j',
    async ({ starts }) => {
      const db = auditTransaction();
      await produceEntryStarts(db.tx, { ...params, starts });
      expectAudits(db, []);
      expect(db.auditBatches()).toHaveLength(0);
    }
  );
  it('propagates audit failure to the caller transaction', async () => {
    const db = auditTransaction({ failAudit: true });
    await expect(
      produceEntryStarts(db.tx, {
        ...params,
        starts: [{ entryId: 'entry', interval: { start, end } }],
      })
    ).rejects.toThrow('audit unavailable');
  });
});
