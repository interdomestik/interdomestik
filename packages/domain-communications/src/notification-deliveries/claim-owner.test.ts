import type { TenantTransaction } from '@interdomestik/database';
import { notificationDeliveries, notifications } from '@interdomestik/database/schema';
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
  const values = vi.fn().mockImplementation(row => ({
    onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: row.id }]) }),
  }));
  const insert = vi.fn(() => ({ values }));
  return { tx: { select, insert } as unknown as TenantTransaction, insert, values, lock };
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
    expect(h.insert).toHaveBeenCalledExactlyOnceWith(notifications);
    expect(h.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ntf_claim-submitted:claim:in_app',
        userId: recipient.id,
        type: 'claim_submitted',
        actionUrl: '/member/claims/claim',
        content: 'Update on: Owner claim title',
      })
    );
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
      [notificationDeliveries],
      [notificationDeliveries],
      [notificationDeliveries],
    ]);
    expect(h.values.mock.calls[0][0]).toMatchObject({
      id: 'ntf_claim-status:claim:2:in_app',
      userId: recipient.id,
      type: 'claim_status_changed',
      actionUrl: '/member/claims/claim',
      content: 'Update on: Owner claim title',
    });
    expect(h.values.mock.calls.slice(1).map(([row]) => row)).toMatchObject(
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
    expect(h.values.mock.calls[0][0]).toMatchObject({
      id: 'ntf_claim-recovery-decision:event:in_app',
      type: 'escalation_declined',
      actionUrl: '/member/claims/claim',
      title: 'Recovery declined',
    });
    expect(h.values.mock.calls[1][0]).toMatchObject({
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
    expect(h.values.mock.calls[0][0]).toMatchObject({
      id: 'ntf_new_message_reply',
      previewRestricted: true,
      title: CLAIM_MAIL_COPY.mk.messages.claim_message_to_member.restricted.heading,
      content: CLAIM_MAIL_COPY.mk.messages.claim_message_to_member.restricted.body,
    });
    expect(h.values.mock.calls[1][0]).toMatchObject({
      facts: { previewRestricted: true },
      idempotencyKey: 'claim-message:reply:email',
    });
  });

  it('writes only an inbox row for a handoff response and a link in the member’s locale', async () => {
    const h = setup([[{ locale: 'mk' }]]);
    await enqueueSupportHandoffResponseNotification(h.tx, 'tenant', 'owner', {
      id: 'handoff',
      responseVersion: 3,
    });
    expect(h.insert).toHaveBeenCalledExactlyOnceWith(notifications);
    expect(h.values).toHaveBeenCalledExactlyOnceWith({
      id: 'ntf_support_handoff_tenant_handoff_3',
      tenantId: 'tenant',
      userId: 'owner',
      type: 'support_handoff_public_response',
      actionUrl: '/mk/member/help?handoffId=handoff',
      title: 'Staff update available',
      content: 'A staff update is available on your support request.',
    });
  });
});
