import { describe, expect, it, vi } from 'vitest';

import type { Session } from './context';
import { updateAgentCommissionRatesCore } from './update-rates';

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      agentSettings: {
        findFirst: vi.fn(async () => null),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentSettings: {},
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'id-1',
}));

describe('updateAgentCommissionRatesCore', () => {
  it('rejects rates outside 0..1', async () => {
    const result = await updateAgentCommissionRatesCore({
      session: {
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
        session: { id: 'session-1' },
      } as unknown as NonNullable<Session>,
      agentId: 'agent-1',
      rates: { member: 1.1 } as unknown as import('../commissions.types').CommissionRates,
    });

    expect(result).toEqual({ success: false, error: 'Rates must be between 0 and 1' });
  });
});
