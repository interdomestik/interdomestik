import { inArray, sponsorRosterEntries, type TenantTransaction } from '@interdomestik/database';
import { lockSponsorPerson } from '@interdomestik/database/sponsor-locks';
import { describe, expect, it, vi } from 'vitest';

import { auditTransaction } from './audit-test-support';
import { bindEntryIdentity } from './provisioning-identity';

vi.mock('@interdomestik/database', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database')>();
  return { ...actual, inArray: vi.fn(actual.inArray) };
});
vi.mock('@interdomestik/database/sponsor-locks', () => ({
  lockSponsorEntryIdentity: vi.fn(),
  lockSponsorPerson: vi.fn(),
}));

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

  it('takes lock 2, terms and entries before it writes the binding (retention order)', async () => {
    // Unbound entry, one visible account, then the term subquery and the locked terms.
    const db = auditTransaction({
      selects: [[{ userId: null }], [{ id: 'usr_existing' }], [], [{ id: 'term' }]],
    });
    const order: unknown[] = [];
    vi.mocked(lockSponsorPerson).mockImplementation(async () => void order.push('person'));
    const select = (...args: Parameters<typeof db.tx.select>): unknown => {
      const chain = db.tx.select(...args) as unknown as Record<
        string,
        (...a: unknown[]) => unknown
      >;
      const lock = chain.for;
      chain.for = (mode: unknown) => (order.push(mode), lock(mode));
      return chain;
    };
    const update = (...args: Parameters<typeof db.tx.update>): unknown => (
      order.push('write'),
      db.tx.update(...args)
    );
    const tx = { ...db.tx, select, update } as unknown as TenantTransaction;
    expect(await bind(tx)).toEqual({ kind: 'bound', userId: 'usr_existing', created: false });
    expect(order).toEqual(['person', 'share', 'update', 'write']);
    // An entry uploaded meanwhile into another term is not locked here (that term is not held).
    expect(inArray).toHaveBeenCalledWith(sponsorRosterEntries.termId, ['term']);
  });
});
