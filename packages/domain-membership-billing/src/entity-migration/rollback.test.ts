import { describe, expect, it, vi } from 'vitest';

import { rollbackMemberEntityMigration } from './executor';

import type { MemberEntityMigrationWritePort } from './types';

const approval = {
  approvedBy: 'ops-lead',
  kind: 'explicit_waiver' as const,
  reference: 'waiver:T-506:batch-1',
};

function writePort(): MemberEntityMigrationWritePort {
  return {
    withTransaction: vi.fn(async operation => operation()),
    updateSubscriptionLegalEntity: vi.fn(async () => undefined),
    recordTermsAcceptance: vi.fn(async () => undefined),
    appendMigrationHistory: vi.fn(async () => undefined),
    appendEntityMigratedEvent: vi.fn(async () => undefined),
  };
}

function rollbackCommand(activeRecoveryCaseCount = 0) {
  return {
    approval,
    memberId: 'member-1',
    tenantId: 'tenant-home',
    subscriptionId: 'sub-1',
    activeRecoveryCaseCount,
    current: {
      legalTenantId: 'tenant-home',
      legalEntityId: 'le-de',
      governingLawSnapshot: 'DE',
      termsVersionAccepted: 'terms-2026-07',
    },
    previous: {
      legalTenantId: 'tenant-home',
      legalEntityId: 'le-old',
      governingLawSnapshot: 'MK',
      termsVersionAccepted: 'terms-2026-06',
    },
  };
}

describe('member entity migration rollback', () => {
  it('restores the previous legal snapshot with rollback history and event evidence', async () => {
    const port = writePort();
    const payload = await rollbackMemberEntityMigration(rollbackCommand(), port);

    expect(port.withTransaction).toHaveBeenCalledOnce();
    expect(port.updateSubscriptionLegalEntity).toHaveBeenCalledWith({
      subscriptionId: 'sub-1',
      tenantId: 'tenant-home',
      target: expect.objectContaining({ legalEntityId: 'le-old' }),
    });
    expect(port.appendMigrationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: expect.objectContaining({ legalEntityId: 'le-de' }),
        target: expect.objectContaining({ legalEntityId: 'le-old' }),
      })
    );
    expect(payload).toMatchObject({
      activeRecoveryCaseCount: 0,
      migrationMode: 'rollback',
      fromLegalEntityId: 'le-de',
      toLegalEntityId: 'le-old',
    });
  });

  it('blocks rollback when active recovery evidence is not terminal', async () => {
    const port = writePort();

    await expect(rollbackMemberEntityMigration(rollbackCommand(1), port)).rejects.toThrow(
      /active recovery cases/u
    );

    expect(port.withTransaction).not.toHaveBeenCalled();
    expect(port.updateSubscriptionLegalEntity).not.toHaveBeenCalled();
    expect(port.appendEntityMigratedEvent).not.toHaveBeenCalled();
  });
});
