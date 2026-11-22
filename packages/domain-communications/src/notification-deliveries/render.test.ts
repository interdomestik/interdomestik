import type { TenantTransaction } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';
import { CLAIM_MAIL_COPY } from '../claim-mail';
import type { ClaimMailLocale } from '../claim-mail/types';
import { renderDelivery, renderDeliveryPush } from './render';
import type { Delivery } from './types';

function delivery(changes: Partial<Delivery> = {}): Delivery {
  return {
    id: 'delivery',
    tenantId: 'tenant-a',
    claimId: 'claim',
    kind: 'claim_status_changed',
    channel: 'email',
    recipientUserId: 'member',
    subjectMessageId: null,
    pushSubscriptionId: null,
    idempotencyKey: 'key',
    facts: {},
    state: 'queued',
    attempts: 0,
    nextAttemptAt: new Date(0).toISOString(),
    createdAt: new Date(0).toISOString(),
    leaseUntil: null,
    terminalAt: null,
    sentAt: null,
    skipReason: null,
    locale: null,
    transport: null,
    avoidTransport: null,
    lastErrorCode: null,
    lastErrorDetail: null,
    ...changes,
  };
}

describe('notification rendering', () => {
  it.each(Object.keys(CLAIM_MAIL_COPY) as ClaimMailLocale[])(
    'localizes both push kinds in %s',
    async locale => {
      const row = {
        ...delivery({ facts: { fromStatus: 'submitted', toStatus: 'evaluation' } }),
        leaseUntil: 'lease',
      };
      const tx = {
        select: () => ({
          from: () => ({ where: () => Promise.resolve([{ title: 'Member claim' }]) }),
        }),
      } as unknown as TenantTransaction;
      const copy = CLAIM_MAIL_COPY[locale];
      const status = await renderDeliveryPush(tx, row, locale, false);
      expect(status).toEqual({
        title: copy.pushStatusHeading,
        url: `/${locale}/member/claims/claim`,
        body: `Member claim: ${copy.statuses.submitted} → ${copy.statuses.evaluation}`,
      });
      const message = await renderDeliveryPush(
        {} as TenantTransaction,
        { ...row, kind: 'claim_message_to_member' },
        locale,
        true
      );
      expect(message).toEqual({
        title: copy.messages.claim_message_to_member.restricted.heading,
        body: copy.messages.claim_message_to_member.restricted.body,
        url: `/${locale}/member/claims/claim`,
      });
      if (locale === 'mk') {
        expect(status.title).toMatch(/[\u0400-\u04FF]/);
        expect(message.title).toMatch(/[\u0400-\u04FF]/);
      }
    }
  );

  it('renders Macedonian push copy for a member permitted to see the message preview', async () => {
    const row = {
      ...delivery({ kind: 'claim_message_to_member', subjectMessageId: 'message' }),
      leaseUntil: 'lease',
    };
    const tx = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () =>
              Promise.resolve([{ senderName: 'Staff member', excerpt: 'Fixture preview' }]),
          }),
        }),
      }),
    } as unknown as TenantTransaction;

    expect(await renderDeliveryPush(tx, row, 'mk', false)).toEqual({
      title: 'Нова порака за вашето барање',
      body: 'Staff member: Fixture preview',
      url: '/mk/member/claims/claim',
    });
  });

  it.each(Object.keys(CLAIM_MAIL_COPY) as ClaimMailLocale[])(
    'uses the localized sender in %s for email and push when the sender row is outside the tenant',
    async locale => {
      const row = {
        ...delivery({ kind: 'claim_message_to_member', subjectMessageId: 'message' }),
        leaseUntil: 'lease',
      };
      const firstHundred = 'X'.repeat(100);
      const nextSixty = 'Y'.repeat(60);
      const excerpt = firstHundred + nextSixty + 'omitted text';
      const tx = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ title: 'Member claim' }]),
            leftJoin: () => ({ where: () => Promise.resolve([{ senderName: null, excerpt }]) }),
          }),
        }),
      } as unknown as TenantTransaction;

      const mail = await renderDelivery(
        tx,
        row,
        locale,
        'https://example.test',
        'vehicle',
        null,
        false
      );
      expect(mail.text).toContain(CLAIM_MAIL_COPY[locale].genericSender);
      expect(mail.text).toContain(firstHundred + nextSixty);
      expect(mail.text).not.toContain('omitted text');
      const push = await renderDeliveryPush(tx, row, locale, false);
      expect(push.body).toBe(`${CLAIM_MAIL_COPY[locale].genericSender}: ${firstHundred}`);
    }
  );

  it('renders a staff claim without a number from the catalogue', async () => {
    const row = { ...delivery({ kind: 'staff_member_message' }), leaseUntil: 'lease' };
    const mail = await renderDelivery(
      {} as TenantTransaction,
      row,
      'mk',
      'https://example.test',
      'vehicle',
      null,
      false
    );
    expect(mail.text).toContain(CLAIM_MAIL_COPY.mk.claimWithoutNumber);
  });

  it('renders restricted email without reading any private preview', async () => {
    const row = { ...delivery({ kind: 'claim_message_to_member' }), leaseUntil: 'lease' };
    const mail = await renderDelivery(
      {} as TenantTransaction,
      row,
      'mk',
      'https://example.test',
      'vehicle',
      null,
      true
    );
    expect(mail.subject).toBe(
      CLAIM_MAIL_COPY.mk.messages.claim_message_to_member.restricted.subject
    );
  });
});
