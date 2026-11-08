import type { TenantTransaction } from '@interdomestik/database';
import { describe, expect, it, vi } from 'vitest';

import { auditTransaction } from './audit-test-support';
import { bindEntryIdentity } from './provisioning-identity';

vi.mock('@interdomestik/database/sponsor-locks', () => ({ lockSponsorEntryIdentity: vi.fn() }));

const entry = {
  id: 'entry',
  termId: 'term',
  emailHmac: 'hmac',
  emailNormalized: 'person@example.com',
  firstName: 'Ana',
  lastName: 'Example',
};
const bind = (tx: TenantTransaction): ReturnType<typeof bindEntryIdentity> =>
  bindEntryIdentity(tx, {
    tenantId: 'tenant',
    entry,
    branchId: 'branch',
    mayCreate: true,
    now: new Date('2027-01-01'),
  });

describe('bindEntryIdentity after an insert conflict', () => {
  it.each([
    ['binds a same-tenant signup that committed meanwhile', [{ id: 'usr_signup' }], 'bound'],
    ['reports an address taken outside the tenant as foreign', [], 'foreign'],
    ['sends two visible accounts to binding review', [{ id: 'a' }, { id: 'b' }], 'binding_review'],
  ] as const)('%s', async (_name, raced, kind) => {
    // Unbound entry, no visible account, insert conflict, re-read, then no other entry of the term.
    const db = auditTransaction({
      selects: [[{ userId: null }], [], [...raced], []],
      inserted: [[]],
    });
    const result = await bind(db.tx);
    expect(result.kind).toBe(kind);
    if (kind === 'bound') expect(result).toEqual({ kind, userId: 'usr_signup', created: false });
  });

  it('marks an account it inserted itself as created', async () => {
    const db = auditTransaction({ selects: [[{ userId: null }], [], []] });
    const result = await bind(db.tx);
    expect(result).toMatchObject({ kind: 'bound', created: true });
  });
});
