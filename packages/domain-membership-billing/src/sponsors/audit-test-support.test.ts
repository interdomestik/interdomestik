import { sponsors } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';

import { auditTransaction, expectAudits } from './audit-test-support';
import { writeSponsorAudit, type SponsorAuditEvent } from './audit';

describe('audit transaction promise chain', () => {
  it('uses a real promise and keeps a single write through chained calls', async () => {
    const db = auditTransaction();
    const query = db.tx.insert(sponsors).values({ id: 'sponsor' } as never);
    expect(query).toBeInstanceOf(Promise);
    expect(Object.hasOwn(query, 'then')).toBe(false);
    await query.onConflictDoNothing().returning();
    expect(db.writes).toEqual([{ table: sponsors, values: { id: 'sponsor' } }]);
  });

  it.each([
    'private@example.com',
    'Contact: private@example.com please',
    'prefix@private@example.com',
    `${'a'.repeat(300)}@example.com`,
  ])('retains email substring rejection: %s', async value => {
    const db = auditTransaction();
    const events: SponsorAuditEvent[] = [
      {
        action: 'sponsor.created',
        entityType: 'sponsor',
        entityId: 'sponsor',
        actorId: 'staff',
        actorRole: 'staff',
        metadata: { reason: value },
      },
    ];
    await writeSponsorAudit(db.tx, 'tenant', events);
    expect(() => expectAudits(db, events)).toThrow();
  });
});
