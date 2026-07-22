import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  and: vi.fn((...values: unknown[]) => values),
}));

vi.mock('@interdomestik/database', () => ({
  db: { query: { user: { findFirst: mocks.findFirst } }, update: mocks.update },
}));
vi.mock('@interdomestik/database/schema', () => ({
  user: { id: 'user.id', tenantId: 'user.tenantId' },
}));
vi.mock('drizzle-orm', () => ({ eq: mocks.eq, and: mocks.and }));
vi.mock('nanoid', () => ({
  customAlphabet: () => () => 'ABC123',
  nanoid: () => 'ABC123',
}));

import { getMemberReferralLinkCore } from './member-referrals/link';
import { getAgentReferralLinkCore } from './referrals/get-agent-link';

describe('authorized referral-code writers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ referralCode: null });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
  });

  it.each([
    [getMemberReferralLinkCore, 'member', 'Mira', 'tenant_ks'],
    [getAgentReferralLinkCore, 'agent', 'Arta', 'tenant_mk'],
  ])(
    'generates %s code only for the session user and tenant',
    async (writer, role, name, tenantId) => {
      const id = `${role}-1`;
      const code = `${name.toUpperCase()}-ABC123`;
      const result = await writer({
        session: { user: { id, name, role, tenantId } },
        referralCode: 'ATTACKER',
      } as never);
      expect(result).toMatchObject({ success: true, data: { code } });
      expect(mocks.set).toHaveBeenCalledWith({ referralCode: code });
      expect(mocks.eq).toHaveBeenCalledWith('user.id', id);
      expect(mocks.eq).toHaveBeenCalledWith('user.tenantId', tenantId);
    }
  );
});
