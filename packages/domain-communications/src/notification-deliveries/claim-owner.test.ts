import type { TenantTransaction } from '@interdomestik/database';
import {
  notificationDeliveries,
  notificationPreviewRestrictions,
  notifications,
} from '@interdomestik/database/schema';
import { describe, expect, it, vi } from 'vitest';
import { CLAIM_MAIL_COPY } from '../claim-mail';
import {
  enqueueClaimMessageNotification,
  enqueueClaimStatusNotification,
  enqueueClaimSubmittedNotification,
  enqueueRecoveryDecisionNotification,
  lockClaimNotificationRecipient,
} from './claim-owner';
import { enqueueSupportHandoffResponseNotification } from './support-handoff';

const recipient = { id: 'owner', role: 'agent', emailVerified: true };
const claim = { tenantId: 'tenant', claimId: 'claim', recipient, title: 'Owner claim title' };

function setup(results: object[][] = []) {
  const lock = vi.fn();
  const select = vi.fn(() => ({
    from: () => ({
      where: () => {
        const rows = Promise.resolve(results.shift() ?? []);
        return Object.assign(rows, {
          for: (kind: string) => {
            lock(kind);
            return rows;
          },
        });
      },
    }),
  }));
  const values = vi.fn().mockImplementation((rows: { id?: string } | Array<{ id?: string }>) => ({
    onConflictDoNothing: () => ({
      returning: () =>
        Promise.resolve((Array.isArray(rows) ? rows : [rows]).map(row => ({ id: row.id }))),
    }),
  }));
  const insert = vi.fn((_table: unknown) => ({ values }));
  return { tx: { select, insert } as unknown as TenantTransaction, insert, values, lock };
}

/** The rows written to `table`, in statement order (a statement may write one row or a batch). */
function rowsFor(h: ReturnType<typeof setup>, table: unknown): unknown[] {
  return h.insert.mock.calls.flatMap(([target], index) => {
    if (target !== table) return [];
    const written: unknown = h.values.mock.calls[index][0];
    return Array.isArray(written) ? written : [written];
  });
}

