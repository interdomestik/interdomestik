import { authority, now, personRows, token, use } from './opt-out.test-support';
import { setImmediate } from 'node:timers/promises';
import { sponsorRosterEntries } from '@interdomestik/database';
import { lockSponsorEntryIdentity, lockSponsorPerson } from '@interdomestik/database/sponsor-locks';
import { expect, it, vi } from 'vitest';

import { auditTransaction } from './audit-test-support';
import { leaveSponsorship, optOutByToken } from './opt-out';

it.each([
  { scenario: 'bound token opt-out', userId: 'member', revoke: () => optOutByToken(token, now) },
  { scenario: 'unbound token opt-out', userId: null, revoke: () => optOutByToken(token, now) },
  {
    scenario: 'authenticated leave',
    userId: 'member',
    revoke: () => leaveSponsorship(authority, { userId: 'member' }, { entryId: 'entry', now }),
  },
])(
  'awaits the identity lock before revocation writes for $scenario',
  async ({ userId, revoke }) => {
    const db = auditTransaction({ selects: personRows(userId) });
    use(db);
    let release!: () => void;
    const pendingLock = new Promise<void>(resolve => {
      release = resolve;
    });
    const lock = vi.mocked(userId === null ? lockSponsorEntryIdentity : lockSponsorPerson);
    lock.mockReturnValueOnce(pendingLock);

    const result = revoke();
    try {
      // Drain the transaction double's microtasks while the identity lock remains pending.
      await setImmediate();
      expect(lock).toHaveBeenCalledOnce();
      expect(db.writes).toEqual([]);
      expect(db.tx.select).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await result;
    }

    expect(db.writes[0]?.table).toBe(sponsorRosterEntries);
  }
);
