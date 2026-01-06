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
  const mockSession = { user: { id: 'admin1', role: 'admin', tenantId: 'tenant-1' } };

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
    const result = await updateAgentCommissionRatesCore({
      session: { user: { role: 'agent' } } as any,
      agentId: 'a1',
      rates: {},
    });
    expect(result).toEqual({ success: false, error: 'Admin access required' });
  });

  it('should fail if rates are invalid', async () => {
    const result = await updateAgentCommissionRatesCore({
      session: mockSession,
      agentId: 'a1',
      rates: { standard: 1.5 },
    });
    expect(result).toEqual({ success: false, error: 'Rates must be between 0 and 1' });
  });

  it('should update existing settings', async () => {
    (db.query.agentSettings.findFirst as any).mockResolvedValue({ id: 'existing' });

    const result = await updateAgentCommissionRatesCore({
      session: mockSession,
      agentId: 'a1',
      rates: { standard: 0.1 },
    });

    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalled();
  });

  it('should insert new settings', async () => {
    (db.query.agentSettings.findFirst as any).mockResolvedValue(null);

    const result = await updateAgentCommissionRatesCore({
      session: mockSession,
      agentId: 'a1',
      rates: { standard: 0.1 },
    });

    expect(result).toEqual({ success: true });
    expect(db.insert).toHaveBeenCalled();
  });
});
