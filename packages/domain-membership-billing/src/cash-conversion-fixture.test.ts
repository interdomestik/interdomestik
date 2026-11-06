import { E2E_CASH_INSTANTS, e2eCashInstant } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';

import { createActiveAnnualMembershipState } from './annual-membership';

// The seeded converted-lead membership must be the term conversion grants at the approval.
describe('E2E cash conversion fixture', () => {
  it('ends exactly one annual term after the approval, as conversion writes it', () => {
    const state = createActiveAnnualMembershipState(e2eCashInstant('DECIDED'));
    expect([
      state.status,
      state.currentPeriodStart.toISOString(),
      state.currentPeriodEnd.toISOString(),
    ]).toEqual(['active', E2E_CASH_INSTANTS.DECIDED, E2E_CASH_INSTANTS.ANNUAL_PERIOD_END]);
  });
});
