import { describe, expect, it, vi } from 'vitest';
import { auditLog, claimMessages } from '@interdomestik/database';
import {
  SAFE_FAILURE,
  TERMINAL_CLAIM,
  expectNoResourceAccess,
  insertedInto,
  mocks,
  signIn,
  tenant,
  useTenantTx,
} from './ops-actions-test-setup.spec';
import { markSlaAcknowledged, sendMemberReminder, updateStatus } from './ops-actions';

describe('updateStatus inside the tenant transaction', () => {
  it('runs read, transition and audit on the supplied transaction', async () => {
    signIn({ role: 'super_admin', id: 'admin-7' });

    await expect(updateStatus('claim-1', 'verification', 'en')).resolves.toEqual({
      success: true,
    });

    expect(mocks.transitionInTx).toHaveBeenCalledTimes(1);
    expect(mocks.transitionInTx).toHaveBeenCalledWith(
      tenant.tx,
      expect.objectContaining({
        actor: { id: 'admin-7', role: 'super_admin' },
        claimId: 'claim-1',
        expectedCaseLifecycleState: 'evaluation',
        expectedRecoveryLifecycleState: 'not_started',
        expectedStatus: 'evaluation',
        tenantId: 'tenant-mk',
        toStatus: 'verification',
      })
    );
    expect(insertedInto(auditLog)).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({
          action: 'update_status',
          actorId: 'admin-7',
          entityId: 'claim-1',
          metadata: { previousStatus: 'evaluation', newStatus: 'verification' },
          tenantId: 'tenant-mk',
        }),
      }),
    ]);
  });

  it('rejects an illegal graph transition before the canonical command runs', async () => {
    signIn({ role: 'admin' });

    await expect(updateStatus('claim-1', 'draft', 'en')).resolves.toEqual({
      success: false,
      error: 'Illegal transition from evaluation to draft',
    });
    expect(mocks.transitionInTx).not.toHaveBeenCalled();
    expect(insertedInto(auditLog)).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('reports a canonical transition rejection without audit or revalidation', async () => {
    signIn({ role: 'admin' });
    mocks.transitionInTx.mockResolvedValueOnce({ success: false, error: 'transition_rejected' });

    await expect(updateStatus('claim-1', 'negotiation', 'en')).resolves.toEqual({
      success: false,
      error: 'Illegal transition from evaluation to negotiation',
    });
    expect(insertedInto(auditLog)).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('markSlaAcknowledged inside the tenant transaction', () => {
  it('writes the internal note and audit on the same transaction', async () => {
    signIn({ role: 'tenant_admin', id: 'admin-7' });

    await expect(markSlaAcknowledged('claim-1', 'en')).resolves.toEqual({ success: true });

    expect(tenant.effects.map(effect => effect.kind)).toEqual([
      'lock:update',
      'read:claim',
      'insert',
      'insert',
    ]);
    expect(insertedInto(claimMessages)).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({
          claimId: 'claim-1',
          content: '⚡ SLA Breach Acknowledged',
          isInternal: true,
          senderId: 'admin-7',
          tenantId: 'tenant-mk',
        }),
      }),
    ]);
    expect(insertedInto(auditLog)).toHaveLength(1);
  });

  it('denies a terminal claim without effects', async () => {
    useTenantTx({ claim: TERMINAL_CLAIM });
    signIn({ role: 'admin' });

    await expect(markSlaAcknowledged('claim-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Cannot perform sla_ack on a terminal claim.',
    });
    expect(tenant.effects.filter(effect => effect.kind === 'insert')).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sanitizes an in-transaction audit failure without revalidation or retry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useTenantTx({ failInsertInto: auditLog });
    signIn({ role: 'admin' });

    const result = await markSlaAcknowledged('claim-1', 'en');

    // Rollback of the earlier note insert is a database property proven only on the restricted
    // Postgres fixture; this asserts the action propagates the failure out of the transaction.
    expect(result).toEqual(SAFE_FAILURE);
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('jane.member@example.test');
    expect(logged).not.toContain('claim_messages');
    consoleError.mockRestore();
  });

  it('keeps a committed acknowledgement truthful when revalidation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.revalidatePath.mockImplementationOnce(() => {
      throw new Error('revalidate failed');
    });
    signIn({ role: 'admin' });

    await expect(markSlaAcknowledged('claim-1', 'en')).resolves.toEqual({
      success: true,
      message: 'Saved. Reload the page if the latest state is not shown.',
    });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(insertedInto(claimMessages)).toHaveLength(1);
    expect(insertedInto(auditLog)).toHaveLength(1);
    consoleError.mockRestore();
  });
});

describe('sendMemberReminder inside the tenant transaction', () => {
  it('locks the claim row, then records one internal note and audit only', async () => {
    signIn({ role: 'admin', id: 'admin-7' });

    await expect(sendMemberReminder('claim-1', 'sms', 'en')).resolves.toEqual({ success: true });

    expect(tenant.effects.map(effect => effect.kind)).toEqual([
      'lock:update',
      'read:claim',
      'read:lastReminder',
      'insert',
      'insert',
    ]);
    const [note] = insertedInto(claimMessages);
    expect(note?.values).toMatchObject({
      claimId: 'claim-1',
      isInternal: true,
      senderId: 'admin-7',
    });
    expect(String(note?.values?.content)).toContain('no automatic delivery');
    expect(String(note?.values?.content)).not.toMatch(/\bsent\b/i);
    expect(insertedInto(auditLog)).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({
          action: 'send_reminder',
          metadata: { channel: 'sms', delivery: 'internal_record_only' },
        }),
      }),
    ]);
  });

  it.each([0, 3, 9])(
    'rate-limits a repeat recorded %i minutes ago without new effects',
    async minutesAgo => {
      useTenantTx({ lastReminderAt: new Date(Date.now() - minutesAgo * 60_000 - 1_000) });
      signIn({ role: 'admin' });

      await expect(sendMemberReminder('claim-1', 'email', 'en')).resolves.toEqual({
        success: false,
        error: `Rate limited. Last reminder recorded ${minutesAgo} minutes ago.`,
      });
      expect(tenant.effects.filter(effect => effect.kind === 'insert')).toEqual([]);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );

  it('records again once the cooldown window has elapsed', async () => {
    useTenantTx({ lastReminderAt: new Date(Date.now() - 11 * 60_000) });
    signIn({ role: 'admin' });

    await expect(sendMemberReminder('claim-1', 'email', 'en')).resolves.toEqual({
      success: true,
    });
    expect(insertedInto(claimMessages)).toHaveLength(1);
    expect(insertedInto(auditLog)).toHaveLength(1);
  });

  it('rejects an untrusted runtime channel before any resource access', async () => {
    signIn({ role: 'admin' });

    await expect(sendMemberReminder('claim-1', 'fax' as never, 'en')).resolves.toEqual({
      success: false,
      error: 'Invalid reminder channel',
    });
    expectNoResourceAccess();
  });

  it('denies a terminal claim after taking the lock, without effects', async () => {
    useTenantTx({ claim: TERMINAL_CLAIM });
    signIn({ role: 'admin' });

    await expect(sendMemberReminder('claim-1', 'email', 'en')).resolves.toEqual({
      success: false,
      error: 'Cannot perform poke on a terminal claim.',
    });
    expect(tenant.effects.filter(effect => effect.kind === 'insert')).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
