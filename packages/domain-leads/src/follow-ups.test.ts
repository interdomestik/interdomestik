import { describe, expect, it, vi } from 'vitest';
import { getMyFollowUpsCount } from './follow-ups';

// Mock database
vi.mock('@interdomestik/database/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ count: 1 }]), // Default mock response
      })),
    })),
  },
}));

describe('getMyFollowUpsCount', () => {
  it('should return a number', async () => {
    const count = await getMyFollowUpsCount({
      tenantId: 'tenant_1',
      agentId: 'agent_1',
    });
    expect(count).toBe(1);
  });
});
