import type { TenantTransaction } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  globalDbReads: [] as string[],
}));

vi.mock('@interdomestik/database', () => {
  const forbidden = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        hoisted.globalDbReads.push(String(prop));
        throw new Error(`global database handle used: ${String(prop)}`);
      },
    }
  );
  return { db: forbidden, dbRls: forbidden, withTenantContext: hoisted.withTenantContext };
});

import { createRecordingTenantTransaction } from '@/test/recording-tenant-transaction';
import { getVerificationRequestDetails } from './get-details';

function createRecordingTx(results: Array<unknown[] | Error>) {
  const { tx, select, executed } = createRecordingTenantTransaction(results);
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) => callback(tx)
  );
  return { executed, select };
}

function ctx(userRole: string, branchId: string | null = null) {
  return { tenantId: 'tenant-ks', userRole, scope: { branchId } };
}

const PARENT = {
  id: 'attempt-1',
  agentName: 'Agent A',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('getVerificationRequestDetails access', () => {
  beforeEach(() => {
    hoisted.withTenantContext.mockReset();
    hoisted.globalDbReads.length = 0;
  });

  it.each(['member', 'agent', 'global_support', 'auditor', 'unknown'])(
    'rejects %s with FORBIDDEN before any transaction',
    async role => {
      await expect(getVerificationRequestDetails(ctx(role), 'attempt-1')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it.each(['branch_manager', 'staff'])(
    'returns null for branchless %s before any transaction',
    async role => {
      await expect(getVerificationRequestDetails(ctx(role), 'attempt-1')).resolves.toBeNull();
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it('exits before document and audit reads when the parent is not visible', async () => {
    const { executed } = createRecordingTx([[]]);

    await expect(
      getVerificationRequestDetails(ctx('staff', 'branch-1'), 'attempt-1')
    ).resolves.toBeNull();

    expect(executed).toHaveLength(1);
    expect(executed[0]?.params).toEqual(
      expect.arrayContaining(['attempt-1', 'tenant-ks', 'branch-1'])
    );
  });

  it('reads parent, documents and audit in one transaction as the actor', async () => {
    const { executed } = createRecordingTx([
      [PARENT],
      [{ id: 'doc-1', fileName: 'proof.pdf', uploadedAt: new Date('2026-01-02T00:00:00Z') }],
      [
        {
          id: 'log-1',
          action: 'CASH_APPROVE',
          createdAt: new Date('2026-01-03T00:00:00Z'),
          metadata: { note: 'ok' },
          actorName: null,
        },
      ],
    ]);

    const result = await getVerificationRequestDetails(ctx('branch_manager', 'branch-1'), 'a-1');

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
      tenantId: 'tenant-ks',
      role: 'branch_manager',
    });
    expect(executed).toHaveLength(3);
    expect(executed[0]?.params).toContain('branch-1');
    expect(executed[1]?.sql).toMatch(/"deleted_at" is null/);
    expect(executed[1]?.params).toEqual(expect.arrayContaining(['payment_attempt', 'tenant-ks']));
    expect(executed[2]?.params).toEqual(expect.arrayContaining(['payment_attempt', 'tenant-ks']));
    expect(result?.documentId).toBe('doc-1');
    expect(result?.documentPath).toBeNull();
    expect(result?.documents[0]?.url).toBe('/api/documents/doc-1/download');
    expect(result?.timeline.map(event => event.title)).toEqual([
      'Approved',
      'Proof Uploaded',
      'Payment Attempt Created',
    ]);
    expect(result?.timeline[0]).toMatchObject({ description: 'ok', actorName: 'Unknown' });
    expect(hoisted.globalDbReads).toEqual([]);
  });

  it('reads admin details tenant-wide without a branch predicate', async () => {
    const { executed } = createRecordingTx([[PARENT], [], []]);

    await getVerificationRequestDetails(ctx('admin', 'branch-1'), 'attempt-1');

    expect(executed[0]?.params).not.toContain('branch-1');
  });

  it('propagates read failures from the transaction', async () => {
    const failure = new Error('permission denied for table audit_log');
    createRecordingTx([[PARENT], [], failure]);

    await expect(getVerificationRequestDetails(ctx('admin'), 'attempt-1')).rejects.toBe(failure);
  });
});
