import { describe, expect, it } from 'vitest';

import * as claimPack from './claim-pack.core';
import * as freeStart from './free-start.core';
import * as businessLead from '@/lib/actions/business-membership-lead';

describe('public intake server action exports', () => {
  it('exports only the entry points that read server request headers', () => {
    expect(Object.keys(claimPack)).toEqual(['generateClaimPackAction']);
    expect(Object.keys(freeStart)).toEqual(['submitFreeStartIntake']);
    expect(Object.keys(businessLead)).toEqual(['submitBusinessMembershipLead']);
  });
});
