import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMemberReferralLinkCore } from './link';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  nanoid: vi.fn(() => 'ABCDEF'),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: { findFirst: mocks.findFirst },
    },
    update: mocks.update,
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  relations: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

describe('getMemberReferralLinkCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
  });

  it('returns existing code if present', async () => {
    mocks.findFirst.mockResolvedValue({ referralCode: 'EXISTING-123', name: 'John Doe' });

    const result = await getMemberReferralLinkCore({
      session: { user: { id: 'u1', name: 'John Doe' } } as any,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('EXISTING-123');
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('generates new code if missing', async () => {
    mocks.findFirst.mockResolvedValue({ referralCode: null, name: 'John Doe' });
    mocks.nanoid.mockReturnValue('123456');

    const result = await getMemberReferralLinkCore({
      session: { user: { id: 'u1', name: 'John Doe' } } as any,
    });

    expect(result.success).toBe(true);
    expect(mocks.update).toHaveBeenCalled();
    // Verify Update Logic
    // JOHN-123456 (First name JOHN, random 123456)
    // Note: implementation uses user.name from session or DB?
    // Impl logic: session.user.name or 'USER'
    if (result.success) {
      expect(result.data.code).toBe('JOHN-123456');
    }
  });

  it('handles unauthorized', async () => {
    const result = await getMemberReferralLinkCore({ session: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Unauthorized');
    }
  });
});
