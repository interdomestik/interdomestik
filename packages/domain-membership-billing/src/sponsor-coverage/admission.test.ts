import { describe, expect, it } from 'vitest';

import { type AdmissionEntry, decideAdmissions } from './admission';

const month = (m: number) => new Date(Date.UTC(2027, m, 1));

function entry(
  id: string,
  sponsorId: string,
  start: number,
  end: number,
  overrides: Partial<AdmissionEntry> = {}
): AdmissionEntry {
  return {
    id,
    sponsorId,
    termStart: month(start),
    termEnd: month(end),
    terminatedEffectiveAt: null,
    termEffective: true,
    conflictDecision: null,
    revokedAt: null,
    ...overrides,
  };
}

describe('decideAdmissions', () => {
  it('rejects a late overlapping entry and leaves the accepted grant untouched', () => {
    const b = entry('b', 'sponsor-b', 6, 18, { conflictDecision: 'accepted' });
    const a = entry('a', 'sponsor-a', 0, 12);
    expect(decideAdmissions([b, a])).toEqual([{ entryId: 'a', decision: 'rejected' }]);
  });

  it('decides a chain by admission order: first committed wins', () => {
    const chain = [
      entry('a', 'sponsor-a', 0, 12),
      entry('b', 'sponsor-b', 6, 18),
      entry('c', 'sponsor-c', 12, 24),
      entry('d', 'sponsor-d', 18, 30),
    ];
    expect(decideAdmissions(chain).map(item => item.decision)).toEqual([
      'accepted',
      'rejected',
      'accepted',
      'rejected',
    ]);
    const bFirst = chain.map(item =>
      item.id === 'b' ? { ...item, conflictDecision: 'accepted' as const } : item
    );
    expect(decideAdmissions(bFirst)).toEqual([
      { entryId: 'a', decision: 'rejected' },
      { entryId: 'c', decision: 'rejected' },
      { entryId: 'd', decision: 'accepted' },
    ]);
  });

  it('never conflicts with the same sponsor or with revoked, ended or rejected occupancy', () => {
    const decided = [
      entry('renewal-prev', 'sponsor-a', 0, 12, { conflictDecision: 'accepted' }),
      entry('revoked', 'sponsor-b', 0, 24, { conflictDecision: 'accepted', revokedAt: month(1) }),
      entry('rejected', 'sponsor-c', 0, 24, { conflictDecision: 'rejected' }),
      entry('ended', 'sponsor-d', 0, 24, {
        conflictDecision: 'accepted',
        terminatedEffectiveAt: month(6),
      }),
    ];
    expect(decideAdmissions([...decided, entry('next', 'sponsor-a', 6, 18)])).toEqual([
      { entryId: 'next', decision: 'accepted' },
    ]);
  });

  it('admits nothing that is revoked, already decided or in an ineffective term', () => {
    expect(
      decideAdmissions([
        entry('revoked', 'sponsor-a', 0, 12, { revokedAt: month(0) }),
        entry('decided', 'sponsor-b', 0, 12, { conflictDecision: 'rejected' }),
        entry('unapproved', 'sponsor-c', 0, 12, { termEffective: false }),
      ])
    ).toEqual([]);
  });

  it('treats adjacent intervals as non-overlapping', () => {
    const first = entry('first', 'sponsor-a', 0, 12, { conflictDecision: 'accepted' });
    expect(decideAdmissions([first, entry('second', 'sponsor-b', 12, 24)])).toEqual([
      { entryId: 'second', decision: 'accepted' },
    ]);
  });
});
