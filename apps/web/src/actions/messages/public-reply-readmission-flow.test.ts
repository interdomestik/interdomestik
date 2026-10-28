/** In-memory model only; not PostgreSQL/RLS attestation. */
import { beforeEach, describe, expect, it } from 'vitest';
import { errors, reply, noNotification } from './public-reply-flow.test-setup';
import { ids, reset, session, settle, state } from './public-reply-notification-flow.fixture';
import { cleanupSubscriptions } from './public-reply-notification-flow.data';
import { logMessageAuditEvent } from './audit.core';
import { notifyPublicReplyCore } from './public-reply-notification.core';

describe('S8 adapter re-admission and commit boundary', () => {
  beforeEach(() => {
    reset('restricted');
    state.rows.claimMessages.push({
      id: 'saved-message',
      tenantId: ids.tenant,
      claimId: ids.claim,
      senderId: ids.staff,
      content: 'Committed public reply',
      isInternal: false,
    });
  });
  const prepare = (overrides: Record<string, unknown> = {}) =>
    notifyPublicReplyCore({
      session: session(),
      claimId: ids.claim,
      messageId: 'saved-message',
      expectedRecipientId: ids.member,
      ...overrides,
    });
  it('deduplicates the same committed message before scheduling external delivery', async () => {
    await prepare();
    await prepare();
    expect(state.rows.notifications).toHaveLength(1);
    expect(state.jobs).toHaveLength(1);
    expect(state.external).toEqual([]);
    await settle();
    expect(state.external).toHaveLength(1);
  });
  it('rejects a recipient different from the admitted case owner', async () => {
    await prepare({ expectedRecipientId: ids.foreign });
    noNotification();
  });
  it('rejects a missing tenant without entering a transaction', async () => {
    await prepare({ session: session('staff', { tenantId: undefined }) });
    noNotification();
    expect(state.contexts).toEqual([]);
  });
  it.each(['member', 'agent', 'branch_manager'])('rejects a %s notification actor', async role => {
    await prepare({ session: session(role) });
    noNotification();
  });
  it.each(['sender', 'internal', 'claim', 'tenant'])(
    'rejects a mismatched %s on the persisted message',
    async field => {
      const message = state.rows.claimMessages[0];
      if (field === 'sender') message.senderId = ids.agent;
      if (field === 'internal') message.isInternal = true;
      if (field === 'claim') message.claimId = 'claim-b';
      if (field === 'tenant') message.tenantId = ids.otherTenant;
      await prepare();
      noNotification();
    }
  );
  it('rolls back a failed notification insert and schedules no delivery', async () => {
    state.notificationFault = true;
    await prepare();
    noNotification();
    expect(state.rollbacks).toBe(1);
    expect(state.rows.claimMessages).toHaveLength(1);
  });
  it('keeps a persisted reply successful when its optional notification fails', async () => {
    state.rows.claimMessages = [];
    state.notificationFault = true;
    expect(await reply()).toMatchObject({ success: true });
    noNotification();
    expect(state.rows.claimMessages).toHaveLength(1);
  });
  it('keeps the notification when optional push preparation rolls back', async () => {
    state.pushFault = true;
    await prepare();
    await settle();
    expect(state.rows.notifications).toHaveLength(1);
    expect(state.rollbacks).toBe(1);
    expect(state.external[0]).toMatchObject({ args: [{ pushSubscriptions: [] }] });
    expect(errors).toHaveBeenCalledWith('Failed to load public reply push subscriptions:', {
      name: 'Error',
    });
  });
  it('does not disclose an unverified recipient email in the delivery plan', async () => {
    state.rows.user.find(row => row.id === ids.member)!.emailVerified = false;
    await prepare();
    await settle();
    expect(state.rows.notifications).toHaveLength(1);
    expect(state.external[0]).toMatchObject({ args: [{ verifiedEmail: null }] });
  });
  it('respects disabled push preferences in the scoped delivery snapshot', async () => {
    state.rows.userNotificationPreferences.push({
      id: 'pref',
      tenantId: ids.tenant,
      userId: ids.member,
      pushMessages: false,
    });
    state.rows.pushSubscriptions.push({
      id: 'sub',
      tenantId: ids.tenant,
      userId: ids.member,
      endpoint: 'https://push.example.test/own',
      p256dh: 'synthetic',
      auth: 'synthetic',
    });
    await prepare();
    await settle();
    expect(state.external[0]).toMatchObject({ args: [{ pushSubscriptions: [] }] });
  });
});

it('cleans only an expired planned endpoint through the actual scoped cleanup callback', async () => {
  reset('restricted');
  state.rows.claimMessages.push({
    id: 'saved-cleanup',
    tenantId: ids.tenant,
    claimId: ids.claim,
    senderId: ids.staff,
    content: 'Reply',
    isInternal: false,
  });
  state.rows.pushSubscriptions.push(...cleanupSubscriptions.map(row => ({ ...row })));
  state.reportExpired = [
    'https://push.example.test/own',
    'https://push.example.test/other',
    'https://push.example.test/foreign',
  ];
  await notifyPublicReplyCore({
    session: session(),
    claimId: ids.claim,
    messageId: 'saved-cleanup',
    expectedRecipientId: ids.member,
  });
  await settle();
  expect(state.rows.pushSubscriptions.map(row => row.id)).toEqual([
    'own-live',
    'other-user',
    'foreign',
  ]);
  expect(state.contexts.at(-1)).toEqual({ tenantId: ids.tenant, role: 'staff' });
  expect(state.auditLoggerPassed).toBe(logMessageAuditEvent);
});