describe('claim owner notification producers', () => {
  it('locks the claim owner without filtering out other tenant roles', async () => {
    const h = setup([[recipient]]);
    await expect(
      lockClaimNotificationRecipient(h.tx, claim.tenantId, recipient.id)
    ).resolves.toEqual(recipient);
    expect(h.lock).toHaveBeenCalledExactlyOnceWith('share');
  });

  it('stores the unverified submitter’s inbox row and queues no mail', async () => {
    const h = setup();
    const ids = await enqueueClaimSubmittedNotification(h.tx, {
      ...claim,
      recipient: { ...recipient, emailVerified: false },
    });
    expect(ids).toEqual([]);
    expect(h.insert.mock.calls).toEqual([[notifications], [notificationPreviewRestrictions]]);
    expect(rowsFor(h, notifications)).toEqual([
      expect.objectContaining({
        id: 'ntf_claim-submitted:claim:in_app',
        userId: recipient.id,
        type: 'claim_submitted',
        actionUrl: '/member/claims/claim',
        content: 'Update on: Owner claim title',
      }),
    ]);
    expect(rowsFor(h, notifications)[0]).not.toHaveProperty('previewRestricted');
    expect(rowsFor(h, notificationPreviewRestrictions)).toEqual([
      { tenantId: 'tenant', notificationId: 'ntf_claim-submitted:claim:in_app', restricted: false },
    ]);
  });

  it('records a status change for the owner of any role and one push delivery per subscription', async () => {
    const h = setup([[{ claimUpdates: true }], [{ id: 'one' }, { id: 'two' }]]);
    const ids = await enqueueClaimStatusNotification(h.tx, {
      ...claim,
      fromStatus: 'submitted',
      toStatus: 'evaluation',
      lifecycleVersion: 2,
    });
    expect(h.insert.mock.calls).toEqual([
      [notifications],
      [notificationPreviewRestrictions],
      [notificationDeliveries],
      [notificationDeliveries],
      [notificationDeliveries],
    ]);
    expect(rowsFor(h, notifications)[0]).toMatchObject({
      id: 'ntf_claim-status:claim:2:in_app',
      userId: recipient.id,
      type: 'claim_status_changed',
      actionUrl: '/member/claims/claim',
      content: 'Update on: Owner claim title',
    });
    expect(rowsFor(h, notificationDeliveries)).toMatchObject(
      ['email', 'push:one', 'push:two'].map((channel, index) => ({
        id: ids[index],
        recipientUserId: recipient.id,
        facts: { fromStatus: 'submitted', toStatus: 'evaluation' },
        idempotencyKey: `claim-status:claim:2:${channel}`,
      }))
    );
  });

  it('omits inbox and delivery rows on a same-status call', async () => {
    const h = setup();
    await expect(
      enqueueClaimStatusNotification(h.tx, {
        ...claim,
        fromStatus: 'submitted',
        toStatus: 'submitted',
        lifecycleVersion: 2,
      })
    ).resolves.toEqual([]);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('keys verified recovery mail to the immutable decision event', async () => {
    const h = setup();
    await enqueueRecoveryDecisionNotification(h.tx, {
      ...claim,
      decision: 'declined',
      decisionDomainEventId: 'event',
    });
    expect(rowsFor(h, notifications)[0]).toMatchObject({
      id: 'ntf_claim-recovery-decision:event:in_app',
      type: 'escalation_declined',
      actionUrl: '/member/claims/claim',
      title: 'Recovery declined',
    });
    expect(rowsFor(h, notificationDeliveries)[0]).toMatchObject({
      facts: { decision: 'declined' },
      idempotencyKey: 'claim-recovery-decision:event:email',
    });
  });

  it('persists only the restricted catalogue copy for a branch-manager inbox row', async () => {
    const h = setup([[{ locale: 'mk' }], [{ messages: false }]]);
    await enqueueClaimMessageNotification(h.tx, {
      ...claim,
      recipient: { ...recipient, role: 'branch_manager' },
      messageId: 'reply',
    });
    expect(rowsFor(h, notificationPreviewRestrictions)).toEqual([
      { tenantId: 'tenant', notificationId: 'ntf_new_message_reply', restricted: true },
    ]);
    expect(rowsFor(h, notifications)[0]).toMatchObject({
      id: 'ntf_new_message_reply',
      title: CLAIM_MAIL_COPY.mk.messages.claim_message_to_member.restricted.heading,
      content: CLAIM_MAIL_COPY.mk.messages.claim_message_to_member.restricted.body,
    });
    expect(rowsFor(h, notificationDeliveries)[0]).toMatchObject({
      facts: { previewRestricted: true },
      idempotencyKey: 'claim-message:reply:email',
    });
  });

  it('marks an eligible member claim-message preview as unrestricted', async () => {
    const h = setup([[{ messages: false }]]);
    await enqueueClaimMessageNotification(h.tx, {
      ...claim,
      recipient: { ...recipient, role: 'member' },
      messageId: 'reply',
    });
    expect(rowsFor(h, notificationPreviewRestrictions)).toEqual([
      { tenantId: 'tenant', notificationId: 'ntf_new_message_reply', restricted: false },
    ]);
    expect(rowsFor(h, notifications)[0]).toMatchObject({
      id: 'ntf_new_message_reply',
      content: 'Update on: Owner claim title',
    });
    expect(rowsFor(h, notificationDeliveries)[0]).toMatchObject({
      facts: { previewRestricted: false },
      idempotencyKey: 'claim-message:reply:email',
    });
  });

  it('writes only an inbox row for a handoff response and a link in the member’s locale', async () => {
    const h = setup([[{ locale: 'mk' }]]);
    await enqueueSupportHandoffResponseNotification(h.tx, 'tenant', 'owner', {
      id: 'handoff',
      responseVersion: 3,
    });
    expect(h.insert.mock.calls).toEqual([[notifications], [notificationPreviewRestrictions]]);
    expect(rowsFor(h, notifications)).toEqual([
      {
        id: 'ntf_support_handoff_tenant_handoff_3',
        tenantId: 'tenant',
        userId: 'owner',
        type: 'support_handoff_public_response',
        actionUrl: '/mk/member/help?handoffId=handoff',
        title: 'Staff update available',
        content: 'A staff update is available on your support request.',
      },
    ]);
    expect(rowsFor(h, notificationPreviewRestrictions)).toEqual([
      {
        tenantId: 'tenant',
        notificationId: 'ntf_support_handoff_tenant_handoff_3',
        restricted: false,
      },
    ]);
  });
});
