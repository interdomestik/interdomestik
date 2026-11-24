import { acceptanceMocks, memberUser } from './member-acceptance-denial.test-support';

import { describe, expect, it, vi } from 'vitest';
import { getMemberActivities } from '@/actions/activities.core';
import { getAuthorizedActivityRequest } from '@/actions/activities/context.core';
import { getFreeStartDraftAccount, listFreeStartDrafts } from '@/actions/free-start-drafts';
import { resolveFreeStartDraftSession } from '@/actions/free-start-drafts/session.core';
import { getMemberReferralCardData } from '@/actions/member-referrals';
import { getActionContext as referralsContext } from '@/actions/member-referrals/context.core';
import { getMessagesForClaim, sendMessage } from '@/actions/messages';
import { getActionContext as messagesContext } from '@/actions/messages/context.core';
import { getNotifications } from '@/actions/notifications';
import { getAuthorizedActionContext as notificationsContext } from '@/actions/notifications/context.core';
import { cancelSubscription, getPaymentUpdateUrl } from '@/actions/subscription.core';
import { getActionContext as subscriptionContext } from '@/actions/subscription/context.core';
import { getActionContext as handoffsContext } from '@/actions/support-handoffs/context.core';
import { createMemberSupportHandoff } from '@/actions/support-handoffs/create';
import { getNotificationPreferences, updateResidenceCountry } from '@/actions/user-settings';
import { getActionContext as settingsContext } from '@/actions/user-settings/context.core';

const effects = vi.hoisted(() => ({
  messages: vi.fn(),
  send: vi.fn(),
  notifications: vi.fn(),
  payment: vi.fn(),
  cancel: vi.fn(),
  activity: vi.fn(),
  referralLink: vi.fn(),
  referralStats: vi.fn(),
  referralSettings: vi.fn(),
  readSettings: vi.fn(),
  saveCountry: vi.fn(),
  handoff: vi.fn(),
  handoffBranch: vi.fn(),
  draftList: vi.fn(),
  freshSession: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/i18n/routing', () => ({
  redirect: ({ href }: { href: string }) => {
    throw new Error(href);
  },
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: effects.freshSession } } }));
vi.mock('@/app/api/auth/[...all]/neutral-otp-boundary', () => ({
  evaluateNeutralOtpHost: () => true,
}));
vi.mock('@/lib/tenant/tenant-hosts', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/tenant/tenant-hosts')>()),
  resolveDefaultPublicTenantId: (): string => 'tenant_ks',
}));
vi.mock('@interdomestik/database/free-start-drafts', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database/free-start-drafts')>()),
  listFreeStartDrafts: effects.draftList,
}));
vi.mock('@/actions/messages/get', () => ({ getMessagesForClaimCore: effects.messages }));
vi.mock('@/actions/messages/send', () => ({ sendMessageCore: effects.send }));
vi.mock('@/actions/notifications/get', () => ({ getNotificationsCore: effects.notifications }));
// The acceptance gate must hold when Paddle reopens; WP-10 tests cover the closed path.
vi.mock('@interdomestik/domain-membership-billing/paddle-closed', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@interdomestik/domain-membership-billing/paddle-closed')
  >()),
  PADDLE_CLOSED: false,
}));
vi.mock('@/actions/subscription/get-payment-update-url', () => ({
  getPaymentUpdateUrlCore: effects.payment,
}));
vi.mock('@/actions/subscription/cancel', () => ({ cancelSubscriptionCore: effects.cancel }));
vi.mock('@interdomestik/domain-activities/get-member', () => ({
  getMemberActivitiesCore: effects.activity,
}));
vi.mock('@/actions/member-referrals/link', () => ({
  getMemberReferralLinkCore: effects.referralLink,
}));
vi.mock('@/actions/member-referrals/stats', () => ({
  getMemberReferralStatsCore: effects.referralStats,
}));
vi.mock('@/actions/member-referrals/settings.core', async importOriginal => ({
  ...(await importOriginal<typeof import('@/actions/member-referrals/settings.core')>()),
  getMemberReferralProgramPreviewCore: effects.referralSettings,
}));
vi.mock('@/actions/user-settings/get', () => ({
  getNotificationPreferencesCore: effects.readSettings,
}));
vi.mock('@/actions/user-settings/update', async importOriginal => ({
  ...(await importOriginal<typeof import('@/actions/user-settings/update')>()),
  updateResidenceCountryCore: effects.saveCountry,
}));
vi.mock('@/actions/support-handoffs/create.core', () => ({
  createMemberSupportHandoffCore: effects.handoff,
}));
vi.mock('@/lib/support-handoffs/staff-session', () => ({
  resolveStaffSupportSessionBranch: effects.handoffBranch,
}));

