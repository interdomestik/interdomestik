import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';

vi.unmock('next-intl');

import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';
import { MemberRecoveryDecisionCard } from './MemberRecoveryDecisionCard';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
}));

it.each([
  { locale: 'en', messages: en },
  { locale: 'sq', messages: sq },
  { locale: 'mk', messages: mk },
  { locale: 'sr', messages: sr },
])(
  'shows a generic integrity decline and support next action in $locale',
  ({ locale, messages }) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <MemberRecoveryDecisionCard
          decision={{
            status: 'declined',
            title: 'Private integrity concern',
            description: 'Private allegation requiring review',
            declineReasonCode: 'other',
          }}
          supportHref="/member/help"
        />
      </NextIntlClientProvider>
    );

    const card = screen.getByTestId('member-claim-recovery-decision');
    const copy = messages.claims.detail.recoveryDecision;
    expect(within(card).getByRole('heading', { name: copy.declinedTitle })).toBeInTheDocument();
    expect(within(card).getByText(copy.reasons.other.title)).toBeInTheDocument();
    expect(within(card).getByText(copy.reasons.other.description)).toBeInTheDocument();
    expect(within(card).getByText(copy.nextAction)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: copy.supportCta })).toHaveAttribute(
      'href',
      '/member/help'
    );
    expect(card).not.toHaveTextContent('Private integrity concern');
    expect(card).not.toHaveTextContent('Private allegation');
  }
);

it('uses qualified time-limit language without presenting a statutory date', () => {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MemberRecoveryDecisionCard
        decision={{
          status: 'declined',
          title: '',
          description: null,
          declineReasonCode: 'time_limit_risk',
        }}
        supportHref="/member/help"
      />
    </NextIntlClientProvider>
  );

  expect(
    screen.getByText(en.claims.detail.recoveryDecision.reasons.time_limit_risk.description)
  ).toBeInTheDocument();
  expect(screen.getByTestId('member-claim-recovery-decision')).not.toHaveTextContent(
    'outside the time limit'
  );
});
