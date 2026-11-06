import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';

import { LIFECYCLE_STAGE_STATUSES, STATUS_TO_LIFECYCLE } from './types';

describe('LIFECYCLE_STAGE_STATUSES', () => {
  it('places every claim status in exactly the stage its rows display', () => {
    const placed = Object.values(LIFECYCLE_STAGE_STATUSES).flat();
    expect([...placed].sort()).toEqual([...CLAIM_STATUSES].sort());
    for (const [stage, statuses] of Object.entries(LIFECYCLE_STAGE_STATUSES)) {
      for (const status of statuses) expect(STATUS_TO_LIFECYCLE[status]).toBe(stage);
    }
  });

  it('keeps airline-stage claims in the negotiation tab, pool and count', () => {
    expect(LIFECYCLE_STAGE_STATUSES.negotiation).toEqual(['submitted_to_airline', 'negotiation']);
  });
});
