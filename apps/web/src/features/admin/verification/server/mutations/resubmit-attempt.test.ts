import { randomUUID } from 'node:crypto';
import {
  E2E_CASH_STATE_FIXTURES,
  type E2ECashStateKey,
} from '../../../../../../../../packages/database/src/e2e-cash-fixtures';
import { E2E_USER_IDS } from '../../../../../../../../packages/database/src/e2e-role-fixtures';
import { buildCashStatesToSeed } from '../../../../../../../../packages/database/src/seed-golden/cash-states';
import { createMutationCopy } from '../../../../../../../../packages/database/src/testing/mutation-copy';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectRows: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  insertValues: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({ withTenantContext: hoisted.withTenantContext }));

import type { ProtectedActionContext } from '@/lib/safe-action';
import { resubmitCashAttemptCore } from './resubmit-attempt';

function createTx() {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: () => hoisted.selectRows(),
  };
  return {
    select: () => selectChain,
    update: () => ({ set: () => ({ where: hoisted.updateWhere }) }),
    insert: () => ({ values: hoisted.insertValues }),
  };
}

const runId = randomUUID();
function start(key: E2ECashStateKey) {
  const copy = createMutationCopy({
    runId,
    workerId: process.env.VITEST_POOL_ID ?? 'main',
    scenario: key,
  });
  const fixture = E2E_CASH_STATE_FIXTURES[key];
  const source = buildCashStatesToSeed().find(row => row.attempt.id === fixture.attemptId);
  if (!source) throw new Error(`Missing cash catalogue fixture: ${key}`);
  const lead = { ...copy.row(source.lead), email: copy.email(source.lead.email) };
  const attempt = { ...copy.row(source.attempt), leadId: lead.id };
  const authority = mintTestTenantAuthority(lead.tenantId);
  const ctx = {
    authority,
    tenantId: lead.tenantId,
    session: { user: { id: lead.agentId, role: 'agent' } },
  } as unknown as ProtectedActionContext;
  hoisted.selectRows.mockResolvedValue([{ attempt, lead }]);
  hoisted.updateReturning.mockResolvedValue([{ id: attempt.id }]);
  return { attempt, lead, ctx };
}

describe('cash resubmission from isolated catalogue rows (mocked DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.updateWhere.mockReturnValue({ returning: hoisted.updateReturning });
    hoisted.withTenantContext.mockImplementation(
      (_context: unknown, callback: (tx: ReturnType<typeof createTx>) => Promise<unknown>) =>
        callback(createTx())
    );
  });

  it('keeps the assigned-agent check under the session tenant authority', async () => {
    const { attempt, lead, ctx } = start('NEEDS_INFO');
    hoisted.selectRows.mockResolvedValueOnce([
      { attempt, lead: { ...lead, agentId: E2E_USER_IDS.KS_AGENT } },
    ]);
    await expect(
      resubmitCashAttemptCore(ctx, { attemptId: attempt.id, note: 'retry' })
    ).rejects.toThrow('Only the assigned agent can resubmit this verification.');
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(ctx.authority, expect.any(Function));
    expect(hoisted.updateWhere).not.toHaveBeenCalled();
    expect(hoisted.insertValues).not.toHaveBeenCalled();
  });

  it.each(['NEEDS_INFO', 'REJECTED'] as const)(
    'resubmits %s once and denies a sequential replay',
    async key => {
      const { attempt, lead, ctx } = start(key);
      const input = { attemptId: attempt.id, note: 'retry' };
      await expect(resubmitCashAttemptCore(ctx, input)).resolves.toEqual({ success: true });
      expect(hoisted.withTenantContext).toHaveBeenCalledWith(ctx.authority, expect.any(Function));
      const predicate = new PgDialect().sqlToQuery(hoisted.updateWhere.mock.calls[0][0]);
      expect(predicate.sql).toBe(
        '("lead_payment_attempts"."id" = $1 and "lead_payment_attempts"."tenant_id" = $2 and "lead_payment_attempts"."status" in ($3, $4))'
      );
      expect(predicate.params).toEqual([attempt.id, lead.tenantId, 'needs_info', 'rejected']);
      // The next lookup models committed state, without claiming a real rollback or race proof.
      hoisted.selectRows.mockResolvedValue([{ attempt: { ...attempt, status: 'pending' }, lead }]);
      await expect(resubmitCashAttemptCore(ctx, input)).rejects.toThrow(
        'Cannot resubmit verification with status: pending'
      );
      expect(hoisted.updateWhere).toHaveBeenCalledTimes(1);
      expect(hoisted.insertValues).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          tenantId: lead.tenantId,
          entityId: attempt.id,
          action: 'PAYMENT_RESUBMITTED',
        })
      );
      expect(E2E_CASH_STATE_FIXTURES[key].attemptStatus).toBe(attempt.status);
    }
  );
  it('refuses a CAS loser without a changed row or audit', async () => {
    const { attempt, ctx } = start('NEEDS_INFO');
    hoisted.updateReturning.mockResolvedValueOnce([]);

    await expect(
      resubmitCashAttemptCore(ctx, { attemptId: attempt.id, note: 'retry' })
    ).rejects.toThrow('This payment attempt was just decided by someone else. Reload and retry.');

    expect(hoisted.updateWhere).toHaveBeenCalledTimes(1);
    expect(hoisted.updateReturning).toHaveBeenCalledTimes(1);
    expect(hoisted.insertValues).not.toHaveBeenCalled();
  });
});
