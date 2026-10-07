import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transition = vi.hoisted(() => ({ pending: false }));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof import('react')>()),
  useTransition: () => [transition.pending, (run: () => void) => run()] as const,
}));
vi.unmock('next-intl');

import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';
import {
  ClaimInformationRequests,
  mocks,
  request,
} from './information-request-component-test-support';

const catalogs = [
  { locale: 'en', messages: en },
  { locale: 'sq', messages: sq },
  { locale: 'mk', messages: mk },
  { locale: 'sr', messages: sr },
];
const cases = catalogs.flatMap(catalog =>
  (['member', 'staff'] as const).map(audience => ({ ...catalog, audience }))
);

function view(
  audience: 'member' | 'staff',
  locale: string,
  messages: typeof en,
  requests: (typeof request)[] | null
) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ClaimInformationRequests
        audience={audience}
        canAcknowledge={audience === 'staff'}
        claimId="claim-1"
        requests={requests}
      />
    </NextIntlClientProvider>
  );
}

const retryButton = (messages: typeof en) =>
  screen.getByRole('button', { name: messages.claims.informationRequests.retryRead });

function expectNoStaffWrites() {
  expect(mocks.acknowledge).not.toHaveBeenCalled();
  expect(mocks.fulfil).not.toHaveBeenCalled();
}

describe('information request read recovery', () => {
  beforeEach(() => {
    transition.pending = false;
  });

  it.each(cases)(
    'offers one deliberate current-route refresh for $audience in $locale',
    ({ audience, locale, messages }) => {
      render(view(audience, locale, messages, null));
      const copy = messages.claims.informationRequests;
      expect(screen.getByRole('status')).toHaveTextContent(copy.loadError);
      expect(screen.queryByTestId('claim-information-request')).not.toBeInTheDocument();

      const retry = retryButton(messages);
      expect(retry).toHaveClass('h-auto', 'max-w-full', 'whitespace-normal', 'break-words');
      retry.focus();
      fireEvent.click(retry);

      expect(mocks.refresh).toHaveBeenCalledOnce();
      expect(mocks.refresh).toHaveBeenCalledWith();
      expect(retry).toHaveFocus();
      expectNoStaffWrites();
    }
  );

  it.each(catalogs)(
    'announces localized pending and ignores duplicate activation in $locale',
    ({ locale, messages }) => {
      transition.pending = true;
      const copy = messages.claims.informationRequests;
      const { rerender } = render(view('member', locale, messages, null));
      const retry = retryButton(messages);
      expect(retry).toHaveAttribute('aria-busy', 'true');
      expect(retry).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('status')).toHaveTextContent(copy.loadingRequests);

      retry.focus();
      fireEvent.click(retry);
      fireEvent.click(retry);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(retry).toHaveFocus();

      transition.pending = false;
      rerender(view('member', locale, messages, null));
      expect(retry).toHaveAttribute('aria-busy', 'false');
      expect(retry).toHaveFocus();
      expect(screen.getByRole('status')).toHaveTextContent(copy.loadError);
      expectNoStaffWrites();
    }
  );

  it('keeps the truthful failure and permits another retry after a failed refresh', () => {
    const { rerender } = render(view('member', 'en', en, null));
    fireEvent.click(retryButton(en));
    rerender(view('member', 'en', en, null));
    fireEvent.click(retryButton(en));

    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent(en.claims.informationRequests.loadError);
    expect(screen.queryByTestId('claim-information-request')).not.toBeInTheDocument();
  });

  it.each(['member', 'staff'] as const)(
    'shows the actual request after a successful refresh for %s',
    audience => {
      const { rerender } = render(view(audience, 'en', en, null));
      fireEvent.click(retryButton(en));
      rerender(view(audience, 'en', en, [request]));

      expect(screen.getByText(request.requestId)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: en.claims.informationRequests.retryRead })
      ).not.toBeInTheDocument();
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expectNoStaffWrites();
    }
  );

  it('renders nothing when the refreshed read is a genuine empty list', () => {
    const { container, rerender } = render(view('member', 'en', en, null));
    fireEvent.click(retryButton(en));
    rerender(view('member', 'en', en, []));

    expect(container).toBeEmptyDOMElement();
  });
});
