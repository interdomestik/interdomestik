import { describe, expect, it } from 'vitest';
import {
  renderPaymentFailedEmail,
  renderPaymentFinalWarningEmail,
  renderPaymentReminderEmail,
} from './dunning';

const params = {
  memberName: 'Member <name>',
  planName: 'Individual Plan',
  gracePeriodDays: 14,
  daysRemaining: 7,
  gracePeriodEndDate: '2026-11-20',
};
const renderers = [
  renderPaymentFailedEmail,
  renderPaymentReminderEmail,
  renderPaymentFinalWarningEmail,
];

describe('dunning template variants', () => {
  it.each(renderers)('preserves the ordinary variant when the flag is absent or false', render => {
    expect(render({ ...params, accessContinues: false })).toEqual(render(params));
    expect(render(params).text).toMatch(/Access expires|ACCESS EXPIRES/);
  });

  it.each(renderers)('keeps payment facts and removes every loss-of-access claim', render => {
    const mail = render({ ...params, accessContinues: true });
    expect(mail.text).toContain('Individual Plan');
    expect(mail.text).toContain('2026-11-20');
    expect(mail.text).toContain('Payment grace period ends');
    expect(mail.text).toContain('/member/membership');
    expect(mail.text).not.toMatch(
      /access|benefits|suspend|re-subscribe|expires tomorrow|interruption/i
    );
    expect(mail.html).toContain('Member &lt;name&gt;');
    expect(mail.html).not.toContain('Member <name>');
  });

  it.each([
    ['en', 'Payment pending'],
    ['sq', 'Pagesë në pritje'],
    ['mk', 'Плаќање на чекање'],
    ['sr', 'Plaćanje na čekanju'],
    ['de', 'Zahlung ausstehend'],
  ])('provides payment-only copy for %s', (locale, title) => {
    for (const render of renderers) {
      const mail = render({ ...params, locale, accessContinues: true });
      expect(mail.subject).toContain(title);
      expect(mail.text).toContain(params.planName);
      expect(mail.text).toContain(params.gracePeriodEndDate);
    }
  });

  it('uses the existing English default for an unsupported locale', () => {
    expect(renderPaymentFailedEmail({ ...params, accessContinues: true, locale: 'xx' })).toEqual(
      renderPaymentFailedEmail({ ...params, accessContinues: true, locale: 'en' })
    );
  });
});
