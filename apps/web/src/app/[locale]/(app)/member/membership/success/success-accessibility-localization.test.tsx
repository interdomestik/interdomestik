import enMessages from '@/messages/en/membership-success.json';
import mkMessages from '@/messages/mk/membership-success.json';
import sqMessages from '@/messages/sq/membership-success.json';
import srMessages from '@/messages/sr/membership-success.json';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderSuccessPage, resetSuccessHarness, successMocks } from './success-page.test-harness';

const hoisted = successMocks();

describe('MembershipSuccessPage accessibility and localization', () => {
  beforeEach(resetSuccessHarness);
  afterEach(cleanup);

  it('keeps 44px actions in check-status then account order', async () => {
    await renderSuccessPage({});
    const primary = screen.getByRole('link', {
      name: 'membership.success.registered_primary_cta',
    });
    const secondary = screen.getByRole('link', {
      name: 'membership.success.registered_secondary_cta',
    });

    expect(primary.className).toContain('min-h-[44px]');
    expect(secondary.className).toContain('min-h-[44px]');
    expect(
      primary.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('associates helper copy and waits for completed canonical recheck feedback', async () => {
    await renderSuccessPage({});
    const recheck = screen.getByRole('link', {
      name: 'membership.success.registered_primary_cta',
    });
    const helper = screen.getByText('membership.success.registered_helper');

    expect(helper).toHaveAttribute('id', 'membership-status-helper');
    expect(recheck).toHaveAttribute('aria-describedby', 'membership-status-helper');
    recheck.focus();
    fireEvent.click(recheck);
    expect(hoisted.routerReplaceMock).toHaveBeenCalledWith(
      '/en/member/membership/success?check=1',
      { scroll: false }
    );
    expect(recheck).toHaveFocus();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    cleanup();
    await renderSuccessPage({ searchParams: { check: '1' } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'membership.success.registered_recheck_pending'
    );
    expect(hoisted.getActiveSubscriptionMock).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole('link', { name: 'membership.success.registered_primary_cta' })
    );
    expect(hoisted.routerRefreshMock).toHaveBeenCalledOnce();
    expect(hoisted.routerReplaceMock).toHaveBeenCalledOnce();
  });

  it('keeps the exact approved neutral contract aligned in SQ, EN, SR, and MK', () => {
    const expected = {
      sq: [
        'Llogaria juaj është gati',
        'Anëtarësimi ende nuk është konfirmuar',
        'Nuk mund ta konfirmojmë ende një anëtarësi aktive nga kjo faqe. Nëse sapo e përfunduat pagesën, kontrollojeni statusin përsëri pas pak. Përfitimet dhe qasja për hapjen e një rasti bëhen të disponueshme vetëm pasi anëtarësimi të konfirmohet aktiv.',
        'Kontrollo statusin e anëtarësimit',
        'Hap llogarinë time',
        'Kontrollimi i statusit vetëm rifreskon gjendjen. Nuk hap pagesën dhe nuk ju tarifon.',
      ],
      en: [
        'Your account is ready',
        'Membership not yet confirmed',
        "We can't yet confirm an active membership from this page. If you just completed payment, check the status again shortly. Benefits and claim access become available only after membership is confirmed active.",
        'Check membership status',
        'Open my account',
        'Checking the status only refreshes the current status. It does not open the payment page or charge you.',
      ],
      sr: [
        'Vaš nalog je spreman',
        'Članstvo još nije potvrđeno',
        'Još ne možemo da potvrdimo aktivno članstvo sa ove stranice. Ako ste upravo završili plaćanje, proverite status ponovo uskoro. Pogodnosti i pristup prijavi zahteva postaju dostupni tek kada članstvo bude potvrđeno kao aktivno.',
        'Proveri status članstva',
        'Otvori moj nalog',
        'Provera statusa samo osvežava trenutno stanje. Ne otvara postupak plaćanja i ne naplaćuje vam ništa.',
      ],
      mk: [
        'Вашата сметка е подготвена',
        'Членството сè уште не е потврдено',
        'Сè уште не можеме да потврдиме активно членство од оваа страница. Ако штотуку го завршивте плаќањето, проверете го статусот повторно по кратко време. Поволностите и пристапот за поднесување барање стануваат достапни само откако членството ќе биде потврдено како активно.',
        'Провери го статусот на членството',
        'Отвори ја мојата сметка',
        'Проверката на статусот само ја освежува тековната состојба. Не отвора процес за плаќање и не ви наплаќа.',
      ],
    };
    const locales = { sq: sqMessages, en: enMessages, sr: srMessages, mk: mkMessages };

    for (const [locale, messages] of Object.entries(locales)) {
      const copy = messages.membership.success as unknown as Record<string, string>;
      expect(
        [
          copy.registered_title,
          copy.registered_status,
          copy.registered_body,
          copy.registered_primary_cta,
          copy.registered_secondary_cta,
          copy.registered_helper,
        ],
        locale
      ).toEqual(expected[locale as keyof typeof expected]);
    }
  });
});
