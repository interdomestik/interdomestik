import { inArray, sponsorRosterEntries, sponsorTerms } from '@interdomestik/database';
import { describe, expect, it, vi } from 'vitest';

import { auditTransaction } from '../sponsors/audit-test-support';
import { admitPersonEntries } from './admission';

vi.mock('@interdomestik/database', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database')>();
  return { ...actual, inArray: vi.fn(actual.inArray) };
});
vi.mock('@interdomestik/database/sponsor-locks', () => ({ lockSponsorPerson: vi.fn() }));

const term = {
  id: 'term_h',
  sponsorId: 'sponsor',
  termStart: '2027-01-01T00:00:00Z',
  termEnd: '2028-01-01T00:00:00Z',
  terminatedEffectiveAt: null,
};

describe('admitPersonEntries lock scope (§3.5, Astra round 4)', () => {
  it('keeps the binding term set and locks entries only in the terms it holds', async () => {
    // Person-term subquery, locked terms, entries, then approved revisions.
    const db = auditTransaction({ selects: [[], [term], [], []] });
    await admitPersonEntries(db.tx, 'tenant', 'member', { termIds: ['term_h'] });
    expect(inArray).toHaveBeenCalledWith(sponsorTerms.id, ['term_h']);
    expect(inArray).toHaveBeenCalledWith(sponsorRosterEntries.termId, ['term_h']);
  });

  it('locks no entry when none of its terms could be locked', async () => {
    vi.mocked(inArray).mockClear();
    const db = auditTransaction({ selects: [[], []] });
    expect(await admitPersonEntries(db.tx, 'tenant', 'member', { termIds: [] })).toEqual([]);
    expect(inArray).not.toHaveBeenCalledWith(sponsorRosterEntries.termId, expect.anything());
  });
});
