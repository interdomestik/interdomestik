import { describe, expect, it } from 'vitest';

import type { CoverageEntry } from '../sponsor-coverage/evaluate';
import { companyVisibleStatus, countStatuses } from './roster-view-status';

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const now = at('2027-03-01');
const entry = (over: Partial<CoverageEntry> = {}): CoverageEntry => ({
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
const status = (
  personEntries: CoverageEntry[],
  over: { revokedReason?: string | null; hasCredential?: boolean; entryId?: string } = {}
) =>
  companyVisibleStatus(
    {
      entryId: over.entryId ?? 'spe_1',
      revokedReason: over.revokedReason ?? null,
      personEntries,
      hasCredential: over.hasCredential ?? true,
    },
    now
  );

describe('company-visible roster status (§3.4)', () => {
  it('is registered when eligible, covering now or later, with a credential', () => {
    expect(status([entry()])).toBe('registered');
    expect(status([entry({ startsAt: at('2027-06-01') })])).toBe('registered');
  });

  it('waits for the employee without a credential, a binding or a derived start', () => {
    expect(status([entry()], { hasCredential: false })).toBe('awaiting_employee');
    expect(status([])).toBe('awaiting_employee');
    expect(status([entry({ startsAt: null })])).toBe('awaiting_employee');
  });

  it.each(['foreign', 'not_eligible', 'staff_review'])('shows %s as awaiting', outcome => {
    const startsAt = outcome === 'staff_review' ? at('2027-01-01') : null;
    expect(status([entry({ outcome, startsAt })])).toBe('awaiting_employee');
  });

  it('shows a rejected conflict, an ended interval and a staff revocation as awaiting', () => {
    expect(status([entry({ conflictDecision: 'rejected' })])).toBe('awaiting_employee');
    expect(status([entry({ terminatedEffectiveAt: at('2027-02-01') })])).toBe('awaiting_employee');
    expect(status([entry({ revokedAt: at('2027-02-01') })], { revokedReason: 'staff' })).toBe(
      'awaiting_employee'
    );
  });

  it.each(['opted_out', 'left'])('shows %s as having left the programme', reason => {
    expect(status([entry({ revokedAt: at('2027-02-01') })], { revokedReason: reason })).toBe(
      'left_programme'
    );
  });

  it('follows a contiguous renewal into the next term without its own start', () => {
    const previous = entry({
      termStart: at('2026-01-01'),
      termEnd: at('2027-01-01'),
      termId: 'spt_0',
      id: 'spe_0',
      startsAt: at('2026-01-01'),
    });
    const renewal = entry({ startsAt: null });
    expect(status([previous, renewal])).toBe('registered');
  });

  it('counts each status', () => {
    expect(countStatuses(['registered', 'registered', 'left_programme'])).toEqual({
      registered: 2,
      awaiting_employee: 0,
      left_programme: 1,
    });
  });
});
