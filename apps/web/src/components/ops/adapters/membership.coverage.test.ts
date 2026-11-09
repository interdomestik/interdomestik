import { describe, expect, it } from 'vitest';
import { getMembershipActions, getSponsoredMembershipState } from './membership';
const row = { id: 'sub', status: 'active', createdAt: null, currentPeriodEnd: null };
const t = (key: string): string => key;
describe('effective membership actions', () => {
  it('source 1 suppresses all Paddle actions even when the underlying row is Paddle', () => {
    const sub = { ...row, provider: 'paddle', sponsorCoverage: { entryId: 'entry' } };
    expect(getMembershipActions(sub, t)).toEqual({ secondary: [] });
    expect(getSponsoredMembershipState(sub)).toBe('covered');
  });
  it('source 2 exposes cancellation for an eligible Paddle row', () => {
    expect(
      getMembershipActions({ ...row, provider: 'paddle' }, t).secondary.map(action => action.id)
    ).toEqual(['cancel']);
  });
  it.each(['group_sponsor', 'cash', null, undefined])(
    'refuses Paddle actions for provider %s',
    provider => {
      expect(getMembershipActions({ ...row, provider, status: 'past_due' }, t)).toEqual({
        secondary: [],
      });
    }
  );
  it('source 3 renders legacy sponsored state as inactive', () => {
    expect(getSponsoredMembershipState({ ...row, provider: 'group_sponsor' })).toBe('inactive');
  });
});