describe('member acceptance chokepoints', () => {
  it.each([
    messagesContext,
    subscriptionContext,
    handoffsContext,
    settingsContext,
    referralsContext,
    getAuthorizedActivityRequest,
  ])('%o returns a refusal with no authority', async context => {
    await expect(context()).resolves.toMatchObject({
      ok: false,
      authority: null,
      session: null,
      failure: { code: 'acceptance_required' },
    });
    expect(effects.handoffBranch).not.toHaveBeenCalled();
  });

  it('protects message reads and writes and rechecks them after a version change', async () => {
    await expect(getMessagesForClaim('claim')).resolves.toMatchObject({
      error: 'acceptance_required',
    });
    expect(effects.messages).not.toHaveBeenCalled();
    expect(effects.send).not.toHaveBeenCalled();

    acceptanceMocks.readAcceptance.mockResolvedValueOnce({ accepted: true });
    effects.messages.mockResolvedValueOnce({ success: true, messages: [] });
    await expect(getMessagesForClaim('claim')).resolves.toEqual({ success: true, messages: [] });
    expect(effects.messages).toHaveBeenCalledOnce();

    await expect(sendMessage('claim', 'Fixture message')).resolves.toMatchObject({
      error: 'acceptance_required',
    });
    expect(effects.send).not.toHaveBeenCalled();
  });

  it('stops notification reads both at the context and the public action', async () => {
    await expect(notificationsContext()).rejects.toThrow('acceptance_required');
    await expect(getNotifications()).rejects.toThrow('acceptance_required');
    expect(effects.notifications).not.toHaveBeenCalled();
  });

  it('stops subscription lookup and cancellation', async () => {
    await expect(getPaymentUpdateUrl('subscription')).resolves.toMatchObject({
      error: 'acceptance_required',
    });
    await expect(cancelSubscription('subscription')).resolves.toMatchObject({
      error: 'acceptance_required',
    });
    expect(effects.payment).not.toHaveBeenCalled();
    expect(effects.cancel).not.toHaveBeenCalled();
  });

  it('stops the member activity lookup', async () => {
    await expect(getMemberActivities('fixture-member')).rejects.toThrow('acceptance_required');
    expect(effects.activity).not.toHaveBeenCalled();
  });

  it('stops all reads for the member referral card', async () => {
    await expect(getMemberReferralCardData()).resolves.toMatchObject({
      error: 'acceptance_required',
    });
    expect(effects.referralLink).not.toHaveBeenCalled();
    expect(effects.referralStats).not.toHaveBeenCalled();
    expect(effects.referralSettings).not.toHaveBeenCalled();
  });

  it('stops reading preferences and saving country', async () => {
    await expect(getNotificationPreferences()).rejects.toThrow('acceptance_required');
    await expect(updateResidenceCountry('DE')).resolves.toMatchObject({
      error: 'acceptance_required',
    });
    expect(effects.readSettings).not.toHaveBeenCalled();
    expect(effects.saveCountry).not.toHaveBeenCalled();
  });

  it('stops handoff creation before branch resolution or a write', async () => {
    await expect(createMemberSupportHandoff(new FormData())).rejects.toThrow(
      'code=acceptance_required'
    );
    expect(effects.handoffBranch).not.toHaveBeenCalled();
    expect(effects.handoff).not.toHaveBeenCalled();
  });

  it('refuses a fresh Free Start context, account projection and draft read', async () => {
    effects.freshSession.mockResolvedValue({ user: { ...memberUser, emailVerified: true } });
    const refused = { ok: false, code: 'acceptanceRequired' };
    await expect(resolveFreeStartDraftSession(new Headers())).resolves.toEqual(refused);
    await expect(getFreeStartDraftAccount()).resolves.toEqual(refused);
    await expect(listFreeStartDrafts()).resolves.toEqual(refused);
    expect(effects.draftList).not.toHaveBeenCalled();
  });
});
