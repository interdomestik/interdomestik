import type { TenantTransaction } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';
import { CLAIM_MAIL_COPY } from '../claim-mail';
import type { ClaimMailLocale } from '../claim-mail/types';
import { renderDelivery, renderDeliveryPush } from './render';
import { delivery } from './run.test-support';

describe('notification rendering', () => {
  it.each(Object.keys(CLAIM_MAIL_COPY) as ClaimMailLocale[])(
    'localizes both push kinds in %s',
    async locale => {
      const row = {
        ...delivery({ facts: { fromStatus: 'submitted', toStatus: 'evaluation' } }),
        leaseUntil: 'lease',
      };
      const tx = {
        select: () => ({ from: () => ({ where: async () => [{ title: 'Member claim' }] }) }),
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
        expect(status.title).toMatch(/[А-Яа-яЀ-ӿ]/);
        expect(message.title).toMatch(/[А-Яа-яЀ-ӿ]/);
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
            where: async () => [{ senderName: 'Staff member', excerpt: 'Fixture preview' }],
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
