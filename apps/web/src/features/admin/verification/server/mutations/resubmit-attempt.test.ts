import { isActionFailure } from '@/lib/safe-action.failure';
import { randomUUID } from 'node:crypto';
import {
  E2E_CASH_STATE_FIXTURES,
  type E2ECashStateKey,
} from '../../../../../../../../packages/database/src/e2e-cash-fixtures';
import { E2E_USER_IDS } from '../../../../../../../../packages/database/src/e2e-role-fixtures';
import { buildCashStatesToSeed } from '../../../../../../../../packages/database/src/seed-golden/cash-states';
import { createMutationCopy } from '../../../../../../../../packages/database/src/testing/mutation-copy';
import { SalesClosedError } from '@interdomestik/database/pilot-switch';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectRows: vi.fn(),
  selectFields: vi.fn(),
  selectJoin: vi.fn(),
  selectWhere: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  insertValues: vi.fn(),
  withTenantContext: vi.fn(),
  assertNewSalesOpen: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({ withTenantContext: hoisted.withTenantContext }));
vi.mock('@interdomestik/database/pilot-switch', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database/pilot-switch')>()),
  assertNewSalesOpen: hoisted.assertNewSalesOpen,
}));

import type { ProtectedActionContext } from '@/lib/safe-action';
import { resubmitCashAttemptCore } from './resubmit-attempt';

function createTx() {
  const selectChain = {
    from: () => selectChain,
    innerJoin: hoisted.selectJoin.mockImplementation(() => selectChain),
    where: hoisted.selectWhere.mockImplementation(() => selectChain),
    limit: () => hoisted.selectRows(),
  };
  return {
    select: hoisted.selectFields.mockImplementation(() => selectChain),
    update: () => ({ set: hoisted.updateSet }),
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
  const versionToken = '2026-11-23 09:30:00.123456';
  hoisted.selectRows.mockResolvedValue([{ attempt, lead, versionToken }]);
  hoisted.updateReturning.mockResolvedValue([{ id: attempt.id }]);
  return { attempt, lead, ctx, versionToken };
}

describe('cash resubmission from isolated catalogue rows (mocked DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.assertNewSalesOpen.mockResolvedValue(undefined);
    hoisted.updateSet.mockReturnValue({ where: hoisted.updateWhere });
    hoisted.updateWhere.mockReturnValue({ returning: hoisted.updateReturning });
    hoisted.withTenantContext.mockImplementation(
      (_context: unknown, callback: (tx: ReturnType<typeof createTx>) => Promise<unknown>) =>
        callback(createTx())
    );
  });

  it('refuses a rejected card attempt as missing before any write', async () => {
    const { attempt, lead, ctx } = start('REJECTED');
    const card = { ...attempt, method: 'card' };
    hoisted.selectRows.mockImplementationOnce(() => {
      const predicate = new PgDialect().sqlToQuery(hoisted.selectWhere.mock.calls[0][0]);
      expect(predicate.sql).toBe(
        '("lead_payment_attempts"."id" = $1 and "lead_payment_attempts"."tenant_id" = $2 and "lead_payment_attempts"."method" = $3)'
      );
      expect(predicate.params).toEqual([attempt.id, lead.tenantId, 'cash']);
      return [{ attempt: card, lead }].filter(row => row.attempt.method === predicate.params[2]);
    });

    await expect(resubmitCashAttemptCore(ctx, { attemptId: attempt.id })).rejects.toThrow(
      'Payment attempt not found.'
    );
    expect(hoisted.assertNewSalesOpen).not.toHaveBeenCalled();
    expect(hoisted.updateWhere).not.toHaveBeenCalled();
    expect(hoisted.insertValues).not.toHaveBeenCalled();
  });

  it('returns CLOSED without changing the rejected cash attempt or writing an audit', async () => {
    const { attempt, lead, ctx } = start('REJECTED');
    hoisted.assertNewSalesOpen.mockRejectedValue(new SalesClosedError());

    await expect(resubmitCashAttemptCore(ctx, { attemptId: attempt.id })).rejects.toMatchObject({
      code: 'CLOSED',
    });
    expect(hoisted.assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      lead.tenantId
    );
    expect(hoisted.updateWhere).not.toHaveBeenCalled();
    expect(hoisted.insertValues).not.toHaveBeenCalled();
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

  it('requires the joined lead to belong to the session tenant before checking sales', async () => {
    const { attempt, lead, ctx, versionToken } = start('NEEDS_INFO');
    const foreignLead = { ...lead, tenantId: `${lead.tenantId}-other` };
    hoisted.selectRows.mockImplementationOnce(() => {
      const join = new PgDialect().sqlToQuery(hoisted.selectJoin.mock.calls[0][1]);
      expect(join.sql).toBe(
        '("lead_payment_attempts"."lead_id" = "member_leads"."id" and "member_leads"."tenant_id" = $1)'
      );
      expect(join.params).toEqual([ctx.tenantId]);
      return [{ attempt, lead: foreignLead, versionToken }].filter(
        result => result.lead.tenantId === join.params[0]
      );
    });

    await expect(resubmitCashAttemptCore(ctx, { attemptId: attempt.id })).rejects.toThrow(
      'Payment attempt not found.'
    );
    expect(hoisted.assertNewSalesOpen).not.toHaveBeenCalled();
    expect(hoisted.updateWhere).not.toHaveBeenCalled();
    expect(hoisted.insertValues).not.toHaveBeenCalled();
  });

  it.each(['NEEDS_INFO', 'REJECTED'] as const)(
    'resubmits %s once and denies a sequential replay',
    async key => {
      const { attempt, lead, ctx, versionToken } = start(key);
      const input = { attemptId: attempt.id, note: 'retry' };
      await expect(resubmitCashAttemptCore(ctx, input)).resolves.toEqual({ success: true });
      expect(hoisted.assertNewSalesOpen).toHaveBeenCalledBefore(hoisted.updateWhere);
      expect(hoisted.withTenantContext).toHaveBeenCalledWith(ctx.authority, expect.any(Function));
      const dialect = new PgDialect();
      expect(dialect.sqlToQuery(hoisted.selectFields.mock.calls[0][0].versionToken).sql).toBe(
        '"lead_payment_attempts"."updated_at"::text'
      );
      const predicate = dialect.sqlToQuery(hoisted.updateWhere.mock.calls[0][0]);
      expect(predicate.sql).toBe(
        '("lead_payment_attempts"."id" = $1 and "lead_payment_attempts"."tenant_id" = $2 and "lead_payment_attempts"."status" = $3 and "lead_payment_attempts"."updated_at"::text = $4)'
      );
      expect(predicate.params).toEqual([attempt.id, lead.tenantId, attempt.status, versionToken]);
      expect(dialect.sqlToQuery(hoisted.updateSet.mock.calls[0][0].updatedAt).sql).toBe(
        'greatest(clock_timestamp(), "lead_payment_attempts"."updated_at" + interval \'1 microsecond\')'
      );
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
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(hoisted.updateWhere).toHaveBeenCalledTimes(1);
    expect(hoisted.updateReturning).toHaveBeenCalledTimes(1);
    expect(hoisted.insertValues).not.toHaveBeenCalled();
    const error = await hoisted.withTenantContext.mock.results[0].value.catch(
      (failure: unknown) => failure
    );
    expect(isActionFailure(error)).toBe(true);
  });
});
