import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';

const withTenantContext = vi.hoisted(() =>
  vi.fn<(context: unknown, action: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()
);

vi.mock('@interdomestik/database', () => ({
  withTenantContext,
}));

export type QueryCall = { args: unknown[]; method: string };
export type WorkItemRow = {
  branchId: string | null;
  currencyCode: string | null;
  pipelineId: string | null;
  tenantId: string;
};

export function authoritiesFor(...tenantIds: string[]) {
  return tenantIds.map(tenantId => mintTestTenantAuthority(tenantId));
}

export function row(overrides: Partial<WorkItemRow> = {}): WorkItemRow {
  return {
    branchId: 'branch-1',
    currencyCode: 'EUR',
    pipelineId: 'pipeline-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

export function createDatabaseDouble(results: WorkItemRow[][]) {
  const calls: QueryCall[] = [];
  const limitResults = [...results];
  const createChain = () => {
    const chain = {
      from: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'from', args)),
      groupBy: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'groupBy', args)),
      innerJoin: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'innerJoin', args)),
      limit: vi.fn(async (...args: unknown[]) => {
        calls.push({ args, method: 'limit' });
        return limitResults.shift() ?? [];
      }),
      orderBy: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'orderBy', args)),
      where: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'where', args)),
    };
    return chain;
  };
  return { calls, database: { select: vi.fn(() => createChain()) } };
}

export function pushCall<TChain>(
  chain: TChain,
  calls: QueryCall[],
  method: string,
  args: unknown[]
): TChain {
  calls.push({ args, method });
  return chain;
}

export { withTenantContext };
