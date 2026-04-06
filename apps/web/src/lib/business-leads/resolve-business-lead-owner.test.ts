import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBusinessLeadOwner } from './resolve-business-lead-owner';

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      tenantSettings: {
        findFirst: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
      },
    },
  },
}));

const mockDbResponse = (returnValue: unknown) => {
  return (args: {
    where?: (
      table: unknown,
      operators: { and: (...items: unknown[]) => unknown[]; eq: (...items: unknown[]) => unknown[] }
    ) => unknown;
  }) => {
    if (args?.where) {
      args.where(
        {},
        {
          and: (...items: unknown[]) => items,
          eq: (...items: unknown[]) => items,
        }
      );
    }

    return Promise.resolve(returnValue);
  };
};

describe('resolveBusinessLeadOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.tenantSettings.findFirst).mockReset();
    vi.mocked(db.query.user.findFirst).mockReset();
  });

  it('resolves configured owner and prefers explicit branchId from sales settings', async () => {
    vi.mocked(db.query.tenantSettings.findFirst)
      .mockImplementationOnce(
        mockDbResponse({
          value: {
            agentId: 'agent_system',
            branchId: 'branch_sales',
          },
        }) as never
      )
      .mockImplementationOnce(mockDbResponse(undefined) as never);

    vi.mocked(db.query.user.findFirst).mockImplementation(
      mockDbResponse({ id: 'agent_system', branchId: 'branch_agent' }) as never
    );

    await expect(resolveBusinessLeadOwner('tenant_ks')).resolves.toEqual({
      agentId: 'agent_system',
      branchId: 'branch_sales',
    });
  });

  it('falls back to the configured default branch when sales settings omit branchId', async () => {
    vi.mocked(db.query.tenantSettings.findFirst)
      .mockImplementationOnce(
        mockDbResponse({
          value: {
            agentId: 'agent_system',
          },
        }) as never
      )
      .mockImplementationOnce(
        mockDbResponse({
          value: {
            branchId: 'branch_default',
          },
        }) as never
      );

    vi.mocked(db.query.user.findFirst).mockImplementation(
      mockDbResponse({ id: 'agent_system', branchId: null }) as never
    );

    await expect(resolveBusinessLeadOwner('tenant_ks')).resolves.toEqual({
      agentId: 'agent_system',
      branchId: 'branch_default',
    });
  });

  it('falls back to the owner agent branch when branch settings are absent', async () => {
    vi.mocked(db.query.tenantSettings.findFirst)
      .mockImplementationOnce(
        mockDbResponse({
          value: {
            agentId: 'agent_system',
          },
        }) as never
      )
      .mockImplementationOnce(mockDbResponse(undefined) as never);

    vi.mocked(db.query.user.findFirst).mockImplementation(
      mockDbResponse({ id: 'agent_system', branchId: 'branch_agent' }) as never
    );

    await expect(resolveBusinessLeadOwner('tenant_ks')).resolves.toEqual({
      agentId: 'agent_system',
      branchId: 'branch_agent',
    });
  });

  it('returns null when no system owner is configured', async () => {
    vi.mocked(db.query.tenantSettings.findFirst).mockImplementation(
      mockDbResponse(undefined) as never
    );

    await expect(resolveBusinessLeadOwner('tenant_ks')).resolves.toBeNull();
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when configured owner does not resolve to a tenant user', async () => {
    vi.mocked(db.query.tenantSettings.findFirst)
      .mockImplementationOnce(
        mockDbResponse({
          value: {
            agentId: 'agent_missing',
          },
        }) as never
      )
      .mockImplementationOnce(
        mockDbResponse({
          value: {
            branchId: 'branch_default',
          },
        }) as never
      );

    vi.mocked(db.query.user.findFirst).mockImplementation(mockDbResponse(undefined) as never);

    await expect(resolveBusinessLeadOwner('tenant_ks')).resolves.toBeNull();
  });
});
