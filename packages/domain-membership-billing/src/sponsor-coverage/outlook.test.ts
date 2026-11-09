import { describe, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => vi.fn());
vi.mock('./resolve', () => ({ readCoverageEntries: read }));

import type { CoverageEntry } from './evaluate';
import { readSponsorOutlook } from './outlook';

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const entry = (over: Partial<CoverageEntry>): CoverageEntry => ({
  id: 'spe_1',
  sponsorId: 'spn_1',
  termId: 'spt_1',
  termStart: at('2027-01-01'),
  termEnd: at('2028-01-01'),
  terminatedEffectiveAt: null,
  termEffective: true,
  planId: 'plan_1',
  planKey: 'standard',
  legalEntityId: 'le_1',
  conflictDecision: 'accepted',
  revokedAt: null,
  outcome: 'seated',
  startsAt: at('2027-01-01'),
  handoverPaidUntil: null,
  ...over,
});
const tx = {} as never;

describe('readSponsorOutlook', () => {
  it('reports the covering entry now and no later start', async () => {
    read.mockResolvedValue(new Map([['usr_1', [entry({})]]]));
    const outlook = (await readSponsorOutlook(tx, 't', ['usr_1'], at('2027-03-01'))).get('usr_1');
    expect(outlook?.covering?.entryId).toBe('spe_1');
    expect(outlook?.covering?.coverageEnd).toEqual(at('2028-01-01'));
    expect(outlook?.nextStart).toBeNull();
  });

  it('reports a later derived start (handover) without covering now', async () => {
    read.mockResolvedValue(
      new Map([['usr_1', [entry({ startsAt: null, handoverPaidUntil: at('2027-05-01') })]]])
    );
    const outlook = (await readSponsorOutlook(tx, 't', ['usr_1'], at('2027-03-01'))).get('usr_1');
    expect(outlook).toEqual({ covering: null, nextStart: at('2027-05-01') });
  });

  it('gives an empty outlook to an unsponsored or unknown person', async () => {
    read.mockResolvedValue(new Map());
    const outlooks = await readSponsorOutlook(tx, 't', ['usr_2'], at('2027-03-01'));
    expect(outlooks.get('usr_2')).toEqual({ covering: null, nextStart: null });
  });
});
