import { beforeEach, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

export const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  persist: vi.fn(),
  translations: vi.fn(),
  after: vi.fn(),
  emailTarget: vi.fn(),
  subscriptions: vi.fn(),
  push: vi.fn(),
  messageEmail: vi.fn(),
  verificationEmail: vi.fn(),
  email: vi.fn(),
  template: vi.fn(),
}));
vi.mock('./recipient-role', () => ({ getNotificationRecipientRole: mocks.role }));
vi.mock('@interdomestik/domain-communications/notifications', () => ({
  sendNotification: mocks.persist,
}));
vi.mock('@/lib/email', () => ({
  sendNewMessageEmail: mocks.messageEmail,
  sendPaymentVerificationEmail: mocks.verificationEmail,
  sendEmail: mocks.email,
}));
vi.mock('@interdomestik/domain-communications/email/templates', () => ({
  buildEmailTemplate: mocks.template,
  DEFAULT_APP_URL: 'https://example.test',
  joinUrl: (base: string, path: string) => base + path,
}));
vi.mock('@interdomestik/domain-communications/messages/send', () => ({
  describePublicReplyFailure: () => ({ name: 'Error' }),
}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('next-intl/server', () => ({ getTranslations: mocks.translations }));
vi.mock('./delivery-targets', () => ({
  loadPreviewEmail: mocks.emailTarget,
  loadPreviewSubscriptions: mocks.subscriptions,
}));
vi.mock('./deliver-preview-push', () => ({ deliverPreviewPush: mocks.push }));

export const authority = {} as TenantAuthority;
export const claim = { id: 'claim', title: 'TITLE-SENTINEL' };
export const verification = {
  leadName: 'Synthetic lead',
  amount: 1000,
  currency: 'EUR',
  status: 'needs_info' as const,
  note: 'NOTE-SENTINEL',
  link: '/agent/leads',
};
export const subscription = { endpoint: 'https://push.example.test', p256dh: 'key', auth: 'auth' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue('member');
  mocks.persist.mockResolvedValue({ success: true });
  mocks.translations.mockResolvedValue((key: string) => `trusted:${key}`);
  mocks.emailTarget.mockResolvedValue('verified@example.test');
  mocks.subscriptions.mockResolvedValue([subscription]);
  mocks.template.mockImplementation(value => value);
});

export function deliver() {
  const callback = mocks.after.mock.calls.at(-1)?.[0] as (() => Promise<void>) | undefined;
  if (!callback) throw new Error('Expected post-commit callback');
  return callback();
}

export function externalCalls() {
  return JSON.stringify([
    ...mocks.messageEmail.mock.calls,
    ...mocks.verificationEmail.mock.calls,
    ...mocks.email.mock.calls,
    ...mocks.push.mock.calls,
  ]);
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
