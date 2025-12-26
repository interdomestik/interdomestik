import { describe, expect, it } from 'vitest';

import type { Session } from './context';
import { getAgentReferralLinkCore } from './get-agent-link';

describe('actions/referrals getAgentReferralLinkCore', () => {
  it('denies access for non-agent roles', async () => {
    const result = await getAgentReferralLinkCore({
      session: {
        user: { id: 'u1', role: 'user', name: 'Member' },
      } as unknown as NonNullable<Session>,
    });

    expect(result).toEqual({ success: false, error: 'Access denied' });
  });
});
