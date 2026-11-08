import { sponsorMailOutbox } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { SPONSOR_SYSTEM_ACTOR } from './audit';
import { auditTransaction, expectAudits } from './audit-test-support';
import { finishMail, type MailFinish } from './mail-outbox';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
const authority = mintTestTenantAuthority('tenant');
const now = new Date('2027-01-01');
const lease = { id: 'mail', leaseUntil: now.toISOString() };
function use(db: ReturnType<typeof auditTransaction>): void {
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
}
const mail = {
  id: 'mail',
  attempts: 8,
  kind: 'activation',
  name: 'Private Name',
  email: 'private@example.com',
  content: 'Private Content',
};

describe('mail failure audit', () => {
  it.each(['send_failed', 'send_exception', 'facts_unavailable'] as const)(
    'records terminal %s with only kind and code',
    async code => {
      const db = auditTransaction({ selects: [[mail]], updated: [[{ id: 'mail' }]] });
      use(db);
      expect(await finishMail(authority, lease, { state: 'error', code }, now)).toBe('failed');
      expect(db.writes[0]?.table).toBe(sponsorMailOutbox);
      expectAudits(
        db,
        [
          {
            action: 'sponsor_mail.failed',
            entityType: 'sponsor_mail',
            entityId: 'mail',
            ...SPONSOR_SYSTEM_ACTOR,
            metadata: { kind: 'activation', code },
          },
        ],
        ['Private Name', 'Private Content']
      );
    }
  );
  it.each([
    { state: 'sent' },
    { state: 'skipped', reason: 'entry_revoked' },
    { state: 'error', code: 'send_failed' },
  ] satisfies MailFinish[])('does not audit non-failed finish %j', async result => {
    const db = auditTransaction({
      selects: [[{ ...mail, attempts: 7 }]],
      updated: [[{ id: 'mail' }]],
    });
    use(db);
    expect(await finishMail(authority, lease, result, now)).not.toBe('failed');
    expectAudits(db, []);
  });
  it.each([true, false])('omits failure when the lease is lost (row present=%s)', async present => {
    const db = auditTransaction({ selects: [present ? [mail] : []], updated: [[]] });
    use(db);
    expect(await finishMail(authority, lease, { state: 'error', code: 'send_failed' }, now)).toBe(
      'lease_lost'
    );
    expectAudits(db, []);
  });
});
