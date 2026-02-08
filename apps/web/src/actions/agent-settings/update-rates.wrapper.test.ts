import { db } from '@interdomestik/database/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateAgentCommissionRatesCore } from './update-rates.core';

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      agentSettings: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(true),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(true),
    })),
  },
}));

// Mock DB schema
vi.mock('@interdomestik/database/schema', () => ({
  agentSettings: {
    agentId: 'agentId',
    tenantId: 'tenantId',
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn().mockReturnValue('tenant-1'),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('new-id'),
}));

describe('updateAgentCommissionRatesCore', () => {
  type UpdateRatesParams = Parameters<typeof updateAgentCommissionRatesCore>[0];
  type AgentSettingsSession = NonNullable<UpdateRatesParams['session']>;
  type FindFirstResult = Awaited<ReturnType<typeof db.query.agentSettings.findFirst>>;
  const findFirstMock = vi.mocked(db.query.agentSettings.findFirst);

  const mockSession = {
    session: {
      id: 'sess1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'admin1',
      expiresAt: new Date(Date.now() + 3600000),
      token: 'token1',
    },
    user: { id: 'admin1', role: 'admin', tenantId: 'tenant-1' },
  } as AgentSettingsSession;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if unauthorized', async () => {
    const result = await updateAgentCommissionRatesCore({
      session: null,
      agentId: 'a1',
      rates: {},
    });
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('should fail if not admin', async () => {
    const nonAdminSession = {
      ...mockSession,
      user: { ...mockSession.user, role: 'agent' },
    } as AgentSettingsSession;

    const result = await updateAgentCommissionRatesCore({
      session: nonAdminSession,
      agentId: 'a1',
      rates: {},
    });
    expect(result).toEqual({ success: false, error: 'Admin access required' });
  });

  it('should fail if rates are invalid', async () => {
    const result = await updateAgentCommissionRatesCore({
      session: mockSession,
      agentId: 'a1',
      rates: { new_membership: 1.5 },
    });
    expect(result).toEqual({ success: false, error: 'Rates must be between 0 and 1' });
  });

  it('should update existing settings', async () => {
    const existingSettings = { id: 'existing' } as NonNullable<FindFirstResult>;
    findFirstMock.mockResolvedValue(existingSettings);

    const result = await updateAgentCommissionRatesCore({
      session: mockSession,
      agentId: 'a1',
      rates: { new_membership: 0.1 },
    });

    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalled();
  });

  it('should insert new settings', async () => {
    findFirstMock.mockResolvedValue(undefined);

    const result = await updateAgentCommissionRatesCore({
      session: mockSession,
      agentId: 'a1',
      rates: { new_membership: 0.1 },
    });

    expect(result).toEqual({ success: true });
    expect(db.insert).toHaveBeenCalled();
  });
});
