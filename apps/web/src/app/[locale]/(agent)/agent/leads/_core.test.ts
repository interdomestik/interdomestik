import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmLeads: {
    agentId: 'crmLeads.agentId',
    updatedAt: 'crmLeads.updatedAt',
    $inferSelect: {} as unknown,
  },
}));

vi.mock('drizzle-orm', () => ({
  desc: vi.fn(),
  eq: vi.fn(),
}));

import { getAgentLeadsCore } from './_core';

type FromWhereOrderByResult<T> = {
  from: () => {
    where: () => {
      orderBy: () => Promise<T[]>;
    };
  };
};

function makeChain<T>(rows: T[]): FromWhereOrderByResult<T> {
  return {
    from: () => ({
      where: () => ({
        orderBy: async () => rows,
      }),
    }),
  };
}

describe('getAgentLeadsCore', () => {
  it('returns rows ordered by updatedAt desc', async () => {
    const rows = [{ id: 'l1' }, { id: 'l2' }];
    hoisted.dbSelect.mockReturnValueOnce(makeChain(rows));

    const result = await getAgentLeadsCore({ agentId: 'agent-1' });

    expect(result).toEqual(rows);
  });
});
