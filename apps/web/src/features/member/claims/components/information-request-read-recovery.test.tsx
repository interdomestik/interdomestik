import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// This mock controls pending only; it is not native pending proof. The KS gate spec holds a real
// router.refresh(), presses native Enter and proves duplicate suppression and focus transfer.
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
const outcomes = [
  { outcome: 'populated', requests: [request] },
  { outcome: 'empty', requests: [] as (typeof request)[] },
];
const successes = cases.flatMap(entry => outcomes.map(outcome => ({ ...entry, ...outcome })));
const interactions = ['pointer-retry', 'focus', 'pointer', 'tab', 'removed-focus'] as const;
const ownership = outcomes.flatMap(entry =>
  interactions.map(interaction => ({ ...entry, interaction }))
);

function view(
  audience: 'member' | 'staff',
  locale: string,
  messages: typeof en,
  requests: (typeof request)[] | null,
  draft = false
) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {draft ? <textarea aria-label="Draft message" defaultValue="kept draft" /> : null}
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
const regionFor = (messages: typeof en) =>
  screen.getByRole('region', { name: messages.claims.informationRequests.title });

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
    act(() => retryButton(en).focus());
    fireEvent.click(retryButton(en));
    rerender(view('member', 'en', en, null));
    expect(retryButton(en)).toHaveFocus();
    fireEvent.click(retryButton(en));

    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent(en.claims.informationRequests.loadError);
    expect(screen.queryByTestId('claim-information-request')).not.toBeInTheDocument();
    expect(regionFor(en)).not.toHaveFocus();
  });

  it.each(successes)(
    'focuses the named region after keyboard $outcome success for $audience in $locale',
    ({ audience, locale, messages, outcome, requests }) => {
      const copy = messages.claims.informationRequests;
      const { rerender } = render(view(audience, locale, messages, null, true));
      const region = regionFor(messages);
      const retry = retryButton(messages);
      act(() => retry.focus());
      fireEvent.click(retry);
      rerender(view(audience, locale, messages, requests, true));

      expect(regionFor(messages)).toBe(region);
      expect(region).toHaveFocus();
      expect(region).toHaveAttribute('tabindex', '-1');
      expect(retry).not.toBeInTheDocument();
      expect(screen.queryAllByTestId('claim-information-request')).toHaveLength(requests.length);
      expect(region).toHaveTextContent(outcome === 'empty' ? copy.empty : request.requestId);
      expect(screen.getByRole('textbox', { name: 'Draft message' })).toHaveValue('kept draft');
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expectNoStaffWrites();
    }
  );

  it.each(ownership)(
    'leaves focus with the user after a $interaction before $outcome success',
    ({ requests, interaction }) => {
      const { rerender } = render(view('staff', 'en', en, null, true));
      const retry = retryButton(en);
      const draft = screen.getByRole('textbox', { name: 'Draft message' });
      act(() => retry.focus());
      if (interaction === 'pointer-retry') fireEvent.pointerDown(retry);
      fireEvent.click(retry, { detail: interaction === 'pointer-retry' ? 1 : 0 });
      if (interaction === 'focus' || interaction === 'removed-focus') act(() => draft.focus());
      if (interaction === 'pointer') fireEvent.pointerDown(draft);
      if (interaction === 'tab') fireEvent.keyDown(retry, { key: 'Tab' });
      rerender(view('staff', 'en', en, requests, interaction !== 'removed-focus'));

      expect(regionFor(en)).not.toHaveFocus();
      if (interaction === 'focus') expect(draft).toHaveFocus();
      if (interaction === 'removed-focus') expect(document.body).toHaveFocus();
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expectNoStaffWrites();
    }
  );

  it.each(outcomes)(
    'never focuses the region for an initial or background $outcome read',
    ({ requests }) => {
      const { rerender } = render(view('member', 'en', en, requests));
      expect(regionFor(en)).not.toHaveFocus();
      rerender(view('member', 'en', en, null));
      rerender(view('member', 'en', en, [...requests]));

      expect(regionFor(en)).not.toHaveFocus();
      expect(document.body).toHaveFocus();
      expect(mocks.refresh).not.toHaveBeenCalled();
    }
  );
});
