import { LIFECYCLE_ACTIVE_STATUSES } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { describe, expect, it } from 'vitest';

import { OPEN_CLAIMS_STATUSES } from './kpi-definitions';

describe('OPEN_CLAIMS_STATUSES', () => {
  it('counts every active lifecycle status, including airline-stage claims, plus drafts', () => {
    expect([...OPEN_CLAIMS_STATUSES].sort()).toEqual(
      [...LIFECYCLE_ACTIVE_STATUSES, 'draft'].sort()
    );
  });
});
